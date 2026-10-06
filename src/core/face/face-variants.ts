import { darken, luminance, mix, type Rgba } from '../image/color'
import { getPixel, type RgbaImage } from '../image/rgba-image'
import type { MouthFrame } from '../roles/drivers'
import type { CellRect, FaceAnalysis, FaceLayout } from './face-layout'
import { FACE_CELLS } from './face-source'

/** Eine Zelle neu einfärben: [x, y, Farbe]. */
export type CellEdit = readonly [number, number, Rgba]

/** 0 = offen, 1 = halb, 2 = zu. */
export type EyeFrame = 0 | 1 | 2

export const MOUTH_FRAMES: readonly MouthFrame[] = ['closed', 'half', 'open', 'round', 'smile', 'frown']

export interface PupilInfo {
  readonly x: number
  readonly y: number
}

export interface BrowInfo {
  readonly cells: readonly (readonly [number, number])[]
  readonly color: Rgba
}

/**
 * Aus dem Original-Gesicht erzeugte Varianten als „Änderungen gegenüber dem Original“.
 * So lassen sich Augen, Pupillen, Brauen und Mund unabhängig kombinieren.
 */
export interface FaceVariants {
  readonly skinColor: Rgba
  readonly eyes: { readonly right: readonly (readonly CellEdit[])[]; readonly left: readonly (readonly CellEdit[])[] }
  readonly pupils: { readonly right: PupilInfo | null; readonly left: PupilInfo | null }
  readonly brows: { readonly right: BrowInfo | null; readonly left: BrowInfo | null }
  readonly mouth: Readonly<Record<MouthFrame, readonly CellEdit[]>>
}

function cellColor(grid: RgbaImage, x: number, y: number): Rgba {
  return (getPixel(grid, x, y) | 0xff) >>> 0
}

function cellsOf(rect: CellRect): [number, number][] {
  const cells: [number, number][] = []
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) cells.push([x, y])
  return cells
}

const inFace = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < FACE_CELLS && y < FACE_CELLS

function eyeFrames(grid: RgbaImage, eye: CellRect | null, skin: Rgba): CellEdit[][] {
  if (!eye) return [[], [], []]
  const lid = darken(skin, 0.82)
  const lash = darken(skin, 0.45)
  const bottom = eye.y + eye.h - 1
  const cells = cellsOf(eye)

  // Halb geschlossen: obere Hälfte wird Lid (Unterkante als Wimpernlinie); bei einzeiligen Augen das Augenweiß.
  let half: CellEdit[]
  if (eye.h >= 2) {
    const lidRows = Math.ceil(eye.h / 2)
    const edge = eye.y + lidRows - 1
    half = cells.filter(([, y]) => y <= edge).map(([x, y]) => [x, y, y === edge ? lash : lid] as const)
  } else {
    const whites = cells.filter(([x, y]) => luminance(cellColor(grid, x, y)) > luminance(skin) + 10)
    half =
      whites.length > 0
        ? whites.map(([x, y]) => [x, y, lid] as const)
        : cells.map(([x, y]) => [x, y, mix(cellColor(grid, x, y), lid, 0.5)] as const)
  }

  // Geschlossen: alles Lid, unterste Zeile als Wimpernlinie.
  const closed = cells.map(([x, y]) => [x, y, y === bottom ? lash : lid] as const)
  return [[], half, closed]
}

function pupilOf(grid: RgbaImage, eye: CellRect | null): PupilInfo | null {
  if (!eye || eye.w * eye.h < 2) return null
  // Bei mehrzeiligen Augen ist die oberste Zeile meist Wimpern/Lid, nicht die Pupille.
  const cells = eye.h >= 2 ? cellsOf({ ...eye, y: eye.y + 1, h: eye.h - 1 }) : cellsOf(eye)
  if (cells.length < 2) return null
  const lums = cells.map(([x, y]) => luminance(cellColor(grid, x, y)))
  const darkest = lums.indexOf(Math.min(...lums))
  if (Math.max(...lums) - Math.min(...lums) < 40) return null
  const [x, y] = cells[darkest]!
  return { x, y }
}

function browOf(grid: RgbaImage, brow: CellRect | null): BrowInfo | null {
  if (!brow) return null
  const cells = cellsOf(brow)
  return { cells, color: cellColor(grid, cells[0]![0], cells[0]![1]) }
}

