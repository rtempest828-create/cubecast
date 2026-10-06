import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodePng, PngDecodeError } from '@core/image/png-decode'
import type { RgbaImage } from '@core/image/rgba-image'
import { encodePng, encodeRgba } from '../helpers/png-encode'

function pixel(image: RgbaImage, x: number, y: number): number[] {
  const o = (y * image.width + x) * 4
  return Array.from(image.data.subarray(o, o + 4))
}

const rgbaPattern = (x: number, y: number): number[] => [(x * 37) & 255, (y * 53) & 255, (x * y) & 255, (x + y * 3) & 255]

async function expectReason(bytes: Uint8Array, reason: string): Promise<void> {
  await expect(decodePng(bytes)).rejects.toSatisfy((e: unknown) => e instanceof PngDecodeError && e.reason === reason)
}

describe('decodePng', () => {
  it.each([0, 1, 2, 3, 4] as const)('dekodiert RGBA8 mit Zeilenfilter %i', async (filter) => {
    const bytes = encodePng({ width: 17, height: 9, colorType: 6, bitDepth: 8, filter, sample: rgbaPattern })
    const image = await decodePng(bytes)
    expect(image.width).toBe(17)
    expect(image.height).toBe(9)
    for (let y = 0; y < 9; y++) for (let x = 0; x < 17; x++) expect(pixel(image, x, y)).toEqual(rgbaPattern(x, y))
  })

  it('dekodiert Adam7-Interlacing (ungerade Größe, Paeth)', async () => {
    const bytes = encodePng({ width: 13, height: 11, colorType: 6, bitDepth: 8, filter: 4, interlace: true, sample: rgbaPattern })
    const image = await decodePng(bytes)
    for (let y = 0; y < 11; y++) for (let x = 0; x < 13; x++) expect(pixel(image, x, y)).toEqual(rgbaPattern(x, y))
  })

  it('dekodiert RGB8 und RGB16 mit tRNS-Farbschlüssel', async () => {
    const rgb8 = await decodePng(
      encodePng({ width: 4, height: 1, colorType: 2, bitDepth: 8, filter: 1, trns: new Uint8Array([0, 10, 0, 20, 0, 30]), sample: (x) => (x === 2 ? [10, 20, 30] : [x, 100, 200]) })
    )
    expect(pixel(rgb8, 0, 0)).toEqual([0, 100, 200, 255])
    expect(pixel(rgb8, 2, 0)).toEqual([10, 20, 30, 0])

    const rgb16 = await decodePng(encodePng({ width: 2, height: 1, colorType: 2, bitDepth: 16, sample: (x) => [x ? 0xffff : 0x1234, 0x8000, 0x00ff] }))
    expect(pixel(rgb16, 0, 0)).toEqual([0x12, 0x80, 0x00, 255])
    expect(pixel(rgb16, 1, 0)).toEqual([0xff, 0x80, 0x00, 255])
  })

  it.each([1, 2, 4, 8] as const)('dekodiert Palette mit %i Bit und tRNS', async (bitDepth) => {
    const colors = Math.min(1 << bitDepth, 4)
    const palette = Array.from({ length: colors }, (_, i) => [i * 60, 255 - i * 60, i * 10] as const)
    const trns = new Uint8Array([0, 128])
    const image = await decodePng(
      encodePng({ width: 9, height: 3, colorType: 3, bitDepth, filter: 2, palette, trns, sample: (x, y) => [(x + y) % colors] })
    )
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 9; x++) {
        const i = (x + y) % colors
        const alpha = i < trns.length ? trns[i]! : 255
        expect(pixel(image, x, y)).toEqual([...palette[i]!, alpha])
      }
    }
  })

  it.each([1, 2, 4, 8, 16] as const)('dekodiert Graustufen mit %i Bit', async (bitDepth) => {
    const max = (1 << bitDepth) - 1
    const image = await decodePng(encodePng({ width: 5, height: 2, colorType: 0, bitDepth, filter: 3, sample: (x) => [x % 2 ? max : 0] }))
    expect(pixel(image, 0, 0)).toEqual([0, 0, 0, 255])
    expect(pixel(image, 1, 1)).toEqual([255, 255, 255, 255])
  })

  it('dekodiert Graustufen mit Alpha', async () => {
    const image = await decodePng(encodePng({ width: 2, height: 1, colorType: 4, bitDepth: 8, sample: (x) => [x * 200, 50 + x] }))
    expect(pixel(image, 1, 0)).toEqual([200, 200, 200, 51])
  })

  it('liest ein unabhängig erzeugtes PNG (GDI+) exakt, inkl. Farbe transparenter Pixel', async () => {
    const bytes = new Uint8Array(readFileSync(join(__dirname, '../fixtures/png/gdi-rgba-64.png')))
    const image = await decodePng(bytes)
    expect(image.width).toBe(64)
    for (const [x, y] of [[0, 0], [5, 3], [20, 10], [63, 40], [10, 60], [63, 63]] as const) {
      const alpha = x < 8 && y < 8 ? 0 : y >= 56 ? 128 : 255
      expect(pixel(image, x, y)).toEqual([(x * 4) % 256, (y * 4) % 256, ((x + y) * 2) % 256, alpha])
    }
  })

  describe('kaputte Dateien', () => {
    const valid = encodeRgba(4, 4, () => [1, 2, 3, 255])

    it('lehnt Nicht-PNGs ab', async () => {
      await expectReason(new TextEncoder().encode('kein bild'), 'signature')
      await expectReason(new Uint8Array(0), 'signature')
    })

    it('lehnt abgeschnittene Dateien ab', async () => {
      await expectReason(valid.subarray(0, valid.length - 20), 'truncated')
    })

    it('lehnt beschädigte Bilddaten ab', async () => {
      const broken = valid.slice()
      // Mitten in den IDAT-Daten Bytes zerstören (Header bleibt intakt).
      const idat = Buffer.from(broken).indexOf('IDAT')
      for (let i = idat + 6; i < idat + 14; i++) broken[i] = 0xff
      await expect(decodePng(broken)).rejects.toBeInstanceOf(PngDecodeError)
    })

    it('lehnt riesige Abmessungen ab, ohne Speicher zu reservieren', async () => {
      const huge = valid.slice()
      const view = new DataView(huge.buffer)
      view.setUint32(16, 100_000) // Breite im IHDR
      view.setUint32(20, 100_000) // Höhe im IHDR
      await expectReason(huge, 'too-large')
    })

    it('lehnt ungültige Bittiefen ab', async () => {
      const bad = valid.slice()
      bad[24] = 3
      await expectReason(bad, 'unsupported-format')
    })
  })
})
