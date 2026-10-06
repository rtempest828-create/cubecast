import { createImage, type RgbaImage } from './rgba-image'

/**
 * Eigener PNG-Decoder.
 *
 * Warum nicht `createImageBitmap` + Canvas? Der Canvas speichert vormultipliziertes
 * Alpha: Vollständig transparente Pixel verlieren dabei ihre Farbe. Minecraft macht
 * aber Teile des Skins nachträglich deckend (siehe `normalizeSkin`) und zeigt dann
 * genau diese Farben. Außerdem läuft der Decoder so auch in Node-Tests.
 *
 * Unterstützt: alle Farbtypen (Grau, RGB, Palette, Grau+Alpha, RGBA), Bittiefen
 * 1/2/4/8/16, tRNS-Transparenz und Adam7-Interlacing.
 */

export type PngErrorReason =
  | 'signature'
  | 'truncated'
  | 'missing-header'
  | 'unsupported-format'
  | 'too-large'
  | 'missing-palette'
  | 'bad-filter'
  | 'decompress-failed'

export class PngDecodeError extends Error {
  constructor(readonly reason: PngErrorReason) {
    super(`PNG konnte nicht gelesen werden: ${reason}`)
    this.name = 'PngDecodeError'
  }
}

/** Obergrenze, damit eine präparierte Datei keinen Speicher-Überlauf auslöst. */
export const MAX_PNG_PIXELS = 4096 * 4096

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const

/** Kanäle pro Farbtyp (PNG-Spezifikation, Tabelle 11.1). */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const VALID_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16]
}

/** Adam7-Durchläufe: Startspalte, Startzeile, Spalten- und Zeilenschritt. */
const ADAM7: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2]
]

export interface PngInfo {
  width: number
  height: number
  bitDepth: number
  colorType: number
  interlaced: boolean
  /** Palette als RGB-Tripel (nur Farbtyp 3). */
  palette: Uint8Array | null
  /** Rohdaten des tRNS-Chunks oder null. */
  transparency: Uint8Array | null
  /** Zusammengefügte, noch komprimierte IDAT-Daten. */
  compressed: Uint8Array
}

/** Dekodiert eine PNG-Datei vollständig in ein RGBA-Bild. */
export async function decodePng(bytes: Uint8Array): Promise<RgbaImage> {
  const info = parsePngChunks(bytes)
  const raw = await inflateZlib(info.compressed, expectedRawSize(info))
  return decodePngPixels(info, raw)
}

/** Liest Header und Chunks (ohne Dekompression). */
export function parsePngChunks(bytes: Uint8Array): PngInfo {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new PngDecodeError('signature')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  let header: Omit<PngInfo, 'palette' | 'transparency' | 'compressed'> | null = null
  let palette: Uint8Array | null = null
  let transparency: Uint8Array | null = null
  const idat: Uint8Array[] = []
  let ended = false

  let pos = 8
  while (pos + 8 <= bytes.length) {
    const length = view.getUint32(pos)
    const type = String.fromCharCode(bytes[pos + 4]!, bytes[pos + 5]!, bytes[pos + 6]!, bytes[pos + 7]!)
    const dataStart = pos + 8
    const dataEnd = dataStart + length
    // +4 für die CRC (wird nicht geprüft; beschädigte Daten fallen bei der Dekompression auf).
    if (dataEnd + 4 > bytes.length) throw new PngDecodeError('truncated')
    const data = bytes.subarray(dataStart, dataEnd)

    if (type === 'IHDR') {
      if (length < 13) throw new PngDecodeError('missing-header')
      const width = view.getUint32(dataStart)
      const height = view.getUint32(dataStart + 4)
      const bitDepth = bytes[dataStart + 8]!
      const colorType = bytes[dataStart + 9]!
      const compression = bytes[dataStart + 10]!
      const filter = bytes[dataStart + 11]!
      const interlace = bytes[dataStart + 12]!
      if (width === 0 || height === 0) throw new PngDecodeError('missing-header')
      if (width * height > MAX_PNG_PIXELS) throw new PngDecodeError('too-large')
      if (!VALID_DEPTHS[colorType]?.includes(bitDepth) || compression !== 0 || filter !== 0 || interlace > 1) {
        throw new PngDecodeError('unsupported-format')
      }
      header = { width, height, bitDepth, colorType, interlaced: interlace === 1 }
    } else if (type === 'PLTE') {
      palette = data.slice()
    } else if (type === 'tRNS') {
      transparency = data.slice()
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      ended = true
      break
    }
    pos = dataEnd + 4
  }

  if (!header) throw new PngDecodeError('missing-header')
  if (idat.length === 0 || !ended) throw new PngDecodeError('truncated')
  if (header.colorType === 3 && !palette) throw new PngDecodeError('missing-palette')

  const total = idat.reduce((sum, chunk) => sum + chunk.length, 0)
  const compressed = new Uint8Array(total)
  let offset = 0
  for (const chunk of idat) {
    compressed.set(chunk, offset)
    offset += chunk.length
  }
  return { ...header, palette, transparency, compressed }
}

