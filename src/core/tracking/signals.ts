import { BLENDSHAPE_COUNT, BLENDSHAPE_NAMES, type BlendshapeName } from './blendshapes'
import type { HeadRotation } from './types'

/**
 * Tracking-Signale pro Frame, immer aus Sicht der **Figur** („left“ = linke Seite der Figur).
 * Quellen: Blendshapes (0…1), Kopfwinkel (Grad) und abgeleitete Signale.
 * Rollen-Treiber lesen ausschließlich diese Werte – egal ob sie von der Webcam
 * oder aus dem Tracking-Simulator kommen.
 */
export type Signals = Readonly<Record<string, number>>

export type SignalGroup = 'head' | 'derived' | 'blendshape'

export interface SignalInfo {
  readonly name: string
  readonly group: SignalGroup
  readonly min: number
  readonly max: number
}

export const HEAD_SIGNALS = ['head.yaw', 'head.pitch', 'head.roll'] as const

/** Abgeleitete Signale; Bedeutung siehe `deriveSignals`. */
export const DERIVED_SIGNALS = [
  'blink.left',
  'blink.right',
  'gaze.x',
  'gaze.y',
  'brow.left',
  'brow.right',
  'mouth.open',
  'mouth.round',
  'mouth.smile',
  'mouth.frown'
] as const

const SIGNED_DERIVED = new Set<string>(['gaze.x', 'gaze.y', 'brow.left', 'brow.right'])

export const SIGNAL_CATALOG: readonly SignalInfo[] = [
  ...HEAD_SIGNALS.map((name) => ({ name, group: 'head' as const, min: -90, max: 90 })),
  ...DERIVED_SIGNALS.map((name) => ({ name, group: 'derived' as const, min: SIGNED_DERIVED.has(name) ? -1 : 0, max: 1 })),
  ...BLENDSHAPE_NAMES.filter((name) => name !== '_neutral').map((name) => ({ name, group: 'blendshape' as const, min: 0, max: 1 }))
]

const CATALOG_BY_NAME = new Map(SIGNAL_CATALOG.map((info) => [info.name, info]))

export function signalInfo(name: string): SignalInfo | undefined {
  return CATALOG_BY_NAME.get(name)
}

/** Vertauscht „Left“ und „Right“ in einem Blendshape-Namen. */
export function swapSideName(name: string): string {
  if (name.endsWith('Left')) return `${name.slice(0, -4)}Right`
  if (name.endsWith('Right')) return `${name.slice(0, -5)}Left`
  return name
}

export interface BlendshapeOptions {
  /** Figur verhält sich wie ein Spiegelbild (dann gehört dein rechtes Auge zum linken Auge der Figur). */
  readonly mirror: boolean
  /** Korrigiert Modelle, die Links/Rechts aus Bildsicht statt aus Personensicht melden. */
  readonly swapSides: boolean
  /** Ruhewerte aus „Neutrale Pose setzen“ (gleiche Reihenfolge wie `BLENDSHAPE_NAMES`). */
  readonly baseline: Float32Array | null
}

/**
 * Rechnet Ruhewerte heraus (z. B. wenn ein Mikrofon den Mundwinkel verdeckt) und
 * dreht Links/Rechts in die Sicht der Figur.
 */
export function avatarBlendshapes(raw: Float32Array, options: BlendshapeOptions): Record<string, number> {
  const swap = options.mirror !== options.swapSides
  const result: Record<string, number> = {}
  for (let i = 0; i < BLENDSHAPE_COUNT; i++) {
    const name = BLENDSHAPE_NAMES[i]!
    let value = raw[i] ?? 0
    const base = options.baseline?.[i] ?? 0
    // Werte, die schon in Ruhe fast voll sind, nicht normieren (sonst springen sie).
    if (base > 0 && base < 0.9) value = (value - base) / (1 - base)
    result[swap ? swapSideName(name) : name] = Math.max(0, Math.min(1, value))
  }
  return result
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

/**
 * Abgeleitete Signale (alle aus Sicht der Figur):
 * - `blink.*`: Lidschluss 0…1
 * - `gaze.x`: −1…1, positiv = Figur schaut zu ihrer linken Seite (+X)
 * - `gaze.y`: −1…1, positiv = nach oben
 * - `brow.*`: −1…1, positiv = Braue hoch, negativ = runter
 * - `mouth.open/round/smile/frown`: 0…1
 */
export function deriveSignals(b: Readonly<Record<string, number>>): Record<string, number> {
  const v = (name: BlendshapeName): number => b[name] ?? 0
  return {
    'blink.left': v('eyeBlinkLeft'),
    'blink.right': v('eyeBlinkRight'),
    'gaze.x': clamp((v('eyeLookOutLeft') + v('eyeLookInRight') - v('eyeLookInLeft') - v('eyeLookOutRight')) / 2, -1, 1),
    'gaze.y': clamp((v('eyeLookUpLeft') + v('eyeLookUpRight') - v('eyeLookDownLeft') - v('eyeLookDownRight')) / 2, -1, 1),
    'brow.left': clamp((v('browInnerUp') + v('browOuterUpLeft')) / 2 - v('browDownLeft'), -1, 1),
    'brow.right': clamp((v('browInnerUp') + v('browOuterUpRight')) / 2 - v('browDownRight'), -1, 1),
    'mouth.open': v('jawOpen'),
    'mouth.round': Math.max(v('mouthFunnel'), v('mouthPucker')),
    'mouth.smile': (v('mouthSmileLeft') + v('mouthSmileRight')) / 2,
    'mouth.frown': (v('mouthFrownLeft') + v('mouthFrownRight')) / 2
  }
}

/** Fügt Blendshapes, Kopfwinkel und abgeleitete Signale zusammen. */
export function buildSignals(blendshapes: Readonly<Record<string, number>> | null, head: HeadRotation): Record<string, number> {
  const blend: Record<string, number> = {}
  for (const name of BLENDSHAPE_NAMES) blend[name] = blendshapes?.[name] ?? 0
  return {
    ...blend,
    'head.yaw': head.yaw,
    'head.pitch': head.pitch,
    'head.roll': head.roll,
    ...deriveSignals(blend)
  }
}
