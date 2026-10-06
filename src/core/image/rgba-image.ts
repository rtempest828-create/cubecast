/**
 * Plattformunabhängiges RGBA-Bild (8 Bit pro Kanal, nicht vormultipliziertes Alpha).
 * Wird im Kern statt `ImageData` verwendet, damit die Logik auch in Node-Tests läuft.
 */
export interface RgbaImage {
  readonly width: number
  readonly height: number
  /** Zeilenweise von oben nach unten, je Pixel R, G, B, A. */
  readonly data: Uint8ClampedArray
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

export function cloneImage(image: RgbaImage): RgbaImage {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }
}

/** Byte-Offset des Pixels (x, y) im Datenpuffer. */
export function pixelOffset(image: RgbaImage, x: number, y: number): number {
  return (y * image.width + x) * 4
}

export function getAlpha(image: RgbaImage, x: number, y: number): number {
  return image.data[pixelOffset(image, x, y) + 3] ?? 0
}

/** Liest ein Pixel als 32-Bit-Wert 0xRRGGBBAA. */
export function getPixel(image: RgbaImage, x: number, y: number): number {
  const o = pixelOffset(image, x, y)
  const d = image.data
  return (((d[o] ?? 0) << 24) | ((d[o + 1] ?? 0) << 16) | ((d[o + 2] ?? 0) << 8) | (d[o + 3] ?? 0)) >>> 0
}

/** Schreibt ein Pixel aus einem 32-Bit-Wert 0xRRGGBBAA. */
export function setPixel(image: RgbaImage, x: number, y: number, rgba: number): void {
  const o = pixelOffset(image, x, y)
  image.data[o] = (rgba >>> 24) & 0xff
  image.data[o + 1] = (rgba >>> 16) & 0xff
  image.data[o + 2] = (rgba >>> 8) & 0xff
  image.data[o + 3] = rgba & 0xff
}

/** Füllt ein Rechteck (x0/y0 inklusive, Breite/Höhe in Pixeln) mit einer Farbe 0xRRGGBBAA. */
export function fillRect(image: RgbaImage, x0: number, y0: number, w: number, h: number, rgba: number): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) setPixel(image, x, y, rgba)
  }
}
