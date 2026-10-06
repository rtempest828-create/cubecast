import type { Vec3 } from '../math/vec'
import { compileExpression, ExpressionError, type CompiledExpression, type ExpressionDialect, type ExpressionVars } from './expression'

/**
 * Blockbench-Animationen (Teil `animations` einer `.bbmodel`-Datei).
 *
 * Werte bleiben im Blockbench-Raum (Grad bzw. Pixel, wie im Editor angezeigt); die
 * Umrechnung in unseren Modellraum passiert beim Anwenden (`player.ts`).
 */

export type Channel = 'rotation' | 'position' | 'scale'
export type Interpolation = 'linear' | 'catmullrom' | 'bezier' | 'step'
export type LoopMode = 'loop' | 'once' | 'hold'

export const LOOP_MODES: readonly LoopMode[] = ['loop', 'once', 'hold']

type ExprVec = readonly [CompiledExpression, CompiledExpression, CompiledExpression]

export interface Keyframe {
  readonly time: number
  readonly interpolation: Interpolation
  /** Wert beim Ankommen (erster Datenpunkt). */
  readonly pre: ExprVec
  /** Wert beim Verlassen (zweiter Datenpunkt bei Sprüngen, sonst gleich `pre`). */
  readonly post: ExprVec
  readonly bezierLeftTime: Vec3
  readonly bezierLeftValue: Vec3
  readonly bezierRightTime: Vec3
  readonly bezierRightValue: Vec3
}

export interface Track {
  readonly partId: string
  readonly channel: Channel
  /** Nach Zeit sortiert. */
  readonly keyframes: readonly Keyframe[]
}

export interface TimelineEntry {
  readonly time: number
  readonly script: string
}

export interface AnimationClip {
  /** Eindeutig im Avatar, z. B. „model.winken“ (wie Figuras `animations.model.winken`). */
  readonly id: string
  readonly name: string
  readonly modelPath: string
  /** Länge in Sekunden (mindestens die Zeit des letzten Keyframes). */
  readonly length: number
  readonly loop: LoopMode
  /** Ersetzt die Bewegung der animierten Teile (Tracking, Leerlauf) statt sie zu ergänzen. */
  readonly override: boolean
  readonly startDelay: number
  readonly loopDelay: number
  /** Stärke aus Blockbench („Blend Weight“), Standard 1. */
  readonly blend: number
  readonly tracks: readonly Track[]
  /** Timeline-Skripte (Lua-Code an Zeitpunkten der Animation). */
  readonly timeline: readonly TimelineEntry[]
  /** Anzahl der Sound- und Partikel-Keyframes (werden nicht abgespielt). */
  readonly effectCount: number
}

export interface ParseAnimationOptions {
  readonly modelPath: string
  readonly partIdByUuid: ReadonlyMap<string, string>
  /** Ersatz, falls eine Animation eine Gruppe nur per Name anspricht. */
  readonly partIdByName: ReadonlyMap<string, string>
  readonly dialect: ExpressionDialect
}

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown, fallback: number): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}
const vec = (v: unknown, fallback: number): Vec3 =>
  Array.isArray(v) ? [finite(v[0], fallback), finite(v[1], fallback), finite(v[2], fallback)] : [fallback, fallback, fallback]

const CHANNELS = new Set<string>(['rotation', 'position', 'scale'])
const INTERPOLATIONS = new Set<string>(['linear', 'catmullrom', 'bezier', 'step'])

/** Zeitangaben wie „start_delay“ dürfen Zahlen oder Zahl-Texte sein; Ausdrücke werden hier noch nicht unterstützt. */
function seconds(value: unknown, label: string, warnings: string[]): number {
  if (value === undefined || value === null || value === '') return 0
  const n = finite(value, Number.NaN)
  if (Number.isNaN(n)) {
    warnings.push(`${label}: Ausdruck „${String(value)}“ wird als 0 gerechnet.`)
    return 0
  }
  return Math.max(0, n)
}

