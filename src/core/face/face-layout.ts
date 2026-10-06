import { colorDistance, luminance, type Rgba } from '../image/color'
import { getPixel, type RgbaImage } from '../image/rgba-image'
import { FACE_CELLS } from './face-source'

/** Rechteck im 8 × 8-Gesichtsraster (Zellen). */
export interface CellRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/**
 * Lage der Gesichtsmerkmale. „right“/„left“ aus Sicht der Figur: Ihr rechtes Auge
 * liegt in der Textur links (Spalten 0–3), so wie man die Figur von vorne sieht.
 */
export interface FaceLayout {
  readonly rightEye: CellRect | null
  readonly leftEye: CellRect | null
  readonly rightBrow: CellRect | null
  readonly leftBrow: CellRect | null
  readonly mouth: CellRect | null
}

export type FaceFeature = keyof FaceLayout
export const FACE_FEATURES: readonly FaceFeature[] = ['rightEye', 'leftEye', 'rightBrow', 'leftBrow', 'mouth']

/** Was bei der Erkennung geraten werden musste (für Hinweise in der Oberfläche). */
export type FaceNote = 'eyes-guessed' | 'mouth-synthetic'

export interface FaceAnalysis {
  readonly layout: FaceLayout
  readonly skinColor: Rgba
  /** Der Skin hat einen gezeichneten Mund (sonst wird einer ergänzt). */
  readonly mouthPainted: boolean
  readonly notes: readonly FaceNote[]
}

/** Typisches Steve-ähnliches Layout als Rückfallebene. */
export const DEFAULT_FACE_LAYOUT: FaceLayout = {
  rightEye: { x: 1, y: 4, w: 2, h: 1 },
  leftEye: { x: 5, y: 4, w: 2, h: 1 },
  rightBrow: null,
  leftBrow: null,
  mouth: { x: 3, y: 6, w: 2, h: 1 }
}

/** Ab diesem Farbabstand gilt eine Zelle als „nicht Haut“. */
const SKIN_TOLERANCE = 48
/** Augen sind höchstens so viele Zeilen hoch (z. B. Wimpern, Weiß, Iris). */
const MAX_EYE_HEIGHT = 3

function cell(grid: RgbaImage, x: number, y: number): Rgba {
  return (getPixel(grid, x, y) | 0xff) >>> 0
}

/**
 * Hautfarbe = häufigste Farbe in der Gesichtsmitte (Spalten 2–5, Zeilen 3–7).
 * Die Ränder bleiben außen vor, weil dort oft Haarsträhnen liegen.
 */
