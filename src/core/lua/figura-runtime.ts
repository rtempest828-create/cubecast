import type { LuaFactory } from 'wasmoon'
import type { FiguraAvatar } from '../figura/figura-avatar'
import { ALL_VANILLA } from '../figura/vanilla-scan'
import type { Vec3 } from '../math/vec'
import type { PartNode } from '../model/avatar-model'
import { LuaError, LuaSandbox } from './lua-sandbox'
import apiSource from './prelude/api.lua?raw'
import compatSource from './prelude/compat.lua?raw'
import vectorsSource from './prelude/vectors.lua?raw'

/**
 * Führt die Lua-Skripte eines Figura-Avatars aus (Figura-API-Nachbildung, siehe
 * `docs/COMPATIBILITY.md`). Die Skripte laufen in einer Sandbox ohne Datei- und
 * Netzwerkzugriff; Ergebnis pro Bild ist eine Liste veränderter Teile.
 */

export interface FiguraLuaHost {
  log(level: 'info' | 'warn' | 'error', message: string): void
  /** Steuert eine Blockbench-Animation (play, stop, state, speed …). */
  animation(command: string, id: string, argument: unknown): unknown
  /** Speichert die `config`-Daten des Avatars (JSON). */
  saveConfig(json: string): void
  /** Ist der Chibi-Modus an? (für `vtuber.isChibi()`) */
  isChibi?(): boolean
}

export interface LuaLimits {
  readonly memoryBytes: number
  readonly init: number
  readonly tick: number
  readonly render: number
  readonly event: number
}

/** Großzügig wie Figuras höchste Vertrauensstufe; schützt vor Endlosschleifen. */
export const DEFAULT_LUA_LIMITS: LuaLimits = { memoryBytes: 64 * 1024 * 1024, init: 5_000_000, tick: 1_000_000, render: 1_000_000, event: 500_000 }

export type LuaPartKind = 'GROUP' | 'CUBE' | 'MESH' | 'VANILLA'

/** Veränderung eines Teils durch Lua, bereits in unserem Modellraum (additiv wie eine Pose). */
export interface LuaPartPose {
  readonly partId: string
  readonly kind: LuaPartKind
  readonly rotation: Vec3
  readonly position: Vec3
  readonly scale: Vec3
  /** null = nicht verändert (Sichtbarkeit aus dem Modell). */
  readonly visible: boolean | null
  readonly uvOffset: readonly [number, number]
}

export interface PlayerState {
  /** Kopfneigung (Grad, positiv = nach unten wie in Minecraft). */
  readonly pitch: number
  readonly yaw: number
  readonly crouch: boolean
  readonly sprint: boolean
  readonly walk: boolean
  readonly sleep: boolean
  readonly health: number
}

export interface WheelAction {
  readonly index: number
  readonly title: string
  readonly item: string
  readonly color: string | null
  readonly toggled: boolean
  readonly toggleable: boolean
  readonly scrollable: boolean
  readonly rightClick: boolean
}

export interface WheelState {
  readonly title: string | null
  readonly actions: readonly WheelAction[]
}

export interface LuaStats {
  readonly initInstructions: number
  readonly tickInstructions: number
  readonly renderInstructions: number
  readonly memoryBytes: number
}

interface SetupPart {
  id: string
  name: string
  kind: LuaPartKind
  parent: number
  rot: number[]
  pivot: number[]
  visible: boolean
  uvw: number
  uvh: number
  vanilla?: string
}

/** Unser Raum → Blockbench-Raum (x und z gespiegelt; für Drehungen x und z umgekehrt). */
const toBb = (v: Vec3): number[] => [-v[0], v[1], -v[2]]

