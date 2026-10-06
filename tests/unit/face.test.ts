import { describe, expect, it } from 'vitest'
import { applyEmotion, detectEmotion } from '@core/face/emotions'
import { composeFace, faceStateKey, NEUTRAL_FACE_STATE, type FaceState } from '@core/face/face-compose'
import { analyzeFace, featureAt, isValidCellRect } from '@core/face/face-layout'
import { extractFaceSource, type FaceSource } from '@core/face/face-source'
import { generateFaceVariants } from '@core/face/face-variants'
import { createImage, fillRect, getPixel, setPixel, type RgbaImage } from '@core/image/rgba-image'
import { buildVanillaAvatar } from '@core/model/vanilla-avatar'
import { findPart } from '@core/model/avatar-model'
import { FACE_PART_IDS } from '@core/roles/rig'
import { normalizeSkin } from '@core/skin/skin'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { buildSignals } from '@core/tracking/signals'

const SKIN = 0xe0b090ff
const WHITE = 0xf0f0f0ff
const PUPIL = 0x3050c0ff
const MOUTH = 0x804040ff
const HAIR = 0x402010ff
const BROW = 0x302010ff

/**
 * Testgesicht (8 × 8, Zeilen von oben):
 * 0–1 Haare, 3 Brauen über den Augen, 4 Augen (Weiß + Pupille), 6 Mund in der Mitte.
 */
function testFace(withMouth = true, withBrows = true): RgbaImage {
  const face = createImage(8, 8)
  fillRect(face, 0, 0, 8, 8, SKIN)
  fillRect(face, 0, 0, 8, 2, HAIR)
  if (withBrows) {
    fillRect(face, 1, 3, 2, 1, BROW)
    fillRect(face, 5, 3, 2, 1, BROW)
  }
  setPixel(face, 1, 4, WHITE)
  setPixel(face, 2, 4, PUPIL)
  setPixel(face, 5, 4, PUPIL)
  setPixel(face, 6, 4, WHITE)
  if (withMouth) fillRect(face, 3, 6, 2, 1, MOUTH)
  return face
}

function sourceFrom(grid: RgbaImage): FaceSource {
  return { image: grid, grid, scale: 1, hatFrontMerged: false, skinWithoutHatFront: null }
}

describe('Gesichtserkennung', () => {
  it('findet Augen, Brauen und Mund', () => {
    const analysis = analyzeFace(testFace())
    expect(analysis.skinColor).toBe(SKIN)
    expect(analysis.layout.rightEye).toEqual({ x: 1, y: 4, w: 2, h: 1 })
    expect(analysis.layout.leftEye).toEqual({ x: 5, y: 4, w: 2, h: 1 })
    expect(analysis.layout.rightBrow).toEqual({ x: 1, y: 3, w: 2, h: 1 })
    expect(analysis.layout.mouth).toEqual({ x: 3, y: 6, w: 2, h: 1 })
    expect(analysis.mouthPainted).toBe(true)
    expect(analysis.notes).toEqual([])
  })

  it('ergänzt einen Mund, wenn keiner gezeichnet ist', () => {
    const analysis = analyzeFace(testFace(false))
    expect(analysis.mouthPainted).toBe(false)
    expect(analysis.notes).toContain('mouth-synthetic')
    expect(analysis.layout.mouth).toEqual({ x: 3, y: 6, w: 2, h: 1 })
  })

  it('schätzt die Augen bei einem leeren Gesicht', () => {
    const blank = createImage(8, 8)
    fillRect(blank, 0, 0, 8, 8, SKIN)
    const analysis = analyzeFace(blank)
    expect(analysis.notes).toContain('eyes-guessed')
    expect(analysis.layout.rightEye).not.toBeNull()
  })

  it('findet Merkmale per Zelle und prüft Rechtecke', () => {
    const { layout } = analyzeFace(testFace())
    expect(featureAt(layout, 2, 4)).toBe('rightEye')
    expect(featureAt(layout, 4, 6)).toBe('mouth')
    expect(featureAt(layout, 0, 7)).toBeNull()
    expect(isValidCellRect({ x: 7, y: 0, w: 2, h: 1 })).toBe(false)
    expect(isValidCellRect({ x: 0, y: 0, w: 8, h: 8 })).toBe(true)
  })

  it('erkennt hohe Anime-Augen mit Wimpern, seitliche Haarsträhnen und einen Mund ganz unten', () => {
    const LASH = 0x101018ff
    const IRIS = 0x80c8ffff
    const DARK_IRIS = 0x2060c0ff
    const face = createImage(8, 8)
    fillRect(face, 0, 0, 8, 8, SKIN)
    fillRect(face, 0, 0, 8, 3, HAIR) // Pony
    fillRect(face, 0, 0, 1, 7, HAIR) // Strähne rechts
    fillRect(face, 7, 0, 1, 7, HAIR) // Strähne links
    for (const [x0, flip] of [[1, false], [5, true]] as const) {
      fillRect(face, x0, 4, 2, 1, LASH)
      setPixel(face, flip ? x0 + 1 : x0, 5, WHITE)
      setPixel(face, flip ? x0 : x0 + 1, 5, IRIS)
      setPixel(face, flip ? x0 + 1 : x0, 6, DARK_IRIS)
      setPixel(face, flip ? x0 : x0 + 1, 6, IRIS)
    }
    fillRect(face, 3, 7, 1, 1, MOUTH)
    setPixel(face, 4, 7, WHITE) // Zähnchen

    const analysis = analyzeFace(face)
    expect(analysis.skinColor).toBe(SKIN)
    expect(analysis.layout.rightEye).toEqual({ x: 1, y: 4, w: 2, h: 3 })
    expect(analysis.layout.leftEye).toEqual({ x: 5, y: 4, w: 2, h: 3 })
    expect(analysis.layout.rightBrow).toBeNull() // Pony ist kein Augenbrauen-Paar
    expect(analysis.layout.mouth).toEqual({ x: 3, y: 7, w: 2, h: 1 })

    const variants = generateFaceVariants(face, analysis)
    expect(variants.pupils.right).toEqual({ x: 1, y: 6 }) // nicht in der Wimpernzeile
    // Lächeln malt nicht in die Augen (Mundwinkel wären in Zeile 6)
    expect(variants.mouth.smile.some(([x, y]) => y === 6 && (x === 2 || x === 5))).toBe(false)
  })

  it('erkennt den Platzhalter-Skin sinnvoll', () => {
    const analysis = analyzeFace(extractFaceSource(normalizeSkin(createPlaceholderSkin())).grid)
    expect(analysis.layout.rightEye?.y).toBe(4)
    expect(analysis.layout.mouth?.y).toBe(6)
  })
})

