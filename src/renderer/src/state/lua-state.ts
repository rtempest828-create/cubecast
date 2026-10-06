import { effect, signal } from '@preact/signals'
import { LuaFactory } from 'wasmoon'
import luaWasmUrl from 'wasmoon/dist/glue.wasm?url'
import { keyFromBrowser } from '@core/lua/apply-lua'
import { FiguraLuaRuntime, LuaError, type LuaPartPose, type LuaStats, type PlayerState, type WheelState } from '@core/lua/figura-runtime'
import { logger } from '@core/log/logger'
import type { Signals } from '@core/tracking/signals'
import { t } from '@shared/i18n'
import { luaAnimationCommand } from './animation-state'
import { loadedFigura, loadedSkin, luaControlsVanilla, pushToast } from './app-state'
import { avatarKey, rig, updateRig } from './rig-state'

/**
 * Lua-Laufzeit des geladenen Figura-Avatars: Start/Stopp, Takt (20 Ticks/s + jedes Bild),
 * Tastatur, Aktionsrad, Log und Spielzustand (Schleichen, Sprinten …).
 */

export type LuaStatus =
  | { readonly kind: 'none' }
  | { readonly kind: 'off' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'running' }
  | { readonly kind: 'error'; readonly message: string }

export interface LuaLogEntry {
  readonly id: number
  readonly time: number
  readonly level: 'info' | 'warn' | 'error'
  readonly message: string
}

export interface GameState {
  readonly crouch: boolean
  readonly walk: boolean
  readonly sprint: boolean
  readonly sleep: boolean
}

export const luaStatus = signal<LuaStatus>({ kind: 'none' })
export const luaLog = signal<readonly LuaLogEntry[]>([])
export const luaWheel = signal<WheelState>({ title: null, actions: [] })
export const luaKeybinds = signal<readonly { name: string; key: string }[]>([])
export const luaStats = signal<LuaStats | null>(null)
export const gameState = signal<GameState>({ crouch: false, walk: false, sprint: false, sleep: false })

const MAX_LOG = 300
const TICK_SECONDS = 1 / 20
let factory: LuaFactory | null = null
let runtime: FiguraLuaRuntime | null = null
let startToken = 0
let tickAccumulator = 0
let logId = 0
let hurtUntil = 0
let configKey: string | null = null
let configTimer: ReturnType<typeof setTimeout> | null = null

function hasBridge(): boolean {
  return typeof window !== 'undefined' && 'vtuber' in window
}

function appendLog(level: LuaLogEntry['level'], message: string): void {
  const entry: LuaLogEntry = { id: ++logId, time: Date.now(), level, message: message.slice(0, 2000) }
  luaLog.value = [...luaLog.peek().slice(-(MAX_LOG - 1)), entry]
  if (level !== 'info') logger.log(level, 'Lua', message.slice(0, 300))
}

export function clearLuaLog(): void {
  luaLog.value = []
}

function stopRuntime(): void {
  runtime?.dispose()
  runtime = null
  luaControlsVanilla.value = false
  luaWheel.value = { title: null, actions: [] }
  luaKeybinds.value = []
  luaStats.value = null
}

function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  appendLog('error', message)
  luaStatus.value = { kind: 'error', message: message.split('\n')[0] ?? message }
  pushToast('error', t((error instanceof LuaError && error.limit) ? 'lua.toast.limit' : 'lua.toast.error'))
  stopRuntime()
}

/** Ruft die Lua-Laufzeit geschützt auf; ein Fehler stoppt die Skripte (wie in Figura). */
function guarded<T>(fn: (r: FiguraLuaRuntime) => T): T | undefined {
  if (!runtime) return undefined
  try {
    return fn(runtime)
  } catch (error) {
    fail(error)
    return undefined
  }
}

function refreshUi(): void {
  guarded((r) => {
    luaWheel.value = r.wheel()
    luaKeybinds.value = r.keybinds()
  })
}

function saveConfig(json: string): void {
  const key = configKey
  if (!key || !hasBridge()) return
  if (configTimer) clearTimeout(configTimer)
  configTimer = setTimeout(() => {
    configTimer = null
    try {
      void window.vtuber.avatarConfig.save(key, { version: 1, data: JSON.parse(json) as unknown })
    } catch {
      appendLog('warn', 'config: Daten konnten nicht gespeichert werden.')
    }
  }, 300)
}