function mouthFrames(grid: RgbaImage, analysis: FaceAnalysis, layout: FaceLayout): Record<MouthFrame, CellEdit[]> {
  const empty: Record<MouthFrame, CellEdit[]> = { closed: [], half: [], open: [], round: [], smile: [], frown: [] }
  const m = layout.mouth
  if (!m) return empty
  const skin = analysis.skinColor
  // Beim automatisch erkannten Layout steht es fest; bei angepassten Layouts nachsehen.
  const painted = layout === analysis.layout ? analysis.mouthPainted : isPainted(grid, m, skin)
  const mouthColor = painted
    ? cellsOf(m).map(([x, y]) => cellColor(grid, x, y)).reduce((a, b) => (luminance(a) <= luminance(b) ? a : b))
    : darken(skin, 0.55)
  const inner = mix(darken(skin, 0.3), 0x3a1414ff, 0.5)
  const bottom = m.y + m.h - 1

  const line: CellEdit[] = painted ? [] : cellsOf({ ...m, h: 1 }).map(([x, y]) => [x, y, mouthColor] as const)
  const clearMouth: CellEdit[] = cellsOf(m).map(([x, y]) => [x, y, skin] as const)
  const rowBelow = (offset: number, color: Rgba): CellEdit[] =>
    inFace(m.x, bottom + offset) ? cellsOf({ x: m.x, y: bottom + offset, w: m.w, h: 1 }).map(([x, y]) => [x, y, color] as const) : []

  // Halb/ganz offen: dunkler Mundinnenraum unter der Lippe. Ganz unten im Gesicht ohne Platz: Mund selbst wird dunkel.
  const half = rowBelow(1, inner)
  const halfFrame = half.length > 0 ? [...line, ...half] : cellsOf(m).map(([x, y]) => [x, y, inner] as const)
  const open = [...rowBelow(1, inner), ...rowBelow(2, inner)]
  const openFrame = open.length > 0 ? [...line, ...open] : cellsOf(m).map(([x, y]) => [x, y, inner] as const)

  // „O“: 2 × 2 dunkle Fläche in der Mundmitte.
  const cx = Math.min(FACE_CELLS - 2, Math.max(0, m.x + Math.floor((m.w - 2) / 2)))
  const cy = Math.min(FACE_CELLS - 2, m.y)
  const round: CellEdit[] = [...clearMouth, ...cellsOf({ x: cx, y: cy, w: 2, h: 2 }).map(([x, y]) => [x, y, inner] as const)]

  // Lächeln / traurig: Mundwinkel eine Zeile höher bzw. tiefer.
  const corners = (dy: number): CellEdit[] => {
    const edits: CellEdit[] = [...clearMouth]
    const left = m.w >= 3 ? m.x : m.x - 1
    const right = m.w >= 3 ? m.x + m.w - 1 : m.x + m.w
    for (let x = left + 1; x < right; x++) edits.push([x, m.y, mouthColor])
    for (const x of [left, right]) {
      if (inFace(x, m.y + dy)) edits.push([x, m.y + dy, mouthColor])
      else if (inFace(x, m.y)) edits.push([x, m.y, mouthColor])
    }
    return edits
  }

  // Nie in Augen oder Brauen malen (z. B. Mundwinkel direkt unter dem Auge).
  const protectedRects = [layout.rightEye, layout.leftEye, layout.rightBrow, layout.leftBrow].filter((r): r is CellRect => r !== null)
  const safe = (edits: CellEdit[]): CellEdit[] =>
    edits.filter(([x, y]) => !protectedRects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h))

  return {
    closed: safe(line),
    half: safe(halfFrame),
    open: safe(openFrame),
    round: safe(round),
    smile: safe(corners(-1)),
    frown: safe(corners(1))
  }
}

function isPainted(grid: RgbaImage, rect: CellRect, skin: Rgba): boolean {
  return cellsOf(rect).some(([x, y]) => Math.abs(luminance(cellColor(grid, x, y)) - luminance(skin)) > 20)
}

/** Erzeugt alle Varianten für ein Layout (automatisch erkannt oder vom Nutzer angepasst). */
export function generateFaceVariants(grid: RgbaImage, analysis: FaceAnalysis, layout: FaceLayout = analysis.layout): FaceVariants {
  const skin = analysis.skinColor
  return {
    skinColor: skin,
    eyes: { right: eyeFrames(grid, layout.rightEye, skin), left: eyeFrames(grid, layout.leftEye, skin) },
    pupils: { right: pupilOf(grid, layout.rightEye), left: pupilOf(grid, layout.leftEye) },
    brows: { right: browOf(grid, layout.rightBrow), left: browOf(grid, layout.leftBrow) },
    mouth: mouthFrames(grid, analysis, layout)
  }
}
