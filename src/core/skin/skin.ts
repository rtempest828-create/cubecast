import { cloneImage, createImage, getAlpha, getPixel, pixelOffset, setPixel, type RgbaImage } from '../image/rgba-image'

/** Classic = Steve (4 px breite Arme), Slim = Alex (3 px breite Arme). */
export type SkinModelType = 'classic' | 'slim'

export type SkinErrorCode = 'invalid-size'

export class SkinError extends Error {
  constructor(
    readonly code: SkinErrorCode,
    readonly details: Readonly<Record<string, string | number>> = {}
  ) {
    super(`Ungültiger Skin: ${code}`)
    this.name = 'SkinError'
  }
}

/** Ein in das moderne Layout gebrachter Skin. */
export interface NormalizedSkin {
  /** Immer quadratisch: 64·scale × 64·scale. */
  readonly image: RgbaImage
  /** 1 bei 64×64, 2 bei 128×128 (HD-Skins) usw. */
  readonly scale: number
  /** Ursprünglich im alten 64×32-Format. */
  readonly legacy: boolean
  /** Anhand der Pixel erkanntes Modell (siehe `detectSlimArms`). */
  readonly detectedModel: SkinModelType
  /** Abmessungen der Originaldatei. */
  readonly originalWidth: number
  readonly originalHeight: number
}

/** Größte unterstützte Breite (HD-Skins bis Faktor 16). */
export const MAX_SKIN_WIDTH = 1024

/**
 * Prüft das Format und bringt den Skin in das 64×64-Layout, so wie Minecraft
 * es beim Laden tut (`HttpTexture.processLegacySkin`):
 * - 64×32: linkes Bein und linken Arm aus den rechten Gliedmaßen spiegeln,
 *   Hut-Bereich ggf. transparent machen („Notch-Transparenz-Hack“)
 * - Grundebene (nicht die Außenschicht) immer deckend machen
 */
export function normalizeSkin(source: RgbaImage): NormalizedSkin {
  const { width, height } = source
  const validWidth = width >= 64 && width <= MAX_SKIN_WIDTH && width % 64 === 0
  const legacy = height * 2 === width
  if (!validWidth || (height !== width && !legacy)) {
    throw new SkinError('invalid-size', { width, height })
  }
  const scale = width / 64

  // Slim-Erkennung vor dem Deckend-Machen, weil dabei die leeren Bereiche gefüllt würden.
  const detectedModel: SkinModelType = !legacy && detectSlimArms(source, scale) ? 'slim' : 'classic'

  let image: RgbaImage
  if (legacy) {
    image = createImage(width, width)
    image.data.set(source.data)
    convertLegacyLayout(image, scale)
  } else {
    image = cloneImage(source)
  }

  setNoAlpha(image, scale, 0, 0, 32, 16)
  if (legacy) notchTransparencyHack(image, scale, 32, 0, 64, 32)
  setNoAlpha(image, scale, 0, 16, 64, 32)
  setNoAlpha(image, scale, 16, 48, 48, 64)

  return { image, scale, legacy, detectedModel, originalWidth: width, originalHeight: height }
}

/**
 * Bereiche (in 64er-Koordinaten, [x0, y0, x1, y1) ), die nur bei Classic-Armen
 * benutzt werden. Sind sie bei beiden Armen komplett transparent, ist es ein Slim-Skin.
 */
const CLASSIC_ONLY_REGIONS: readonly (readonly [number, number, number, number])[] = [
  // rechter Arm (Textur bei 40,16): Rückseite Spalten 54–55, Unterseite Spalten 50–51
  [54, 20, 56, 32],
  [50, 16, 52, 20],
  // linker Arm (Textur bei 32,48): Rückseite Spalten 46–47, Unterseite Spalten 42–43
  [46, 52, 48, 64],
  [42, 48, 44, 52]
]

/** Heuristik: true, wenn die nur von Classic-Armen genutzten Pixel alle transparent sind. */
export function detectSlimArms(image: RgbaImage, scale: number): boolean {
  for (const [x0, y0, x1, y1] of CLASSIC_ONLY_REGIONS) {
    for (let y = y0 * scale; y < y1 * scale; y++) {
      for (let x = x0 * scale; x < x1 * scale; x++) {
        if (getAlpha(image, x, y) !== 0) return false
      }
    }
  }
  return true
}

/**
 * Kopiert ein Rechteck um (dx, dy) verschoben, optional horizontal gespiegelt
 * (entspricht `NativeImage.copyRect` in Minecraft). Alle Angaben in 64er-Koordinaten.
 */
function copyRect(image: RgbaImage, scale: number, x: number, y: number, dx: number, dy: number, w: number, h: number): void {
  const sw = w * scale
  const sh = h * scale
  // Erst lesen, dann schreiben, damit sich Quelle und Ziel nicht beeinflussen.
  const buffer: number[] = []
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) buffer.push(getPixel(image, x * scale + i, y * scale + j))
  }
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const mirroredI = sw - 1 - i
      setPixel(image, (x + dx) * scale + mirroredI, (y + dy) * scale + j, buffer[j * sw + i]!)
    }
  }
}

/** Erzeugt linkes Bein und linken Arm aus den rechten Gliedmaßen (Minecraft-Verhalten). */
function convertLegacyLayout(image: RgbaImage, scale: number): void {
  // Bein: oben, unten, rechts, vorne, links, hinten
  copyRect(image, scale, 4, 16, 16, 32, 4, 4)
  copyRect(image, scale, 8, 16, 16, 32, 4, 4)
  copyRect(image, scale, 0, 20, 24, 32, 4, 12)
  copyRect(image, scale, 4, 20, 16, 32, 4, 12)
  copyRect(image, scale, 8, 20, 8, 32, 4, 12)
  copyRect(image, scale, 12, 20, 16, 32, 4, 12)
  // Arm
  copyRect(image, scale, 44, 16, -8, 32, 4, 4)
  copyRect(image, scale, 48, 16, -8, 32, 4, 4)
  copyRect(image, scale, 40, 20, 0, 32, 4, 12)
  copyRect(image, scale, 44, 20, -8, 32, 4, 12)
  copyRect(image, scale, 48, 20, -16, 32, 4, 12)
  copyRect(image, scale, 52, 20, -8, 32, 4, 12)
}

/** Setzt Alpha im Bereich [x0, x1) × [y0, y1) auf 255. */
function setNoAlpha(image: RgbaImage, scale: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0 * scale; y < y1 * scale; y++) {
    for (let x = x0 * scale; x < x1 * scale; x++) image.data[pixelOffset(image, x, y) + 3] = 255
  }
}

/**
 * Alte Skins haben den Hut-Bereich oft komplett deckend bemalt. Minecraft macht ihn
 * dann vollständig transparent – aber nur, wenn darin kein einziges transparentes Pixel ist.
 */
function notchTransparencyHack(image: RgbaImage, scale: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0 * scale; y < y1 * scale; y++) {
    for (let x = x0 * scale; x < x1 * scale; x++) {
      if (getAlpha(image, x, y) < 128) return
    }
  }
  for (let y = y0 * scale; y < y1 * scale; y++) {
    for (let x = x0 * scale; x < x1 * scale; x++) image.data[pixelOffset(image, x, y) + 3] = 0
  }
}