async function startRuntime(token: number): Promise<void> {
  const figura = loadedFigura.peek()
  const key = avatarKey.peek()
  if (!figura || !key) return
  if (figura.avatar.scripts.length === 0) {
    luaStatus.value = { kind: 'none' }
    return
  }
  luaStatus.value = { kind: 'loading' }
  configKey = `${key}-config`
  try {
    factory ??= new LuaFactory(luaWasmUrl)
    const stored = hasBridge() ? await window.vtuber.avatarConfig.load(configKey) : null
    const configData = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>)['data'] : null
    const source = loadedSkin.peek().source
    const created = await FiguraLuaRuntime.create(factory, figura.avatar, {
      host: {
        log: appendLog,
        animation: luaAnimationCommand,
        saveConfig
      },
      playerName: source.kind === 'player' ? source.name : 'Spieler',
      slim: loadedSkin.peek().skin.detectedModel === 'slim',
      configJson: configData ? JSON.stringify(configData) : ''
    })
    if (token !== startToken) {
      created.dispose()
      return
    }
    runtime = created
    tickAccumulator = 0
    created.init()
    luaControlsVanilla.value = true
    luaStatus.value = { kind: 'running' }
    refreshUi()
  } catch (error) {
    if (token === startToken) fail(error)
  }
}

/** Neu starten (z. B. nach einem Fehler oder nach Änderungen an den Skripten). */
export function restartLua(): void {
  const token = ++startToken
  stopRuntime()
  if (rig.peek().luaEnabled === false) {
    luaStatus.value = { kind: 'off' }
    return
  }
  void startRuntime(token)
}

export function setLuaEnabled(enabled: boolean): void {
  updateRig({ ...rig.peek(), luaEnabled: enabled })
  restartLua()
}

// Neuer Avatar bzw. Zuordnung geladen → Lua (neu) starten.
effect(() => {
  const key = avatarKey.value
  const figura = loadedFigura.value
  const token = ++startToken
  stopRuntime()
  if (!figura) {
    luaStatus.value = { kind: 'none' }
    return
  }
  if (!key) return
  if (rig.peek().luaEnabled === false) {
    luaStatus.value = { kind: 'off' }
    return
  }
  void startRuntime(token)
})

// ---------------------------------------------------------------------------
// Takt (aus runtime.ts)

function playerState(signals: Signals, now: number): PlayerState {
  const game = gameState.peek()
  return {
    // Minecraft: Neigung positiv = nach unten; Drehung positiv = nach rechts (bei uns −yaw).
    pitch: signals['head.pitch'] ?? 0,
    yaw: -(signals['head.yaw'] ?? 0),
    crouch: game.crouch,
    sprint: game.sprint,
    walk: game.walk || game.sprint,
    sleep: game.sleep,
    health: now < hurtUntil ? 14 : 20
  }
}

let lastUiRefresh = 0

/** 20 Ticks pro Sekunde und ein Render-Ereignis pro Bild; liefert die Lua-Änderungen. */
export function stepLua(dtSec: number, signals: Signals, nowMs: number): readonly LuaPartPose[] {
  if (!runtime) return []
  tickAccumulator += dtSec
  let ticks = 0
  while (tickAccumulator >= TICK_SECONDS && ticks < 5) {
    tickAccumulator -= TICK_SECONDS
    ticks++
    guarded((r) => {
      r.setState(playerState(signals, nowMs))
      r.tick()
    })
  }
  if (ticks === 5) tickAccumulator = 0
  guarded((r) => r.render(tickAccumulator / TICK_SECONDS))
  const poses = guarded((r) => r.collect()) ?? []
  if (nowMs - lastUiRefresh > 250) {
    lastUiRefresh = nowMs
    refreshUi()
    luaStats.value = runtime?.getStats() ?? null
  }
  return poses
}

/** Timeline-Skripte aus Animationen ausführen. */
export function runTimeline(scripts: readonly string[]): void {
  for (const script of scripts) guarded((r) => r.timeline(script))
}

// ---------------------------------------------------------------------------
// Bedienung

export function clickWheelAction(index: number, right: boolean): void {
  guarded((r) => r.wheelClick(index, right))
  refreshUi()
}

export function scrollWheelAction(index: number, direction: number): void {
  guarded((r) => r.wheelScroll(index, direction))
  refreshUi()
}

export function sendChat(message: string): void {
  const text = message.trim().slice(0, 256)
  if (!text) return
  guarded((r) => r.chat(text))
  appendLog('info', `[Chat] ${text}`)
}

export function simulateHurt(): void {
  hurtUntil = performance.now() + 1000
}

export function updateGameState(patch: Partial<GameState>): void {
  gameState.value = { ...gameState.peek(), ...patch }
}

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

function onKey(event: KeyboardEvent): void {
  if (!runtime || event.repeat || isTyping(event.target) || event.key === 'F12') return
  const key = keyFromBrowser(event.code)
  if (!key) return
  const down = event.type === 'keydown'
  const consumed = guarded((r) => r.key(key.name, key.glfw, down))
  if (consumed) event.preventDefault()
  refreshUi()
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
}
