import type { Rgba } from '../image/color'
import { cloneImage, getPixel, setPixel, type RgbaImage } from '../image/rgba-image'
import type { Pose } from '../pipeline/pose'
import type { MouthFrame } from '../roles/drivers'
import { FACE_PART_IDS } from '../roles/rig'
import type { CellRect, FaceLayout } from './face-layout'
import { FACE_CELLS, type FaceSource } from './face-source'
import { MOUTH_FRAMES, type CellEdit, type EyeFrame, type FaceVariants } from './face-variants'

/** Zustand des Gesichts in einem Frame (aus Rollen-Treibern und Emotion). */
export interface FaceState {
  readonly eyes: { readonly right: EyeFrame; readonly left: EyeFrame }
  /** Pupillen-Verschiebung in Zellen [dx, dy]; dx > 0 = zur linken Seite der Figur, dy > 0 = nach oben. */
  readonly pupils: { readonly right: readonly [number, number]; readonly left: readonly [number, number] }
  /** Brauen-Verschiebung in Zellen, > 0 = nach oben. */
  readonly brows: { readonly right: number; readonly left: number }
  /** Brauen-Neigung: −1 = traurig (innen hoch), 1 = wütend (innen runter). */
  readonly browTilt: -1 | 0 | 1
  readonly mouth: MouthFrame
}

export const NEUTRAL_FACE_STATE: FaceState = {
  eyes: { right: 0, left: 0 },
  pupils: { right: [0, 0], left: [0, 0] },
  brows: { right: 0, left: 0 },
  browTilt: 0,
  mouth: 'closed'
}

/** Kurzer Schlüssel zum Erkennen von Änderungen (nur dann wird neu gezeichnet). */
export function faceStateKey(state: FaceState): string {
  return [
    state.eyes.right,
    state.eyes.left,
    ...state.pupils.right,
    ...state.pupils.left,
    state.brows.right,
    state.brows.left,
    state.browTilt,
    state.mouth
  ].join(',')
}

const clampCell = (v: number): number => Math.max(0, Math.min(FACE_CELLS - 1, v))

const eyeFrame = (frame: number | undefined): EyeFrame => (frame === 2 ? 2 : frame === 1 ? 1 : 0)

/** Liest den Gesichtszustand aus den Treiber-Ergebnissen der virtuellen Gesichtsteile. */
export function faceStateFromPose(pose: Pose): FaceState {
  const part = (id: string) => pose.get(id)
  const offset = (id: string): readonly [number, number] => {
    const p = part(id)
    return p ? [p.position[0], p.position[1]] : [0, 0]
  }
  return {
    eyes: { right: eyeFrame(part(FACE_PART_IDS.rightEye)?.frame), left: eyeFrame(part(FACE_PART_IDS.leftEye)?.frame) },
    pupils: { right: offset(FACE_PART_IDS.rightPupil), left: offset(FACE_PART_IDS.leftPupil) },
    brows: { right: part(FACE_PART_IDS.rightBrow)?.position[1] ?? 0, left: part(FACE_PART_IDS.leftBrow)?.position[1] ?? 0 },
    browTilt: 0,
    mouth: MOUTH_FRAMES[part(FACE_PART_IDS.mouth)?.frame ?? 0] ?? 'closed'
  }
}

/** Rundet auf ganze Zellen (für Vergleich und Darstellung). */
export function roundFaceState(state: FaceState): FaceState {
  const r = (v: number): number => Math.round(v) || 0
  return {
    ...state,
    pupils: { right: [r(state.pupils.right[0]), r(state.pupils.right[1])], left: [r(state.pupils.left[0]), r(state.pupils.left[1])] },
    brows: { right: r(state.brows.right), left: r(state.brows.left) }
  }
}

/**
 * Setzt das Gesicht für einen Zustand zusammen: Original → Brauen → Augen → Pupillen → Mund.
 * Arbeitet in Zellen; bei HD-Skins wird jede Zelle als scale × scale-Block gezeichnet.
 */
export function composeFace(source: FaceSource, variants: FaceVariants, layout: FaceLayout, state: FaceState): RgbaImage {
  const image = cloneImage(source.image)
  const s = source.scale
  const read = (x: number, y: number): Rgba => getPixel(image, x * s + Math.floor(s / 2), y * s + Math.floor(s / 2))
  const paint = (x: number, y: number, color: Rgba): void => {
    for (let py = 0; py < s; py++) for (let px = 0; px < s; px++) setPixel(image, x * s + px, y * s + py, color)
  }
  const apply = (edits: readonly CellEdit[]): void => edits.forEach(([x, y, color]) => paint(x, y, color))
  const inRect = (r: CellRect | null, x: number, y: number): boolean => !!r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h

  // Brauen: alte Zellen mit Haut füllen, neu zeichnen (nie in die Augen hinein).
  for (const side of ['right', 'left'] as const) {
    const brow = variants.brows[side]
    if (!brow) continue
    const dy = Math.round(state.brows[side])
    if (dy === 0 && state.browTilt === 0) continue
    const eye = side === 'right' ? layout.rightEye : layout.leftEye
    // Innere Zelle = die zur Gesichtsmitte hin.
    const innerX = side === 'right' ? Math.max(...brow.cells.map(([x]) => x)) : Math.min(...brow.cells.map(([x]) => x))
    const moved = brow.cells.map(([x, y]) => {
      const tilt = x === innerX && brow.cells.length > 1 ? state.browTilt : 0
      const ny = clampCell(y - dy + tilt)
      return [x, inRect(eye, x, ny) ? y : ny] as const
    })
    brow.cells.forEach(([x, y]) => paint(x, y, variants.skinColor))
    moved.forEach(([x, y]) => paint(x, y, brow.color))
  }

  // Augen und Pupillen
  for (const side of ['right', 'left'] as const) {
    const frame = state.eyes[side]
    apply(variants.eyes[side][frame] ?? [])
    const pupil = variants.pupils[side]
    const eye = side === 'right' ? layout.rightEye : layout.leftEye
    if (!pupil || !eye || frame === 2) continue
    const [dx, dy] = state.pupils[side]
    const tx = Math.max(eye.x, Math.min(eye.x + eye.w - 1, pupil.x + Math.round(dx)))
    const ty = Math.max(eye.y, Math.min(eye.y + eye.h - 1, pupil.y - Math.round(dy)))
    if (tx === pupil.x && ty === pupil.y) continue
    // Farben tauschen: so bleibt bei halb geschlossenen Augen das Lid erhalten.
    const pupilColor = read(pupil.x, pupil.y)
    const targetColor = read(tx, ty)
    paint(pupil.x, pupil.y, targetColor)
    paint(tx, ty, pupilColor)
  }

  apply(variants.mouth[state.mouth])
  return image
}