/** Baut die Teileliste (Eltern vor Kindern) für die Lua-Seite. */
export function buildLuaParts(avatar: FiguraAvatar): { parts: SetupPart[]; models: { path: string; root: number }[] } {
  const parts: SetupPart[] = []
  const models: { path: string; root: number }[] = []
  for (const model of avatar.models) {
    const texture = model.textures[0]
    const uvw = texture?.uvWidth ?? 16
    const uvh = texture?.uvHeight ?? 16
    const visit = (node: PartNode, parent: number): number => {
      parts.push({ id: node.id, name: node.name, kind: 'GROUP', parent, rot: toBb(node.rotation), pivot: toBb(node.pivot), visible: node.visible, uvw, uvh })
      const index = parts.length
      // Würfel, die wegen mehrerer Texturen aufgeteilt wurden („id#1“), sind in Lua ein Teil.
      const seen = new Set<string>()
      for (const cube of node.cubes) {
        const base = cube.id.replace(/#\d+$/, '')
        if (seen.has(base)) continue
        seen.add(base)
        parts.push({ id: base, name: cube.name, kind: 'CUBE', parent: index, rot: toBb(cube.rotation ?? [0, 0, 0]), pivot: toBb(cube.origin ?? node.pivot), visible: cube.visible !== false, uvw, uvh })
      }
      for (const mesh of node.meshes ?? []) {
        const base = mesh.id.replace(/#\d+$/, '')
        if (seen.has(base)) continue
        seen.add(base)
        parts.push({ id: base, name: mesh.name, kind: 'MESH', parent: index, rot: [0, 0, 0], pivot: toBb(node.pivot), visible: mesh.visible, uvw, uvh })
      }
      for (const child of node.children) visit(child, index)
      return index
    }
    models.push({ path: model.root.name, root: visit(model.root, 0) })
  }
  for (const id of ALL_VANILLA) parts.push({ id: `vanilla.${id}`, name: id, kind: 'VANILLA', parent: 0, rot: [0, 0, 0], pivot: [0, 0, 0], visible: true, uvw: 64, uvh: 64, vanilla: id })
  return { parts, models }
}

const num = (v: number): string => (Number.isFinite(v) ? String(v) : '0')

export interface RuntimeOptions {
  readonly host: FiguraLuaHost
  readonly playerName: string
  readonly slim: boolean
  /** Gespeicherte `config`-Daten (JSON) oder leer. */
  readonly configJson: string
  readonly limits?: LuaLimits
}

export class FiguraLuaRuntime {
  private readonly partIds: string[]
  private readonly partKinds: LuaPartKind[]
  private stats = { initInstructions: 0, tickInstructions: 0, renderInstructions: 0 }

  private constructor(
    private readonly sandbox: LuaSandbox,
    parts: SetupPart[],
    private readonly limits: LuaLimits
  ) {
    this.partIds = parts.map((p) => p.id)
    this.partKinds = parts.map((p) => p.kind)
  }

  /** Lädt Bibliotheken und Avatar-Daten; die Skripte laufen erst mit `init()`. */
  static async create(factory: LuaFactory, avatar: FiguraAvatar, options: RuntimeOptions): Promise<FiguraLuaRuntime> {
    const limits = options.limits ?? DEFAULT_LUA_LIMITS
    const sandbox = await LuaSandbox.create(factory, limits.memoryBytes)
    const { parts, models } = buildLuaParts(avatar)
    const runtime = new FiguraLuaRuntime(sandbox, parts, limits)
    try {
      const scripts: Record<string, string> = {}
      for (const script of avatar.scripts) scripts[script.path.replace(/\.lua$/i, '')] = script.source
      sandbox.set('__vt_js', {
        log: (level: unknown, message: unknown) => options.host.log(level === 'warn' || level === 'error' ? level : 'info', String(message)),
        // wasmoon verträgt kein `null` als Rückgabewert – undefined wird zu nil.
        anim: (command: unknown, id: unknown, argument: unknown) => options.host.animation(String(command), String(id), argument) ?? undefined,
        configSave: (json: unknown) => options.host.saveConfig(String(json)),
        now: () => Date.now(),
        chibi: () => options.host.isChibi?.() === true,
        instructions: () => sandbox.instructionsUsed
      })
      sandbox.set('__vt_setup', {
        parts,
        models,
        animations: avatar.animations.map((clip) => ({ id: clip.id, model: clip.modelPath, name: clip.name })),
        scripts,
        autoScripts: avatar.autoScripts ?? [],
        configJson: options.configJson,
        playerName: options.playerName,
        modelType: options.slim ? 'SLIM' : 'DEFAULT',
        avatar: { name: avatar.name, authors: avatar.authors.join(', '), color: avatar.color ?? '#5AAAFF' }
      })
      sandbox.run(compatSource, '=compat.lua', 5_000_000)
      sandbox.run(vectorsSource, '=vectors.lua', 5_000_000)
      sandbox.run(apiSource, '=api.lua', 20_000_000)
      sandbox.lockDown()
    } catch (error) {
      sandbox.close()
      throw error
    }
    return runtime
  }

  /** Führt die Skripte aus (autoScripts oder alle) und löst ENTITY_INIT aus. */
  init(): void {
    this.sandbox.run('__vt.init()', '=init', this.limits.init)
    this.stats.initInstructions = this.sandbox.instructionsUsed
  }

  setState(state: PlayerState): void {
    const b = (v: boolean): string => (v ? 'true' : 'false')
    this.sandbox.run(
      `__vt.state(${num(state.pitch)}, ${num(state.yaw)}, ${b(state.crouch)}, ${b(state.sprint)}, ${b(state.walk)}, ${b(state.sleep)}, ${num(state.health)})`,
      '=state',
      this.limits.event
    )
  }

  tick(): void {
    this.sandbox.run('__vt.tick()', '=tick', this.limits.tick)
    this.stats.tickInstructions = this.sandbox.instructionsUsed
  }

  render(delta: number): void {
    this.sandbox.run(`__vt.render(${num(Math.min(1, Math.max(0, delta)))})`, '=render', this.limits.render)
    this.stats.renderInstructions = this.sandbox.instructionsUsed
  }

  /** Veränderte Teile, in unseren Modellraum umgerechnet. */
  collect(): LuaPartPose[] {
    const text = this.sandbox.run('return __vt.collect()', '=collect', this.limits.event)
    if (typeof text !== 'string' || text === '') return []
    const values = text.split(',').map(Number)
    const out: LuaPartPose[] = []
    for (let i = 0; i + 12 < values.length; i += 13) {
      const index = (values[i] ?? 0) - 1
      const partId = this.partIds[index]
      const kind = this.partKinds[index]
      if (partId === undefined || kind === undefined) continue
      const v = (k: number): number => values[i + k] ?? 0
      const visible = v(10)
      out.push({
        partId,
        kind,
        // Blockbench → unser Raum (siehe parse-bbmodel.ts)
        rotation: [-v(1), v(2), -v(3)],
        position: [-v(4), v(5), -v(6)],
        scale: [v(7), v(8), v(9)],
        visible: visible < 0 ? null : visible > 0,
        uvOffset: [v(11), v(12)]
      })
    }
    return out
  }

  private withArgument<T>(value: string, code: string, limit: number): T {
    this.sandbox.set('__vt_arg', value)
    return this.sandbox.run(code, '=event', limit) as T
  }

  /** Taste gedrückt/losgelassen (Name wie „key.keyboard.b“, GLFW-Code). Liefert true, wenn ein Skript sie abfängt. */
  key(name: string, glfwCode: number, down: boolean): boolean {
    return this.withArgument<unknown>(name, `return __vt.key(__vt_arg, ${num(glfwCode)}, ${down ? 'true' : 'false'})`, this.limits.event) === true
  }

  chat(message: string): void {
    this.withArgument(message, '__vt.chat(__vt_arg)', this.limits.event)
  }

  timeline(script: string): void {
    this.withArgument(script, '__vt.timeline(__vt_arg)', this.limits.event)
  }

  wheel(): WheelState {
    const json = this.sandbox.run('return __vt.wheel()', '=wheel', this.limits.event)
    try {
      const parsed = JSON.parse(typeof json === 'string' ? json : '{}') as { title?: unknown; actions?: unknown }
      const actions = Array.isArray(parsed.actions) ? (parsed.actions as WheelAction[]) : []
      return { title: typeof parsed.title === 'string' ? parsed.title : null, actions }
    } catch {
      return { title: null, actions: [] }
    }
  }

  wheelClick(index: number, right: boolean): void {
    this.sandbox.run(`__vt.wheelClick(${num(index)}, ${right ? 'true' : 'false'})`, '=wheel', this.limits.event)
  }

  wheelScroll(index: number, direction: number): void {
    this.sandbox.run(`__vt.wheelScroll(${num(index)}, ${num(direction)})`, '=wheel', this.limits.event)
  }

  keybinds(): { name: string; key: string }[] {
    const json = this.sandbox.run('return __vt.keybinds()', '=keybinds', this.limits.event)
    try {
      const parsed: unknown = JSON.parse(typeof json === 'string' ? json : '[]')
      return Array.isArray(parsed) ? (parsed as { name: string; key: string }[]) : []
    } catch {
      return []
    }
  }

  getStats(): LuaStats {
    return { ...this.stats, memoryBytes: this.sandbox.memoryUsed }
  }

  dispose(): void {
    this.sandbox.close()
  }
}

export { LuaError }