function bitsPerPixel(info: PngInfo): number {
  return CHANNELS[info.colorType]! * info.bitDepth
}

/** Liefert die Durchläufe (bei Interlacing 7, sonst 1) mit ihren Abmessungen. */
function passes(info: PngInfo): { x0: number; y0: number; dx: number; dy: number; w: number; h: number }[] {
  if (!info.interlaced) return [{ x0: 0, y0: 0, dx: 1, dy: 1, w: info.width, h: info.height }]
  return ADAM7.map(([x0, y0, dx, dy]) => ({
    x0,
    y0,
    dx,
    dy,
    w: Math.ceil((info.width - x0) / dx),
    h: Math.ceil((info.height - y0) / dy)
  })).filter((p) => p.w > 0 && p.h > 0)
}

/** Anzahl der Bytes, die die dekomprimierten Daten genau haben müssen. */
export function expectedRawSize(info: PngInfo): number {
  const bpp = bitsPerPixel(info)
  return passes(info).reduce((sum, p) => sum + p.h * (1 + Math.ceil((p.w * bpp) / 8)), 0)
}

/** Entpackt zlib-Daten; bricht ab, sobald mehr als `maxBytes` entstehen würden. */
export async function inflateZlib(data: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate')
  const writer = stream.writable.getWriter()
  const reader = stream.readable.getReader()
  // Fehler beim Schreiben tauchen auch beim Lesen auf; hier nur „unhandled rejection“ vermeiden.
  writer.write(new Uint8Array(data)).catch(() => undefined)
  writer.close().catch(() => undefined)

  const out = new Uint8Array(maxBytes)
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (length + value.length > maxBytes) {
        // Zusätzliche Bytes hinter den Bilddaten sind laut Spezifikation ein Fehler.
        await reader.cancel().catch(() => undefined)
        throw new PngDecodeError('decompress-failed')
      }
      out.set(value, length)
      length += value.length
    }
  } catch (error) {
    if (error instanceof PngDecodeError) throw error
    throw new PngDecodeError('decompress-failed')
  }
  if (length < maxBytes) throw new PngDecodeError('truncated')
  return out
}

/** Paeth-Prädiktor (PNG-Spezifikation 9.4). */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** Macht die Zeilenfilter rückgängig (in-place) und liefert die reinen Zeilendaten. */
function unfilter(raw: Uint8Array, start: number, rows: number, stride: number, bpp: number): Uint8Array[] {
  const result: Uint8Array[] = []
  let prev: Uint8Array = new Uint8Array(stride)
  let pos = start
  for (let y = 0; y < rows; y++) {
    const filter = raw[pos]!
    const line = raw.subarray(pos + 1, pos + 1 + stride)
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? line[i - bpp]! : 0
      const up = prev[i]!
      const upLeft = i >= bpp ? prev[i - bpp]! : 0
      let predictor: number
      switch (filter) {
        case 0: predictor = 0; break
        case 1: predictor = left; break
        case 2: predictor = up; break
        case 3: predictor = (left + up) >> 1; break
        case 4: predictor = paeth(left, up, upLeft); break
        default: throw new PngDecodeError('bad-filter')
      }
      line[i] = (line[i]! + predictor) & 0xff
    }
    result.push(line)
    prev = line
    pos += 1 + stride
  }
  return result
}