describe('Gesicht zusammensetzen', () => {
  const grid = testFace()
  const analysis = analyzeFace(grid)
  const variants = generateFaceVariants(grid, analysis)
  const source = sourceFrom(grid)
  const compose = (patch: Partial<FaceState>): RgbaImage => composeFace(source, variants, analysis.layout, { ...NEUTRAL_FACE_STATE, ...patch })

  it('neutral = Original', () => {
    expect(Array.from(compose({}).data)).toEqual(Array.from(grid.data))
  })

  it('geschlossenes Auge: keine Pupille, Wimpernlinie', () => {
    const image = compose({ eyes: { right: 2, left: 0 } })
    expect(getPixel(image, 2, 4)).not.toBe(PUPIL)
    expect(getPixel(image, 1, 4)).not.toBe(WHITE)
    expect(getPixel(image, 5, 4)).toBe(PUPIL) // anderes Auge unverändert
  })

  it('halb geschlossen: Weiß wird Lid, Pupille bleibt', () => {
    const image = compose({ eyes: { right: 1, left: 1 } })
    expect(getPixel(image, 1, 4)).not.toBe(WHITE)
    expect(getPixel(image, 2, 4)).toBe(PUPIL)
  })

  it('Pupille wandert innerhalb des Auges und nie hinaus', () => {
    const left = compose({ pupils: { right: [-1, 0], left: [0, 0] } })
    expect(getPixel(left, 1, 4)).toBe(PUPIL)
    expect(getPixel(left, 2, 4)).toBe(WHITE)
    const far = compose({ pupils: { right: [5, 3], left: [0, 0] } })
    expect(getPixel(far, 2, 4)).toBe(PUPIL)
    expect(getPixel(far, 3, 4)).toBe(SKIN)
  })

  it('Mund öffnet sich nach unten, „O“ und Lächeln verändern die Form', () => {
    expect(getPixel(compose({ mouth: 'open' }), 3, 7)).not.toBe(SKIN)
    const round = compose({ mouth: 'round' })
    expect(getPixel(round, 3, 7)).not.toBe(SKIN)
    // Schmaler Mund (2 px): Mitte bleibt, Mundwinkel kommen außen eine Zeile höher dazu („\_/“).
    const smile = compose({ mouth: 'smile' })
    expect(getPixel(smile, 2, 5)).toBe(MOUTH)
    expect(getPixel(smile, 5, 5)).toBe(MOUTH)
    expect(getPixel(smile, 3, 6)).toBe(MOUTH)
    expect(getPixel(smile, 2, 6)).toBe(SKIN)
    const frown = compose({ mouth: 'frown' })
    expect(getPixel(frown, 2, 7)).toBe(MOUTH) // Mundwinkel unten
  })

  it('Brauen heben sich und neigen sich bei Wut nach innen', () => {
    const up = compose({ brows: { right: 1, left: 0 } })
    expect(getPixel(up, 1, 2)).toBe(BROW)
    expect(getPixel(up, 1, 3)).toBe(SKIN)
    const angry = compose({ browTilt: 1 })
    // innere Zelle der rechten Braue (x = 2) würde ins Auge rutschen → bleibt; äußere unverändert
    expect(getPixel(angry, 1, 3)).toBe(BROW)
  })

  it('zeichnet HD-Gesichter blockweise', () => {
    const hd = createImage(16, 16)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPixel(hd, x, y, getPixel(grid, x >> 1, y >> 1))
    const image = composeFace({ image: hd, grid, scale: 2, hatFrontMerged: false, skinWithoutHatFront: null }, variants, analysis.layout, {
      ...NEUTRAL_FACE_STATE,
      eyes: { right: 2, left: 0 }
    })
    expect(getPixel(image, 4, 8)).toBe(getPixel(image, 5, 9))
    expect(getPixel(image, 4, 8)).not.toBe(PUPIL)
  })

  it('Zustandsschlüssel unterscheidet Zustände', () => {
    expect(faceStateKey(NEUTRAL_FACE_STATE)).not.toBe(faceStateKey({ ...NEUTRAL_FACE_STATE, mouth: 'open' }))
  })
})

