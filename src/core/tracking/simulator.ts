import { BLENDSHAPE_NAMES } from './blendshapes'
import { deriveSignals, DERIVED_SIGNALS, HEAD_SIGNALS, type Signals } from './signals'
import type { HeadRotation } from './types'

/**
 * Tracking-Simulator: Schieberegler ersetzen oder ergänzen die Webcam.
 * - `webcam`: nur echte Werte
 * - `manual`: nur Regler (nicht bewegte Regler = 0)
 * - `mixed`: echte Werte, aber bewegte Regler überschreiben ihren Kanal
 */
export type SignalSourceMode = 'webcam' | 'manual' | 'mixed'

export interface LiveInputs {
  /** Blendshapes aus Sicht der Figur oder null (kein Gesicht/keine Kamera). */
  readonly blendshapes: Readonly<Record<string, number>> | null
  readonly head: HeadRotation
}

const DERIVED = new Set<string>(DERIVED_SIGNALS)

export function composeSignals(
  live: LiveInputs,
  manual: Readonly<Record<string, number>>,
  overridden: ReadonlySet<string>,
  mode: SignalSourceMode
): Signals {
  const useManual = (name: string): boolean => mode === 'manual' || (mode === 'mixed' && overridden.has(name))
  const pick = (name: string, liveValue: number): number => (useManual(name) ? (manual[name] ?? 0) : mode === 'manual' ? 0 : liveValue)

  // 1. Grundwerte mischen
  const blend: Record<string, number> = {}
  for (const name of BLENDSHAPE_NAMES) blend[name] = pick(name, live.blendshapes?.[name] ?? 0)
  const head: Record<string, number> = {
    'head.yaw': pick('head.yaw', live.head.yaw),
    'head.pitch': pick('head.pitch', live.head.pitch),
    'head.roll': pick('head.roll', live.head.roll)
  }

  // 2. Abgeleitete Signale aus den gemischten Grundwerten – außer der Regler steuert sie direkt
  const derived = deriveSignals(blend)
  for (const name of DERIVED) {
    if (useManual(name) && name in manual) derived[name] = manual[name] ?? 0
  }
  return { ...blend, ...head, ...derived }
}

/** Alle Kanäle, die der Simulator anbietet. */
export const SIMULATOR_CHANNELS: readonly string[] = [
  ...HEAD_SIGNALS,
  'gaze.x',
  'gaze.y',
  ...BLENDSHAPE_NAMES.filter((name) => name !== '_neutral')
]
