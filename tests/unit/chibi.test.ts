import { describe, expect, it } from 'vitest'
import { applyChibi, chibiLayout, chibiSkinPlan, DEFAULT_CHIBI, parseChibiSettings, resampleSkin, sourceRow, type ChibiSettings } from '@core/chibi/chibi'
import { createImage, getPixel, setPixel } from '@core/image/rgba-image'
import { findPart, walkParts, type AvatarModel, type PartNode } from '@core/model/avatar-model'
import { buildCosmetics } from '@core/model/cosmetics'
import { buildVanillaAvatar } from '@core/model/vanilla-avatar'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { normalizeSkin } from '@core/skin/skin'

const skin = normalizeSkin(createPlaceholderSkin())
const vanilla = buildVanillaAvatar(skin, 'classic', { foxEars: true, foxTail: true, headset: false })
const on = (patch: Partial<ChibiSettings> = {}): ChibiSettings => ({ ...DEFAULT_CHIBI, enabled: true, ...patch })

/** Höhe der eigenen Würfel eines Teils (ohne Kinder wie Zubehör). */
function yRange(model: AvatarModel, id: string, withChildren = false): [number, number] {
  const part = findPart(model.root, id)!
  let min = Infinity
  let max = -Infinity
  const take = (p: PartNode): void => {
    for (const c of p.cubes) {
      min = Math.min(min, c.from[1], c.to[1])
      max = Math.max(max, c.from[1], c.to[1])
    }
  }
  if (withChildren) walkParts(part, take)
  else take(part)
  return [min, max]
}

describe('Chibi-Proportionen', () => {
  it('ausgeschaltet: Modell unverändert', () => {
    expect(applyChibi(vanilla, DEFAULT_CHIBI).model).toBe(vanilla)
  })

  it('Teile bleiben verbunden: Füße am Boden, Körper auf den Beinen, Kopf und Arme am Körper', () => {
    const { model, layout } = applyChibi(vanilla, on())
    const legs = yRange(model, 'vanilla.rightLeg')
    const body = yRange(model, 'vanilla.body')
    const head = yRange(model, 'vanilla.head')
    const arm = yRange(model, 'vanilla.rightArm')
    expect(legs[0]).toBeCloseTo(0)
    expect(legs[1]).toBeCloseTo(body[0])
    expect(head[0]).toBeLessThanOrEqual(body[1] + 0.6) // Hut-Ebene ist aufgebläht
    expect(findPart(model.root, 'vanilla.head')!.pivot[1]).toBeCloseTo(body[1])
    expect(arm[1]).toBeCloseTo(body[1])
    // Chibi-Preset: Beine 6, Körper 7 Pixel (gerundet), Kopf 12 statt 8 Pixel hoch
    expect(legs[1]).toBe(6)
    expect(body[1] - body[0]).toBe(7)
    expect(layout.head).toBe(1.5)
    expect(head[1] - head[0]).toBeCloseTo(12)
  })

  it('Zubehör wächst mit dem Kopf bzw. bleibt am Körper', () => {
    const { model, partScale } = applyChibi(vanilla, on())
    const earIds: string[] = []
    walkParts(findPart(model.root, 'vanilla.head')!, (p) => {
      if (p.origin === 'cosmetic') earIds.push(p.id)
    })
    expect(earIds.length).toBeGreaterThan(0)
    expect(partScale.get(earIds[0]!)).toEqual([1.5, 1.5, 1.5])
    const body = yRange(model, 'vanilla.body')
    const tail = [...buildCosmetics({ foxEars: false, foxTail: true, headset: false }).body][0]!
    const [tailMin] = yRange(model, tail.id, true)
    expect(tailMin).toBeGreaterThanOrEqual(0)
    expect(tailMin).toBeLessThan(body[1])
  })

  it('„Nur stauchen“ rundet nicht auf ganze Pixel', () => {
    expect(chibiLayout(on({ legs: 0.55, textureMode: 'scale' })).legs).toBe(0.55)
    expect(chibiLayout(on({ legs: 0.55 })).legs).toBe(7 / 12)
  })

  it('Figura-Gruppen folgen ihrem Parent-Type, World bleibt stehen', () => {
    const group = (name: string, figuraParent: string, y: number): PartNode => ({
      id: `fig.${name}`, name, origin: 'bbmodel', figuraParent, pivot: [0, y, 0], rotation: [0, 0, 0], visible: true, children: [],
      cubes: [{ id: `fig.${name}/c`, name: 'c', from: [-1, y, -1], to: [1, y + 2, 1], inflate: 0, textureId: 'skin', layer: 'cutout', faces: {} }]
    })
    const model: AvatarModel = { ...vanilla, root: { ...vanilla.root, children: [...vanilla.root.children, group('Head', 'Head', 24), group('World', 'World', 40)] } }
    const { model: chibi } = applyChibi(model, on())
    expect(findPart(chibi.root, 'fig.Head')!.pivot).toEqual(findPart(chibi.root, 'vanilla.head')!.pivot)
    expect(findPart(chibi.root, 'fig.World')!.pivot).toEqual([0, 40, 0])
  })

  it('Einzelanpassung: Faktor, Versatz und Drehpunkt pro Teil', () => {
    const plain = applyChibi(vanilla, on())
    const adjusted = applyChibi(vanilla, on({ parts: { 'vanilla.leftArm': { scale: [1, 2, 1], offset: [0, 1, 0], pivot: [0, -1, 0] } } }))
    const before = findPart(plain.model.root, 'vanilla.leftArm')!
    const after = findPart(adjusted.model.root, 'vanilla.leftArm')!
    expect(after.pivot[1]).toBeCloseTo(before.pivot[1] + 1 - 1)
    expect(adjusted.partScale.get('vanilla.leftArm')![1]).toBeCloseTo(plain.partScale.get('vanilla.leftArm')![1] * 2)
  })

  it('gespeicherte Einstellungen werden robust gelesen', () => {
    expect(parseChibiSettings(null)).toEqual(DEFAULT_CHIBI)
    const parsed = parseChibiSettings({ enabled: true, head: 99, textureMode: 'quatsch', parts: { a: { scale: [2, 'x', 0] }, b: 5 } })
    expect(parsed).toMatchObject({ enabled: true, head: 3, textureMode: 'resample' })
    expect(parsed.parts).toEqual({ a: { scale: [2, 1, 0.05], offset: [0, 0, 0], pivot: [0, 0, 0] } })
  })
})

