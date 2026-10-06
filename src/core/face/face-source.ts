import { alphaOver } from '../image/color'
import { cloneImage, createImage, getPixel, pixelOffset, setPixel, type RgbaImage } from '../image/rgba-image'
import type { NormalizedSkin } from '../skin/skin'

/** Das Gesicht ist 8 × 8 „Zellen“ groß (bei HD-Skins jede Zelle scale × scale Pixel). */
export const FACE_CELLS = 8

/** Vorderseite des Kopfes und der Hut-Ebene im 64er-Layout. */
const FACE_ORIGIN = [8, 8] as const
const HAT_FACE_ORIGIN = [40, 8] as const

export interface FaceSource {
  /** Gesicht in voller Auflösung (8·scale), Hut-Vorderseite bereits darübergelegt, deckend. */
  readonly image: RgbaImage
  /** 8 × 8-Abtastung (eine Farbe pro Zelle) für die Analyse. */
  readonly grid: RgbaImage
  readonly scale: number
  /** Die Hut-Ebene hatte auf der Vorderseite Pixel und wurde ins Gesicht übernommen. */
  readonly hatFrontMerged: boolean
  /** Skin ohne Hut-Vorderseite (nur wenn `hatFrontMerged`), damit nichts doppelt erscheint. */
  readonly skinWithoutHatFront: RgbaImage | null
}

/**
 * Erstellt die Grundlage für das Gesichts-Overlay. Liegen Gesichtsteile auf der Hut-Ebene
 * (z. B. Brille, Bart), werden sie ins Overlay übernommen, damit auch sie animierbar sind.
 */
export function extractFaceSource(skin: NormalizedSkin): FaceSource {
  const s = skin.scale
  const size = FACE_CELLS * s
  const image = createImage(size, size)
  let hatFrontMerged = false

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const base = (getPixel(skin.image, FACE_ORIGIN[0] * s + x, FACE_ORIGIN[1] * s + y) | 0xff) >>> 0
      const hat = getPixel(skin.image, HAT_FACE_ORIGIN[0] * s + x, HAT_FACE_ORIGIN[1] * s + y)
      if ((hat & 0xff) > 0) hatFrontMerged = true
      setPixel(image, x, y, alphaOver(base, hat))
    }
  }

  let skinWithoutHatFront: RgbaImage | null = null
  if (hatFrontMerged) {
    skinWithoutHatFront = cloneImage(skin.image)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        skinWithoutHatFront.data[pixelOffset(skinWithoutHatFront, HAT_FACE_ORIGIN[0] * s + x, HAT_FACE_ORIGIN[1] * s + y) + 3] = 0
      }
    }
  }

  return { image, grid: sampleGrid(image, s), scale: s, hatFrontMerged, skinWithoutHatFront }
}

/** Nimmt pro Zelle das mittlere Pixel. */
export function sampleGrid(image: RgbaImage, scale: number): RgbaImage {
  const grid = createImage(FACE_CELLS, FACE_CELLS)
  const center = Math.floor(scale / 2)
  for (let y = 0; y < FACE_CELLS; y++) {
    for (let x = 0; x < FACE_CELLS; x++) setPixel(grid, x, y, getPixel(image, x * scale + center, y * scale + center))
  }
  return grid
}