function parseKeyframe(raw: Json, channel: Channel, dialect: ExpressionDialect, problems: Set<string>): Keyframe | null {
  const time = finite(raw['time'], Number.NaN)
  if (!Number.isFinite(time) || !Array.isArray(raw['data_points']) || raw['data_points'].length === 0) return null
  const fallback = channel === 'scale' ? 1 : 0
  const compile = (value: unknown): CompiledExpression => {
    if (value === undefined || value === null || value === '') return compileExpression(fallback, dialect)
    try {
      const compiled = compileExpression(typeof value === 'number' ? value : String(value), dialect)
      for (const name of compiled.unknown) problems.add(`unbekannt: ${name}`)
      return compiled
    } catch (error) {
      problems.add(error instanceof ExpressionError ? `„${String(value)}“: ${error.message}` : String(error))
      return compileExpression(fallback, dialect)
    }
  }
  const point = (p: unknown): ExprVec => {
    const d = isRecord(p) ? p : {}
    return [compile(d['x']), compile(d['y']), compile(d['z'])]
  }
  const points = raw['data_points'] as unknown[]
  const pre = point(points[0])
  const interpolation = typeof raw['interpolation'] === 'string' && INTERPOLATIONS.has(raw['interpolation']) ? (raw['interpolation'] as Interpolation) : 'linear'
  return {
    time: Math.max(0, time),
    interpolation,
    pre,
    post: points.length > 1 ? point(points[1]) : pre,
    bezierLeftTime: vec(raw['bezier_left_time'], -0.1),
    bezierLeftValue: vec(raw['bezier_left_value'], 0),
    bezierRightTime: vec(raw['bezier_right_time'], 0.1),
    bezierRightValue: vec(raw['bezier_right_value'], 0)
  }
}

/**
 * Liest alle Animationen eines Modells. Fehlerhafte Teile werden übersprungen bzw. durch 0
 * ersetzt und als Warnung gemeldet – eine kaputte Animation verhindert nie das Laden.
 */
export function parseAnimations(raw: readonly unknown[], options: ParseAnimationOptions): { clips: AnimationClip[]; warnings: string[] } {
  const clips: AnimationClip[] = []
  const warnings: string[] = []
  const usedIds = new Set<string>()

  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const name = typeof entry['name'] === 'string' && entry['name'].trim() ? entry['name'].trim() : `animation${clips.length + 1}`
    const label = `Animation „${name}“`
    let id = `${options.modelPath}.${name}`
    for (let n = 2; usedIds.has(id); n++) id = `${options.modelPath}.${name}~${n}`
    usedIds.add(id)

    const tracks: Track[] = []
    const problems = new Set<string>()
    let effectCount = 0
    const timeline: TimelineEntry[] = []
    let lastKey = 0
    const animators = isRecord(entry['animators']) ? entry['animators'] : {}
    for (const [key, value] of Object.entries(animators)) {
      if (!isRecord(value)) continue
      const keyframes = Array.isArray(value['keyframes']) ? value['keyframes'].filter(isRecord) : []
      if (value['type'] === 'effect' || key === 'effects') {
        for (const k of keyframes) {
          const point = Array.isArray(k['data_points']) && isRecord(k['data_points'][0]) ? k['data_points'][0] : {}
          const time = finite(k['time'], Number.NaN)
          if (k['channel'] === 'timeline' && typeof point['script'] === 'string' && point['script'].trim() && Number.isFinite(time)) {
            timeline.push({ time: Math.max(0, time), script: point['script'] })
          } else if (k['channel'] !== 'timeline') {
            effectCount++
          }
        }
        continue
      }
      const partId = options.partIdByUuid.get(key) ?? (typeof value['name'] === 'string' ? options.partIdByName.get(value['name']) : undefined)
      if (!partId) {
        warnings.push(`${label}: Gruppe „${String(value['name'] ?? key)}“ gibt es im Modell nicht – übersprungen.`)
        continue
      }
      for (const channel of CHANNELS) {
        const frames = keyframes
          .filter((k) => k['channel'] === channel)
          .map((k) => parseKeyframe(k, channel as Channel, options.dialect, problems))
          .filter((k): k is Keyframe => k !== null)
          .sort((a, b) => a.time - b.time)
        if (frames.length === 0) continue
        lastKey = Math.max(lastKey, frames[frames.length - 1]!.time)
        tracks.push({ partId, channel: channel as Channel, keyframes: frames })
      }
    }
    for (const problem of problems) warnings.push(`${label}: ${problem} (als 0 gerechnet).`)

    const loop = LOOP_MODES.includes(entry['loop'] as LoopMode) ? (entry['loop'] as LoopMode) : 'once'
    clips.push({
      id,
      name,
      modelPath: options.modelPath,
      length: Math.max(finite(entry['length'], 0), lastKey),
      loop,
      override: entry['override'] === true,
      startDelay: seconds(entry['start_delay'], label, warnings),
      loopDelay: seconds(entry['loop_delay'], label, warnings),
      blend: (() => {
        const b = entry['blend_weight']
        return b === undefined || b === '' ? 1 : finite(b, 1)
      })(),
      tracks,
      timeline: timeline.sort((a, b) => a.time - b.time),
      effectCount
    })
  }
  return { clips, warnings }
}