describe('Chibi-Textur', () => {
  it('Quellzeilen für B (gleichmäßig) und A+ (Ränder behalten)', () => {
    expect(Array.from({ length: 6 }, (_, r) => sourceRow(r, 12, 6, 'resample'))).toEqual([1, 3, 5, 7, 9, 11])
    expect(Array.from({ length: 6 }, (_, r) => sourceRow(r, 12, 6, 'crop'))).toEqual([0, 1, 2, 9, 10, 11])
  })

  it('schreibt gekürzte Flächen pixeltreu und passt die UVs an', () => {
    // Bein-Seite mit Zeilennummer als Farbe
    const image = createImage(64, 64)
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) setPixel(image, x, y, ((y << 24) | 0xff) >>> 0)
    const plan = chibiSkinPlan(vanilla, on())
    const entry = plan.find((e) => e.cubeId === 'vanilla.rightLeg.cube' && e.face === '+z')!
    expect(entry).toMatchObject({ oldHeight: 12, newHeight: 6 })
    const out = resampleSkin(image, 64, plan, 'crop')
    const rowAt = (r: number): number => getPixel(out, entry.u, entry.v + r) >>> 24
    expect([0, 1, 2, 3, 4, 5].map(rowAt)).toEqual([0, 1, 2, 9, 10, 11].map((r) => entry.v + r))
    // UV der Fläche endet nach 6 Zeilen
    const { model } = applyChibi({ ...vanilla, textures: new Map([...vanilla.textures].map(([k, v]) => [k, k === 'skin' ? { ...v, image } : v])) }, on())
    const uv = findPart(model.root, 'vanilla.rightLeg')!.cubes[0]!.faces['+z']!
    expect(Math.abs(uv.v1 - uv.v0)).toBe(6)
    // Original bleibt unverändert
    expect(getPixel(image, entry.u, entry.v + 3) >>> 24).toBe(entry.v + 3)
  })

  it('„Nur stauchen“ ändert die Textur nicht', () => {
    expect(chibiSkinPlan(vanilla, on({ textureMode: 'scale' }))).toEqual([])
  })
})
