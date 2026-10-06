import { describe, expect, it } from 'vitest'
import { createImage, fillRect, getAlpha, getPixel, setPixel, type RgbaImage } from '@core/image/rgba-image'
import { boxUv } from '@core/model/box-uv'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { detectSlimArms, normalizeSkin, SkinError } from '@core/skin/skin'

const RED = 0xff0000ff
const GREEN = 0x00ff00ff
const GREY = 0x808080ff

/** Füllt alle Seiten eines Box-UV-Netzes (64er-Koordinaten, skaliert). */
function paintLimb(image: RgbaImage, u: number, v: number, width: number, scale = 1): void {
  const faces = boxUv(u, v, [width, 12, 4])
  for (const f of Object.values(faces)) {
    fillRect(image, f.u0 * scale, f.v0 * scale, (f.u1 - f.u0) * scale, (f.v1 - f.v0) * scale, GREY)
  }
}

function classicSkin(scale = 1): RgbaImage {
  const image = createImage(64 * scale, 64 * scale)
  paintLimb(image, 40, 16, 4, scale)
  paintLimb(image, 32, 48, 4, scale)
  return image
}

function slimSkin(): RgbaImage {
  const image = createImage(64, 64)
  paintLimb(image, 40, 16, 3)
  paintLimb(image, 32, 48, 3)
  return image
}

describe('normalizeSkin', () => {
  it('lehnt ungültige Größen mit verständlichem Fehlercode ab', () => {
    for (const [w, h] of [[32, 32], [64, 48], [100, 100], [64, 128], [2048, 2048]] as const) {
      expect(() => normalizeSkin(createImage(w, h))).toThrowError(SkinError)
      try {
        normalizeSkin(createImage(w, h))
      } catch (error) {
        expect((error as SkinError).code).toBe('invalid-size')
        expect((error as SkinError).details).toEqual({ width: w, height: h })
      }
    }
  })

  it('macht die Grundebene deckend, lässt die Außenschicht transparent', () => {
    const skin = normalizeSkin(classicSkin())
    expect(getAlpha(skin.image, 8, 8)).toBe(255) // Gesicht
    expect(getAlpha(skin.image, 20, 20)).toBe(255) // Körper
    expect(getAlpha(skin.image, 20, 52)).toBe(255) // linkes Bein
    expect(getAlpha(skin.image, 40, 8)).toBe(0) // Hut
    expect(getAlpha(skin.image, 20, 36)).toBe(0) // Jacke
    expect(skin.legacy).toBe(false)
    expect(skin.scale).toBe(1)
  })

  it('verändert das Eingabebild nicht', () => {
    const input = classicSkin()
    normalizeSkin(input)
    expect(getAlpha(input, 8, 8)).toBe(0)
  })

  describe('altes 64×32-Format', () => {
    it('spiegelt das rechte Bein auf das linke', () => {
      const legacy = createImage(64, 32)
      setPixel(legacy, 4, 20, RED) // rechtes Bein vorne, oben links
      setPixel(legacy, 0, 20, GREEN) // rechtes Bein, Außenseite oben links
      const skin = normalizeSkin(legacy)
      expect(skin.legacy).toBe(true)
      expect(skin.image.height).toBe(64)
      // linkes Bein vorne liegt bei (20..24, 52..64), gespiegelt → Spalte 23
      expect(getPixel(skin.image, 23, 52)).toBe(RED)
      // Außenseite des rechten Beins wird Außenseite des linken (24..28), gespiegelt → Spalte 27
      expect(getPixel(skin.image, 27, 52)).toBe(GREEN)
    })

    it('spiegelt den rechten Arm auf den linken', () => {
      const legacy = createImage(64, 32)
      setPixel(legacy, 44, 20, RED) // rechter Arm vorne, oben links
      setPixel(legacy, 44, 16, GREEN) // rechter Arm oben
      const skin = normalizeSkin(legacy)
      expect(getPixel(skin.image, 39, 52)).toBe(RED) // linker Arm vorne (36..40)
      expect(getPixel(skin.image, 39, 48)).toBe(GREEN) // linker Arm oben (36..40)
    })

    it('macht einen komplett deckenden Hut-Bereich transparent (Notch-Hack)', () => {
      const legacy = createImage(64, 32)
      fillRect(legacy, 32, 0, 32, 32, GREY)
      expect(getAlpha(normalizeSkin(legacy).image, 40, 10)).toBe(0)
    })

    it('behält den Hut, wenn er schon Transparenz enthält', () => {
      const legacy = createImage(64, 32)
      fillRect(legacy, 32, 0, 32, 32, GREY)
      setPixel(legacy, 63, 31, 0)
      expect(getAlpha(normalizeSkin(legacy).image, 40, 10)).toBe(255)
    })

    it('erkennt alte Skins immer als Classic', () => {
      expect(normalizeSkin(createImage(64, 32)).detectedModel).toBe('classic')
    })
  })

  describe('Slim-Erkennung', () => {
    it('erkennt Classic- und Slim-Skins', () => {
      expect(normalizeSkin(classicSkin()).detectedModel).toBe('classic')
      expect(normalizeSkin(slimSkin()).detectedModel).toBe('slim')
    })

    it('funktioniert bei HD-Skins', () => {
      const skin = normalizeSkin(classicSkin(2))
      expect(skin.scale).toBe(2)
      expect(skin.detectedModel).toBe('classic')
      expect(detectSlimArms(createImage(128, 128), 2)).toBe(true)
    })
  })

  it('Platzhalter-Skin ist ein gültiger Classic-Skin mit deckendem Gesicht', () => {
    const skin = normalizeSkin(createPlaceholderSkin())
    expect(skin.detectedModel).toBe('classic')
    expect(getAlpha(skin.image, 12, 12)).toBe(255)
  })
})