// ---------------------------------------------------------------------------
// Abtasten

const evalVec = (v: ExprVec, vars: ExpressionVars): Vec3 => [v[0].evaluate(vars), v[1].evaluate(vars), v[2].evaluate(vars)]

/** Catmull-Rom wie Blockbench (`THREE.SplineCurve`, gleichmäßige Parametrisierung). */
function catmullRom(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const v0 = (p2 - p0) * 0.5
  const v1 = (p3 - p1) * 0.5
  const t2 = t * t
  const t3 = t * t2
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1
}

function cubic(a: number, b: number, c: number, d: number, s: number): number {
  const u = 1 - s
  return u * u * u * a + 3 * u * u * s * b + 3 * u * s * s * c + s * s * s * d
}

/** Bézier zwischen zwei Keyframes: erst den Kurvenparameter zur Zeit suchen, dann den Wert berechnen. */
function bezier(time: number, t0: number, t1: number, t2: number, t3: number, v0: number, v1: number, v2: number, v3: number): number {
  // Zeit-Griffe begrenzen, damit die Kurve in der Zeit monoton bleibt.
  const h1 = Math.min(Math.max(t1, t0), t3)
  const h2 = Math.min(Math.max(t2, t0), t3)
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (cubic(t0, h1, h2, t3, mid) < time) lo = mid
    else hi = mid
  }
  return cubic(v0, v1, v2, v3, (lo + hi) / 2)
}

/** Wert einer Spur zur Zeit `time` (Blockbench-Raum). */
export function sampleTrack(track: Track, time: number, vars: ExpressionVars): Vec3 {
  const frames = track.keyframes
  let afterIndex = frames.findIndex((k) => k.time > time + 1e-6)
  if (afterIndex === -1) afterIndex = frames.length
  const before = frames[afterIndex - 1]
  const after = frames[afterIndex]
  if (!before) return evalVec(after!.pre, vars)
  if (!after) return evalVec(before.post, vars)

  const alpha = (time - before.time) / (after.time - before.time)
  const from = evalVec(before.post, vars)
  const to = evalVec(after.pre, vars)
  if (before.interpolation === 'step') return from

  if (before.interpolation === 'catmullrom' || after.interpolation === 'catmullrom') {
    const prev = frames[afterIndex - 2]
    const next = frames[afterIndex + 1]
    const p0 = prev ? evalVec(prev.post, vars) : from
    const p3 = next ? evalVec(next.pre, vars) : to
    return [0, 1, 2].map((i) => catmullRom(alpha, p0[i]!, from[i]!, to[i]!, p3[i]!)) as unknown as Vec3
  }

  if (before.interpolation === 'bezier' || after.interpolation === 'bezier') {
    return [0, 1, 2].map((i) => {
      // Griffe zählen nur an Keyframes, die selbst auf Bézier stehen.
      const rightTime = before.interpolation === 'bezier' ? before.bezierRightTime[i]! : 0
      const rightValue = before.interpolation === 'bezier' ? before.bezierRightValue[i]! : 0
      const leftTime = after.interpolation === 'bezier' ? after.bezierLeftTime[i]! : 0
      const leftValue = after.interpolation === 'bezier' ? after.bezierLeftValue[i]! : 0
      return bezier(time, before.time, before.time + rightTime, after.time + leftTime, after.time, from[i]!, from[i]! + rightValue, to[i]! + leftValue, to[i]!)
    }) as unknown as Vec3
  }

  return [from[0] + (to[0] - from[0]) * alpha, from[1] + (to[1] - from[1]) * alpha, from[2] + (to[2] - from[2]) * alpha]
}
