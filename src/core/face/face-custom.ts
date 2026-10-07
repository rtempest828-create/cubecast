import type { Rgba } from '../image/color'
import type { MouthFrame } from '../roles/drivers'
import { FACE_CELLS } from './face-source'
import type { CellEdit, FaceVariants } from './face-variants'

/**
 * Eigene Gesichtsvarianten aus dem Face-Editor: ersetzen die automatisch erzeugten
 * Änderungen einer Variante (z. B. „Mund offen“). Gespeichert in der Avatar-Zuordnung.
 */

export const CUSTOM_VARIANT_KEYS = [
  'eye.right.1',
  'eye.right.2',
  'eye.left.1',
  'eye.left.2',
  'mouth.closed',
  'mouth.half',
  'mouth.open',
  'mouth.round',
  'mouth.smile',
  'mouth.frown'
] as const

export type CustomVariantKey = (typeof CUSTOM_VARIANT_KEYS)[number]

/** Gespeicherte Form: Zellen mit Farbe als „#rrggbbaa“. */
export type StoredCustomVariants = Readonly<Partial<Record<CustomVariantKey, readonly (readonly [number, number, string])[]>>>

export const rgbaToHex = (color: Rgba): string => `#${(color >>> 0).toString(16).padStart(8, '0')}`
export const hexToRgba = (hex: string): Rgba | null => (/^#[0-9a-f]{8}$/i.test(hex) ? parseInt(hex.slice(1), 16) >>> 0 : null)

export function isCustomVariantKey(key: unknown): key is CustomVariantKey {
  return CUSTOM_VARIANT_KEYS.includes(key as CustomVariantKey)
}

/** Liest gespeicherte Varianten robust (ungültige Zellen fallen weg). */
export function parseCustomVariants(value: unknown): StoredCustomVariants {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: Partial<Record<CustomVariantKey, (readonly [number, number, string])[]>> = {}
  for (const [key, cells] of Object.entries(value)) {
    if (!isCustomVariantKey(key) || !Array.isArray(cells)) continue
    out[key] = cells
      .filter(
        (c): c is [number, number, string] =>
          Array.isArray(c) && Number.isInteger(c[0]) && Number.isInteger(c[1]) && c[0] >= 0 && c[0] < FACE_CELLS && c[1] >= 0 && c[1] < FACE_CELLS && typeof c[2] === 'string' && hexToRgba(c[2]) !== null
      )
      .slice(0, FACE_CELLS * FACE_CELLS)
      .map(([x, y, color]) => [x, y, color.toLowerCase()] as const)
  }
  return out
}

export function toEdits(cells: readonly (readonly [number, number, string])[]): CellEdit[] {
  return cells.flatMap(([x, y, hex]) => {
    const color = hexToRgba(hex)
    return color === null ? [] : [[x, y, color] as const]
  })
}

export function fromEdits(edits: readonly CellEdit[]): (readonly [number, number, string])[] {
  return edits.map(([x, y, color]) => [x, y, rgbaToHex(color)] as const)
}

/** Änderungen einer Variante (automatisch erzeugt). */
export function variantEdits(variants: FaceVariants, key: CustomVariantKey): readonly CellEdit[] {
  const [kind, a, b] = key.split('.')
  if (kind === 'eye') return variants.eyes[a as 'right' | 'left'][Number(b)] ?? []
  return variants.mouth[a as MouthFrame] ?? []
}

/** Ersetzt automatisch erzeugte Varianten durch eigene. */
export function applyCustomVariants(variants: FaceVariants, custom: StoredCustomVariants): FaceVariants {
  const keys = Object.keys(custom).filter(isCustomVariantKey)
  if (keys.length === 0) return variants
  const eyes = { right: [...variants.eyes.right], left: [...variants.eyes.left] }
  const mouth = { ...variants.mouth }
  for (const key of keys) {
    const edits = toEdits(custom[key] ?? [])
    const [kind, a, b] = key.split('.')
    if (kind === 'eye') eyes[a as 'right' | 'left'][Number(b)] = edits
    else mouth[a as MouthFrame] = edits
  }
  return { ...variants, eyes, mouth }
}

/** Setzt (Farbe) oder entfernt (null = Original) eine Zelle in einer Änderungsliste. */
export function paintCell(edits: readonly CellEdit[], x: number, y: number, color: Rgba | null): CellEdit[] {
  const rest = edits.filter(([ex, ey]) => ex !== x || ey !== y)
  return color === null ? rest : [...rest, [x, y, color]]
}