describe('Hut-Ebene im Gesicht', () => {
  it('übernimmt Pixel der Hut-Vorderseite ins Overlay und entfernt sie dort', () => {
    const skinImage = createPlaceholderSkin()
    setPixel(skinImage, 41, 12, 0x000000ff) // Brille auf der Hut-Ebene
    const source = extractFaceSource(normalizeSkin(skinImage))
    expect(source.hatFrontMerged).toBe(true)
    expect(getPixel(source.image, 1, 4)).toBe(0x000000ff)
    expect(getPixel(source.skinWithoutHatFront!, 41, 12) & 0xff).toBe(0)
  })

  it('ohne Hut-Pixel bleibt alles, wie es ist', () => {
    const source = extractFaceSource(normalizeSkin(createPlaceholderSkin()))
    expect(source.hatFrontMerged).toBe(false)
    expect(source.skinWithoutHatFront).toBeNull()
  })

  it('das Modell enthält Overlay-Ebene und virtuelle Merkmale', () => {
    const model = buildVanillaAvatar(normalizeSkin(createPlaceholderSkin()), 'classic')
    const overlay = findPart(model.root, FACE_PART_IDS.overlay)
    expect(overlay?.cubes[0]?.faces['+z']).toBeDefined()
    expect(overlay?.children.map((c) => c.id)).toContain(FACE_PART_IDS.mouth)
    expect(model.textures.get('face')?.image.width).toBe(8)
  })
})

describe('Emotionen', () => {
  const head = { pitch: 0, yaw: 0, roll: 0 }
  it.each([
    [{ mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }, 'happy'],
    [{ browDownLeft: 0.6, browDownRight: 0.6 }, 'angry'],
    [{ browInnerUp: 0.7, eyeWideLeft: 0.5, eyeWideRight: 0.5 }, 'surprised'],
    [{ mouthFrownLeft: 0.6, mouthFrownRight: 0.6 }, 'sad'],
    [{}, 'neutral']
  ] as const)('%o → %s', (blend, emotion) => {
    expect(detectEmotion(buildSignals(blend, head))).toBe(emotion)
  })

  it('verändert den Gesichtszustand passend', () => {
    expect(applyEmotion(NEUTRAL_FACE_STATE, 'happy').mouth).toBe('smile')
    expect(applyEmotion({ ...NEUTRAL_FACE_STATE, mouth: 'open' }, 'happy').mouth).toBe('open')
    expect(applyEmotion(NEUTRAL_FACE_STATE, 'angry').browTilt).toBe(1)
    expect(applyEmotion(NEUTRAL_FACE_STATE, 'sad')).toMatchObject({ browTilt: -1, mouth: 'frown' })
    // Überrascht: „O“-Mund und hohe Brauen, aber Blinzeln bleibt erhalten
    expect(applyEmotion({ ...NEUTRAL_FACE_STATE, eyes: { right: 2, left: 0 } }, 'surprised')).toMatchObject({
      mouth: 'round',
      eyes: { right: 2, left: 0 },
      brows: { right: 1, left: 1 }
    })
  })
})