/** Liest Sample Nr. `index` einer Zeile in der Original-Bittiefe. */
function readSample(line: Uint8Array, index: number, bitDepth: number): number {
  if (bitDepth === 8) return line[index]!
  if (bitDepth === 16) return (line[index * 2]! << 8) | line[index * 2 + 1]!
  const bit = index * bitDepth
  const shift = 8 - bitDepth - (bit & 7)
  return (line[bit >> 3]! >> shift) & ((1 << bitDepth) - 1)
}

/** Wandelt dekomprimierte Rohdaten in ein RGBA8-Bild um. */
export function decodePngPixels(info: PngInfo, raw: Uint8Array): RgbaImage {
  if (raw.length < expectedRawSize(info)) throw new PngDecodeError('truncated')
  const image = createImage(info.width, info.height)
  const channels = CHANNELS[info.colorType]!
  const bpp = Math.max(1, (channels * info.bitDepth) >> 3)
  const maxValue = (1 << info.bitDepth) - 1
  // Auf 8 Bit skalieren (bei 16 Bit das obere Byte).
  const to8 = (v: number): number => (info.bitDepth === 16 ? v >> 8 : info.bitDepth === 8 ? v : Math.round((v * 255) / maxValue))
  const trns = info.transparency
  const trnsView = trns && trns.length >= 2 ? new DataView(trns.buffer, trns.byteOffset, trns.byteLength) : null

  let pos = 0
  for (const pass of passes(info)) {
    const stride = Math.ceil((pass.w * channels * info.bitDepth) / 8)
    const lines = unfilter(raw, pos, pass.h, stride, bpp)
    pos += pass.h * (1 + stride)

    for (let py = 0; py < pass.h; py++) {
      const line = lines[py]!
      const y = pass.y0 + py * pass.dy
      for (let px = 0; px < pass.w; px++) {
        const x = pass.x0 + px * pass.dx
        const s = px * channels
        let r: number, g: number, b: number, a: number
        switch (info.colorType) {
          case 0: {
            const v = readSample(line, s, info.bitDepth)
            r = g = b = to8(v)
            a = trnsView && v === trnsView.getUint16(0) ? 0 : 255
            break
          }
          case 2: {
            const rv = readSample(line, s, info.bitDepth)
            const gv = readSample(line, s + 1, info.bitDepth)
            const bv = readSample(line, s + 2, info.bitDepth)
            r = to8(rv); g = to8(gv); b = to8(bv)
            a = trnsView && trns!.length >= 6 && rv === trnsView.getUint16(0) && gv === trnsView.getUint16(2) && bv === trnsView.getUint16(4) ? 0 : 255
            break
          }
          case 3: {
            const index = readSample(line, s, info.bitDepth)
            const pal = info.palette!
            r = pal[index * 3] ?? 0
            g = pal[index * 3 + 1] ?? 0
            b = pal[index * 3 + 2] ?? 0
            a = trns && index < trns.length ? trns[index]! : 255
            break
          }
          case 4: {
            r = g = b = to8(readSample(line, s, info.bitDepth))
            a = to8(readSample(line, s + 1, info.bitDepth))
            break
          }
          default: {
            r = to8(readSample(line, s, info.bitDepth))
            g = to8(readSample(line, s + 1, info.bitDepth))
            b = to8(readSample(line, s + 2, info.bitDepth))
            a = to8(readSample(line, s + 3, info.bitDepth))
          }
        }
        const o = (y * info.width + x) * 4
        image.data[o] = r
        image.data[o + 1] = g
        image.data[o + 2] = b
        image.data[o + 3] = a
      }
    }
  }
  return image
}
