import { deflateSync } from 'node:zlib'

/**
 * Minimaler PNG-Encoder nur für Tests: erzeugt gezielt alle Farbtypen, Bittiefen,
 * Filter und Interlacing, um den Decoder in `src/core/image/png-decode.ts` zu prüfen.
 */
export interface EncodeOptions {
  width: number
  height: number
  colorType: 0 | 2 | 3 | 4 | 6
  bitDepth: 1 | 2 | 4 | 8 | 16
  interlace?: boolean
  /** Filter für alle Zeilen (0 = None … 4 = Paeth). */
  filter?: 0 | 1 | 2 | 3 | 4
  palette?: readonly (readonly [number, number, number])[]
  trns?: Uint8Array
  /** Liefert die Samples eines Pixels in Original-Bittiefe (z. B. [r, g, b, a]). */
  sample: (x: number, y: number) => readonly number[]
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as const
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2]
] as const

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function packRow(opts: EncodeOptions, xs: number[], y: number): Uint8Array {
  const channels = CHANNELS[opts.colorType]
  const bits = channels * opts.bitDepth
  const row = new Uint8Array(Math.ceil((xs.length * bits) / 8))
  let bit = 0
  for (const x of xs) {
    const samples = opts.sample(x, y)
    for (let c = 0; c < channels; c++) {
      const v = samples[c] ?? 0
      if (opts.bitDepth === 16) {
        row[bit >> 3] = v >> 8
        row[(bit >> 3) + 1] = v & 0xff
      } else if (opts.bitDepth === 8) {
        row[bit >> 3] = v
      } else {
        row[bit >> 3]! |= v << (8 - opts.bitDepth - (bit & 7))
      }
      bit += opts.bitDepth
    }
  }
  return row
}

function filterRow(filter: number, row: Uint8Array, prior: Uint8Array, bpp: number): Uint8Array {
  const out = new Uint8Array(row.length + 1)
  out[0] = filter
  for (let i = 0; i < row.length; i++) {
    const a = i >= bpp ? row[i - bpp]! : 0
    const b = prior[i] ?? 0
    const c = i >= bpp ? prior[i - bpp] ?? 0 : 0
    const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]!
    out[i + 1] = (row[i]! - predictor) & 0xff
  }
  return out
}

export function encodePng(opts: EncodeOptions): Uint8Array {
  const channels = CHANNELS[opts.colorType]
  const bpp = Math.max(1, (channels * opts.bitDepth) >> 3)
  const passes = opts.interlace ? ADAM7 : ([[0, 0, 1, 1]] as const)
  const parts: Uint8Array[] = []

  for (const [x0, y0, dx, dy] of passes) {
    const xs: number[] = []
    for (let x = x0; x < opts.width; x += dx) xs.push(x)
    if (xs.length === 0) continue
    let prior: Uint8Array = new Uint8Array(0)
    for (let y = y0; y < opts.height; y += dy) {
      const row = packRow(opts, xs, y)
      parts.push(filterRow(opts.filter ?? 0, row, prior, bpp))
      prior = row
    }
  }

  const raw = Buffer.concat(parts)
  const header = new Uint8Array(13)
  const hv = new DataView(header.buffer)
  hv.setUint32(0, opts.width)
  hv.setUint32(4, opts.height)
  header[8] = opts.bitDepth
  header[9] = opts.colorType
  header[12] = opts.interlace ? 1 : 0

  const chunks = [chunk('IHDR', header)]
  if (opts.palette) chunks.push(chunk('PLTE', new Uint8Array(opts.palette.flat())))
  if (opts.trns) chunks.push(chunk('tRNS', opts.trns))
  chunks.push(chunk('IDAT', new Uint8Array(deflateSync(raw))))
  chunks.push(chunk('IEND', new Uint8Array(0)))

  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]))
}

/** Kurzform: RGBA8-Bild aus Pixel-Callback (r, g, b, a). */
export function encodeRgba(width: number, height: number, pixel: (x: number, y: number) => readonly number[]): Uint8Array {
  return encodePng({ width, height, colorType: 6, bitDepth: 8, sample: pixel })
}
