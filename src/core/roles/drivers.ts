import type { Signals } from '../tracking/signals'
import { signalInfo } from '../tracking/signals'

/**
 * Treiber: übersetzen ein Tracking-Signal in eine Veränderung eines Teils.
 *
 *   Signal → × Empfindlichkeit → auf [Eingang min, max] normieren (0…1) → ggf. invertieren
 *          → Glättung → auf [Ausgang min, max] abbilden → anwenden (je nach Modus)
 */
export type DriverMode =
  /** Kopfrotation aus dem Head-Tracker (Nicken, Drehen, Neigen). */
  | 'headRotation'
  /** Rotation um eine Achse in Grad. */
  | 'rotation'
  /** Verschiebung entlang einer Achse in Pixeln. */
  | 'position'
  /** Skalierungsfaktor entlang einer Achse. */
  | 'scale'
  /** Sichtbar ab Schwellwert. */
  | 'visibility'
  /** Verschiebung der Textur in Pixeln (u = x, v = y). */
  | 'uvOffset'
  /** Bildwechsel: Anzahl überschrittener Schwellwerte = Bildnummer. */
  | 'textureSwap'
  /** Mund-Logik des Gesichts-Overlays (mehrere Signale, siehe `mouthFrame`). */
  | 'faceMouth'
  /** Feder-/Pendelphysik (ab Meilenstein M4). */
  | 'physics'

export const DRIVER_MODES: readonly DriverMode[] = [
  'headRotation',
  'rotation',
  'position',
  'scale',
  'visibility',
  'uvOffset',
  'textureSwap',
  'faceMouth',
  'physics'
]

export type Axis = 'x' | 'y' | 'z'
export const AXES: readonly Axis[] = ['x', 'y', 'z']

export interface PhysicsSettings {
  readonly strength: number
  readonly damping: number
  readonly axes: readonly Axis[]
}

export interface DriverConfig {
  /** Eindeutig innerhalb eines Teils (für Glättungszustand und UI). */
  readonly id: string
  readonly mode: DriverMode
  readonly source: string
  readonly axis: Axis
  readonly inputMin: number
  readonly inputMax: number
  readonly outputMin: number
  readonly outputMax: number
  readonly invert: boolean
  /** Multipliziert das Signal vor dem Normieren (1 = unverändert). */
  readonly sensitivity: number
  /** 0 = keine Glättung, 1 = stark (Zeitkonstante 0,25 s). */
  readonly smoothing: number
  /** Schwellwerte (0…1) für `textureSwap`, `visibility` und `faceMouth`. */
  readonly thresholds: readonly number[]
  readonly physics: PhysicsSettings
}

/**
 * Schwellwerte der Mund-Logik in fester Reihenfolge:
 * [halb offen, offen, rund („O“), Lächeln, traurig]
 */
export const MOUTH_THRESHOLD_LABELS = ['half', 'open', 'round', 'smile', 'frown'] as const
export const DEFAULT_MOUTH_THRESHOLDS: readonly number[] = [0.12, 0.35, 0.35, 0.35, 0.35]

const DEFAULT_PHYSICS: PhysicsSettings = { strength: 0.5, damping: 0.5, axes: ['x', 'z'] }

const MODE_DEFAULTS: Readonly<Record<DriverMode, Partial<DriverConfig>>> = {
  headRotation: { source: 'head.yaw' },
  rotation: { source: 'mouth.open', axis: 'x', outputMin: 0, outputMax: 20 },
  position: { source: 'mouth.open', axis: 'y', outputMin: 0, outputMax: -1 },
  scale: { source: 'blink.left', axis: 'y', outputMin: 1, outputMax: 0.1 },
  visibility: { source: 'mouth.open', thresholds: [0.5] },
  uvOffset: { source: 'gaze.x', axis: 'x', outputMin: -1, outputMax: 1 },
  textureSwap: { source: 'blink.left', thresholds: [0.35, 0.65] },
  faceMouth: { source: 'mouth.open', thresholds: DEFAULT_MOUTH_THRESHOLDS },
  physics: { source: 'head.yaw' }
}

export function createDriver(mode: DriverMode, overrides: Partial<DriverConfig> = {}): DriverConfig {
  const merged = { ...MODE_DEFAULTS[mode], ...overrides }
  const source = merged.source ?? 'mouth.open'
  const info = signalInfo(source)
  return {
    id: merged.id ?? `${mode}-${Math.random().toString(36).slice(2, 8)}`,
    mode,
    source,
    axis: merged.axis ?? 'y',
    inputMin: merged.inputMin ?? info?.min ?? 0,
    inputMax: merged.inputMax ?? info?.max ?? 1,
    outputMin: merged.outputMin ?? 0,
    outputMax: merged.outputMax ?? 1,
    invert: merged.invert ?? false,
    sensitivity: merged.sensitivity ?? 1,
    smoothing: merged.smoothing ?? 0,
    thresholds: merged.thresholds ?? [],
    physics: merged.physics ?? DEFAULT_PHYSICS
  }
}

/** Normierter Eingang 0…1 (vor Glättung). */
export function driverInput(config: DriverConfig, signals: Signals): number {
  const raw = (signals[config.source] ?? 0) * config.sensitivity
  const span = config.inputMax - config.inputMin
  let t = span === 0 ? 0 : (raw - config.inputMin) / span
  t = Math.max(0, Math.min(1, t))
  return config.invert ? 1 - t : t
}

export function driverOutput(config: DriverConfig, t: number): number {
  return config.outputMin + (config.outputMax - config.outputMin) * t
}

/** Anzahl der erreichten Schwellwerte (Bildnummer bei `textureSwap`). */
export function frameIndex(t: number, thresholds: readonly number[]): number {
  let index = 0
  for (const threshold of thresholds) if (t >= threshold) index++
  return index
}

export type MouthFrame = 'closed' | 'half' | 'open' | 'round' | 'smile' | 'frown'

/**
 * Wählt das Mundbild aus mehreren Signalen. Reihenfolge der Prüfung:
 * rund („O“) vor offen, offen vor Lächeln/traurig.
 */
export function mouthFrame(signals: Signals, thresholds: readonly number[], sensitivity = 1): MouthFrame {
  const [half = 0.12, open = 0.35, round = 0.35, smile = 0.35, frown = 0.35] = thresholds
  const s = (name: string): number => (signals[name] ?? 0) * sensitivity
  const jaw = s('mouth.open')
  if (s('mouth.round') >= round && jaw < open + 0.2) return 'round'
  if (jaw >= open) return 'open'
  if (jaw >= half) return 'half'
  if (s('mouth.smile') >= smile) return 'smile'
  if (s('mouth.frown') >= frown) return 'frown'
  return 'closed'
}

/** Exponentielle Glättung pro Treiber (Zustand zwischen Frames). */
export class DriverSmoother {
  private readonly values = new Map<string, number>()

  smooth(key: string, target: number, smoothing: number, dtSec: number): number {
    const previous = this.values.get(key)
    if (previous === undefined || smoothing <= 0 || dtSec <= 0) {
      this.values.set(key, target)
      return target
    }
    const tau = smoothing * 0.25
    const alpha = 1 - Math.exp(-dtSec / tau)
    const value = previous + (target - previous) * alpha
    this.values.set(key, value)
    return value
  }

  reset(): void {
    this.values.clear()
  }
}