export function dominantSkinColor(grid: RgbaImage): Rgba {
  const counts = new Map<Rgba, number>()
  for (let y = 3; y < FACE_CELLS; y++) {
    for (let x = 2; x <= 5; x++) {
      const c = cell(grid, x, y)
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
  }
  let best: Rgba = 0xffffffff
  let bestCount = -1
  for (const [color, count] of counts) {
    if (count > bestCount) {
      best = color
      bestCount = count
    }
  }
  return best
}

function columnsWhere(predicate: (x: number) => boolean, from: number, to: number): number[] {
  const result: number[] = []
  for (let x = from; x <= to; x++) if (predicate(x)) result.push(x)
  return result
}

function spanRect(columns: readonly number[], y: number, h = 1): CellRect | null {
  if (columns.length === 0) return null
  const x = Math.min(...columns)
  return { x, y, w: Math.max(...columns) - x + 1, h }
}

function inRect(rect: CellRect | null, x: number, y: number): boolean {
  return !!rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
}

/**
 * Erkennt Augen, Brauen und Mund in einem 8 × 8-Gesicht anhand des Kontrasts zur Hautfarbe.
 * Bewusst einfach gehalten; Abweichungen lassen sich im Bereich „Gesicht“ korrigieren.
 */
export function analyzeFace(grid: RgbaImage): FaceAnalysis {
  const skinColor = dominantSkinColor(grid)
  const skinLum = luminance(skinColor)
  const nonSkin = (x: number, y: number): boolean => colorDistance(cell(grid, x, y), skinColor) > SKIN_TOLERANCE
  const bright = (x: number, y: number): boolean => nonSkin(x, y) && luminance(cell(grid, x, y)) > Math.max(skinLum + 10, 180)
  const rowCount = (y: number): number => columnsWhere((x) => nonSkin(x, y), 0, 7).length
  const notes: FaceNote[] = []

  // Seitliche Haarsträhnen: Spalten, die von Zeile 2 bis 6 durchgehend nicht Haut sind (ohne Augenweiß).
  const hairColumn = new Set<number>()
  for (let x = 0; x < FACE_CELLS; x++) {
    let strand = true
    for (let y = 2; y <= 6 && strand; y++) if (!nonSkin(x, y) || bright(x, y)) strand = false
    if (strand) hairColumn.add(x)
  }
  const candidate = (x: number, y: number): boolean => nonSkin(x, y) && !hairColumn.has(x)
  // Haarfarbe = häufigste Farbe der obersten Zeile.
  const topRow = Array.from({ length: FACE_CELLS }, (_, x) => cell(grid, x, 0))
  const hairColor = topRow.reduce((best, c) => (topRow.filter((v) => v === c).length > topRow.filter((v) => v === best).length ? c : best), topRow[0]!)

  // --- Augen: Startzeile mit Kontrast in beiden Gesichtshälften, aber nicht komplett (Haare) ---
  let eyeRow = -1
  let bestScore = -Infinity
  for (let y = 2; y <= 6; y++) {
    const right = columnsWhere((x) => candidate(x, y), 0, 3)
    const left = columnsWhere((x) => candidate(x, y), 4, 7)
    if (right.length === 0 || left.length === 0 || rowCount(y) === FACE_CELLS) continue
    const hasWhite = [...right, ...left].some((x) => bright(x, y))
    const score = Math.min(right.length, left.length) * 2 + right.length + left.length - Math.abs(right.length - left.length) + (hasWhite ? 2 : 0) + (y === 4 ? 0.5 : 0)
    if (score > bestScore) {
      bestScore = score
      eyeRow = y
    }
  }

  /**
   * Lässt ein Auge nach unten und oben wachsen – bis 3 Zeilen. Nach oben gilt:
   * Ist das Auge schon mehrzeilig (Weiß + Iris), ist eine dunkle Zeile darüber Wimpern und
   * gehört dazu; bei einzeiligen Augen ist sie eine Braue (dann nur über Augenweiß wachsen).
   */
  const growEye = (seed: CellRect | null, from: number, to: number): CellRect | null => {
    if (!seed) return null
    let eye = seed
    const fits = (y: number, needWhite: boolean): number[] | null => {
      const cols = columnsWhere((x) => candidate(x, y), from, to)
      if (cols.length === 0 || rowCount(y) === FACE_CELLS) return null
      if (!cols.every((x) => x >= eye.x - 1 && x <= eye.x + eye.w)) return null
      if (needWhite && !cols.some((x) => bright(x, y))) return null
      return cols
    }
    const merge = (cols: number[], y: number, h: number): CellRect => {
      const x0 = Math.min(eye.x, ...cols)
      const x1 = Math.max(eye.x + eye.w - 1, ...cols)
      return { x: x0, y, w: x1 - x0 + 1, h }
    }
    for (let y = eye.y + eye.h; y <= 6 && eye.h < MAX_EYE_HEIGHT; y++) {
      const cols = fits(y, false)
      if (!cols) break
      eye = merge(cols, eye.y, eye.h + 1)
    }
    for (let y = eye.y - 1; y >= 1 && eye.h < MAX_EYE_HEIGHT; y--) {
      const cols = fits(y, eye.h < 2)
      if (!cols) break
      eye = merge(cols, y, eye.h + 1)
    }
    return eye
  }

  let rightEye: CellRect | null
  let leftEye: CellRect | null
  if (eyeRow < 0) {
    rightEye = DEFAULT_FACE_LAYOUT.rightEye
    leftEye = DEFAULT_FACE_LAYOUT.leftEye
    notes.push('eyes-guessed')
  } else {
    rightEye = growEye(spanRect(columnsWhere((x) => candidate(x, eyeRow), 0, 3), eyeRow), 0, 3)
    leftEye = growEye(spanRect(columnsWhere((x) => candidate(x, eyeRow), 4, 7), eyeRow), 4, 7)
  }

  // --- Brauen: direkt über dem Auge, mit Haut darüber (sonst ist es der Haaransatz) ---
  const browFor = (eye: CellRect | null): CellRect | null => {
    if (!eye || notes.includes('eyes-guessed')) return null
    const y = eye.y - 1
    if (y < 0 || rowCount(y) >= FACE_CELLS - 1) return null
    const cols = columnsWhere((x) => candidate(x, y) && (y === 0 || !nonSkin(x, y - 1)), Math.max(0, eye.x - 1), Math.min(7, eye.x + eye.w))
    // Ein einzelnes Pixel in exakter Haarfarbe ist eher eine Haarsträhne als eine Braue.
    if (cols.length === 1 && cell(grid, cols[0]!, y) === hairColor) return null
    return spanRect(cols, y)
  }
  const rightBrow = browFor(rightEye)
  const leftBrow = browFor(leftEye)

  // --- Mund: unter den Augen, Kontrast in der Mitte, bevorzugt nahe Zeile 6 ---
  const eyeBottom = Math.max((rightEye?.y ?? 4) + (rightEye?.h ?? 1), (leftEye?.y ?? 4) + (leftEye?.h ?? 1)) - 1
  let mouth: CellRect | null = null
  let mouthScore = -Infinity
  for (let y = eyeBottom + 1; y < FACE_CELLS; y++) {
    const cols = columnsWhere((x) => candidate(x, y) && !inRect(rightEye, x, y) && !inRect(leftEye, x, y), 2, 5)
    if (cols.length === 0 || rowCount(y) === FACE_CELLS) continue
    // Direkt unter den Augen sitzt eher eine Nase als ein Mund.
    const score = cols.length - Math.abs(y - 6) * 1.5 - (y === eyeBottom + 1 && y < 6 ? 2 : 0)
    if (score > mouthScore) {
      mouthScore = score
      mouth = spanRect(cols, y)
    }
  }
  const mouthPainted = mouth !== null
  if (!mouth) {
    mouth = { x: 3, y: Math.min(FACE_CELLS - 1, Math.max(eyeBottom + 2, 6)), w: 2, h: 1 }
    notes.push('mouth-synthetic')
  }

  return { layout: { rightEye, leftEye, rightBrow, leftBrow, mouth }, skinColor, mouthPainted, notes }
}

/** Welches Merkmal liegt an dieser Zelle? (für Klicks auf das Gesicht im Debug-Modus) */
export function featureAt(layout: FaceLayout, x: number, y: number): FaceFeature | null {
  for (const feature of FACE_FEATURES) {
    if (inRect(layout[feature], x, y)) return feature
  }
  return null
}

/** Prüft ein Rechteck aus gespeicherten Daten. */
export function isValidCellRect(value: unknown): value is CellRect {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  const ints = ['x', 'y', 'w', 'h'].every((k) => Number.isInteger(r[k]))
  if (!ints) return false
  const { x, y, w, h } = r as unknown as CellRect
  return x >= 0 && y >= 0 && w >= 1 && h >= 1 && x + w <= FACE_CELLS && y + h <= FACE_CELLS
}
