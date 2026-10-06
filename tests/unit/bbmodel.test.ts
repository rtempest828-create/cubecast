import { describe, expect, it } from 'vitest'
import { BbmodelError, faceUvFromBb, parseBbmodel, rotationToOurs, toOurs } from '@core/bbmodel/parse-bbmodel'
import { parentTypeOf } from '@core/figura/parent-types'
import { joinPath, loadFiguraAvatar, modelPathOf } from '@core/figura/figura-avatar'
import { scanHiddenVanilla } from '@core/figura/vanilla-scan'
import { findPart, type PartNode } from '@core/model/avatar-model'
import { buildAvatarModel } from '@core/model/build-avatar'
import { buildMeshGeometry } from '@core/model/cube-geometry'
import { NO_COSMETICS } from '@core/model/cosmetics'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { normalizeSkin } from '@core/skin/skin'
import { encodePng } from '../helpers/png-encode'

const png = (w: number, h: number, rgba: readonly number[] = [255, 0, 0, 255]): Uint8Array =>
  encodePng({ width: w, height: h, colorType: 6, bitDepth: 8, filter: 0, sample: () => rgba })
const dataUrl = (bytes: Uint8Array): string => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`

const face = (uv: number[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({ uv, texture: 0, ...extra })
const allFaces = { north: face([0, 0, 8, 8]), south: face([8, 0, 16, 8]), east: face([0, 8, 8, 16]), west: face([8, 8, 16, 16]), up: face([0, 0, 8, 8]), down: face([0, 0, 8, 8]) }

/** Kleines Figura-artiges Modell: Kopf mit Ohr und Ausdrucks-Gruppe, Schädel, Locator. */
function sampleModel(): Record<string, unknown> {
  return {
    meta: { format_version: '4.10', model_format: 'free', box_uv: false },
    resolution: { width: 16, height: 16 },
    elements: [
      { uuid: 'c-head', type: 'cube', name: 'kopf', from: [-4, 24, -4], to: [4, 32, 4], origin: [0, 24, 0], faces: allFaces },
      { uuid: 'c-ear', type: 'cube', name: 'ohr', from: [2, 32, 0], to: [4, 35, 1], origin: [3, 32, 0], rotation: [0, 0, 15], faces: allFaces },
      { uuid: 'c-closed', type: 'cube', name: 'lid', from: [-3, 27, -4.1], to: [-1, 28, -4], origin: [0, 0, 0], faces: allFaces, visibility: false },
      { uuid: 'c-skull', type: 'cube', name: 'schaedel', from: [0, 0, 0], to: [1, 1, 1], origin: [0, 0, 0], faces: allFaces },
      { uuid: 'c-box', type: 'cube', name: 'box', box_uv: true, uv_offset: [16, 0], from: [0, 0, 0], to: [2, 3, 4], origin: [0, 0, 0], faces: { north: { uv: [0, 0, 1, 1], texture: 0 } } },
      {
        uuid: 'm-1',
        type: 'mesh',
        name: 'dreieck',
        origin: [0, 0, 0],
        rotation: [0, 0, 0],
        vertices: { a: [0, 0, 0], b: [1, 0, 0], c: [0, 1, 0] },
        faces: { f: { vertices: ['a', 'b', 'c'], uv: { a: [0, 0], b: [16, 0], c: [0, 16] }, texture: 0 } }
      },
      { uuid: 'l-1', type: 'locator', name: 'punkt' }
    ],
    outliner: [
      {
        name: 'Head',
        origin: [0, 24, 0],
        rotation: [0, 0, 0],
        children: ['c-head', { name: 'OhrL', origin: [3, 32, 0], children: ['c-ear'] }, { name: 'AugenZu', origin: [0, 24, 0], visibility: false, children: ['c-closed'] }]
      },
      { name: 'SkullHead', origin: [0, 0, 0], children: ['c-skull'] },
      { name: 'Extras', origin: [1, 2, 3], rotation: [10, 20, 30], children: ['c-box', 'm-1', 'l-1'] }
    ],
    textures: [{ name: 'skin.png', source: dataUrl(png(16, 16)) }]
  }
}

const parse = (json: unknown = sampleModel(), loadExternal?: (path: string) => Uint8Array | null) =>
  parseBbmodel(json, { idPrefix: 'figura.model', rootName: 'model', ...(loadExternal ? { loadExternal } : {}) })

const child = (part: PartNode, name: string): PartNode => {
  const found = part.children.find((c) => c.name === name)
  if (!found) throw new Error(`kein Teil ${name}`)
  return found
}

describe('Koordinaten Blockbench → unser Raum', () => {
  it('spiegelt X und Z, Drehungen um X und Z kehren das Vorzeichen um', () => {
    expect(toOurs([1, 2, 3])).toEqual([-1, 2, -3])
    expect(rotationToOurs([10, 20, 30])).toEqual([-10, 20, -30])
  })

  it('ordnet UV-Ecken je Seite und Drehung zu', () => {
    expect(faceUvFromBb('north', [0, 0, 8, 4], 0).corners).toEqual([[0, 0], [8, 0], [0, 4], [8, 4]])
    // 90°: oben links bekommt, was vorher unten links lag
    expect(faceUvFromBb('north', [0, 0, 8, 4], 90).corners).toEqual([[0, 4], [0, 0], [8, 4], [8, 0]])
    expect(faceUvFromBb('north', [0, 0, 8, 4], 360).corners).toEqual(faceUvFromBb('north', [0, 0, 8, 4], 0).corners)
    // Ober- und Unterseite sind durch die 180°-Drehung vertauscht
    expect(faceUvFromBb('up', [0, 0, 8, 4], 0).corners).toEqual([[8, 4], [0, 4], [8, 0], [0, 0]])
    expect(faceUvFromBb('down', [0, 0, 8, 4], 0).corners).toEqual([[8, 0], [0, 0], [8, 4], [0, 4]])
  })
})

describe('parseBbmodel', () => {
  it('baut den Gruppenbaum mit eindeutigen IDs und Drehpunkten', async () => {
    const { root } = await parse()
    expect(root.id).toBe('figura.model')
    const head = child(root, 'Head')
    expect(head.id).toBe('figura.model.Head')
    expect(head.pivot).toEqual([-0, 24, -0])
    expect(head.cubes.map((c) => c.id)).toEqual(['figura.model.Head/kopf'])
    const ear = child(head, 'OhrL')
    expect(ear.id).toBe('figura.model.Head.OhrL')
    expect(ear.pivot).toEqual([-3, 32, -0])
    expect(ear.cubes[0]!.rotation).toEqual([-0, 0, -15])
    expect(child(root, 'Extras').rotation).toEqual([-10, 20, -30])
  })

  it('erkennt Figura-Parent-Types und blendet Spielansichten aus', async () => {
    const { root, warnings } = await parse()
    expect(child(root, 'Head').figuraParent).toBe('Head')
    expect(child(child(root, 'Head'), 'OhrL').figuraParent).toBeUndefined()
    const skull = child(root, 'SkullHead')
    expect(skull.figuraParent).toBe('Skull')
    expect(skull.visible).toBe(false)
    expect(warnings.some((w) => w.includes('SkullHead'))).toBe(true)
  })

  it('übernimmt die Sichtbarkeit von Gruppen und Würfeln', async () => {
    const { root } = await parse()
    const closed = child(child(root, 'Head'), 'AugenZu')
    expect(closed.visible).toBe(false)
    expect(closed.cubes[0]!.visible).toBe(false)
    expect(child(root, 'Head').cubes[0]!.visible).toBe(true)
  })

  it('liest Box-UV mit Versatz', async () => {
    const { root } = await parse()
    const box = child(root, 'Extras').cubes[0]!
    // Box-UV 2×3×4 bei (16, 0): Vorderseite (+z, Blockbench north) beginnt bei u = 16 + Tiefe
    expect(box.faces['+z']).toMatchObject({ u0: 20, v0: 4 })
  })

  it('zerlegt Meshes in Dreiecke im eigenen Koordinatenraum', async () => {
    const { root } = await parse()
    const mesh = child(root, 'Extras').meshes![0]!
    expect(mesh.triangles).toHaveLength(1)
    expect(mesh.triangles[0]!.positions).toEqual([[-0, 0, -0], [-1, 0, -0], [-0, 1, -0]])
    const geometry = buildMeshGeometry(mesh, [0, 0, 0], 16, 16)
    expect(geometry.positions).toHaveLength(9)
    expect(Array.from(geometry.uvs)).toEqual([0, 0, 1, 0, 0, 1])
  })

  it('ignoriert unbekannte Elementtypen mit Hinweis', async () => {
    const { warnings } = await parse()
    expect(warnings.some((w) => w.includes('locator'))).toBe(true)
  })

  it('lädt externe Texturen und nutzt sonst eine Ersatztextur', async () => {
    const json = { ...sampleModel(), textures: [{ name: 'fell.png', relative_path: '../tex/fell.png' }] }
    const external = await parse(json, (path) => (path === '../tex/fell.png' ? png(32, 32) : null))
    expect(external.textures[0]!.image.width).toBe(32)
    expect(external.warnings.some((w) => w.includes('fell.png'))).toBe(false)

    const missing = await parse(json)
    expect(missing.textures[0]!.image.width).toBe(16)
    expect(missing.warnings.some((w) => w.includes('fell.png'))).toBe(true)
  })

  it('ordnet die Leucht-Textur „_e“ zu', async () => {
    const json = { ...sampleModel(), textures: [{ name: 'skin.png', source: dataUrl(png(16, 16)) }, { name: 'skin_e.png', source: dataUrl(png(16, 16, [0, 255, 0, 255])) }] }
    const { textures } = await parse(json)
    expect(textures[0]!.emissive?.data[1]).toBe(255)
  })

  it('unterstützt Blockbench 5 (Gruppen getrennt gespeichert)', async () => {
    const json = {
      ...sampleModel(),
      groups: [{ uuid: 'g-head', name: 'Head', origin: [0, 24, 0], rotation: [0, 0, 0] }],
      outliner: [{ uuid: 'g-head', children: ['c-head'] }]
    }
    const { root } = await parse(json)
    expect(child(root, 'Head').cubes).toHaveLength(1)
  })

  it('wirft bei völlig ungültigen Daten', async () => {
    await expect(parse({ hallo: 1 })).rejects.toBeInstanceOf(BbmodelError)
  })
})

describe('Figura-Hilfen', () => {
  it('erkennt Parent-Types am Namensanfang (längere zuerst)', () => {
    expect(parentTypeOf('Head')?.role).toBe('head')
    expect(parentTypeOf('HeadPhones')?.type).toBe('Head')
    expect(parentTypeOf('LeftArmPivot')?.role).toBe('leftArm')
    expect(parentTypeOf('LeftItemPivot')?.hidden).toBe(true)
    expect(parentTypeOf('Cape')?.role).toBe('body')
    expect(parentTypeOf('head')).toBeNull() // Figura unterscheidet Groß-/Kleinschreibung
    expect(parentTypeOf('Ohr')).toBeNull()
  })

  it('findet ausgeblendete Vanilla-Teile in Skripten, ohne Kommentare', () => {
    expect([...scanHiddenVanilla(['vanilla_model.PLAYER:setVisible(false)'])]).toHaveLength(12)
    expect([...scanHiddenVanilla(['vanilla_model.HEAD:setVisible(false)\nvanilla_model.HAT : setVisible( false )'])]).toEqual(['head', 'hat'])
    expect(scanHiddenVanilla(['-- vanilla_model.PLAYER:setVisible(false)', '--[[ vanilla_model.ALL:setVisible(false) ]]']).size).toBe(0)
    expect(scanHiddenVanilla(['vanilla_model.HEAD:setVisible(true)']).size).toBe(0)
  })

  it('löst Pfade innerhalb des Avatars auf', () => {
    expect(joinPath('models', '../textures/a.png')).toBe('textures/a.png')
    expect(joinPath('', './a.png')).toBe('a.png')
    expect(joinPath('', '../a.png')).toBeNull()
    expect(modelPathOf('sub/Model.bbmodel')).toBe('sub.Model')
  })
})

describe('loadFiguraAvatar', () => {
  const encoder = new TextEncoder()
  const file = (path: string, content: string | Uint8Array) => ({ path, data: typeof content === 'string' ? encoder.encode(content) : content })

  it('lädt Metadaten, Modelle mit externen Texturen und erkennt vanilla_model', async () => {
    const model = { ...sampleModel(), textures: [{ name: 'fell.png', relative_path: 'fell.png' }] }
    const avatar = await loadFiguraAvatar('Ordner', [
      file('avatar.json', '﻿{"name":"Fuchs","authors":["A","B"],"color":"#EEC652"}'),
      file('models/model.bbmodel', JSON.stringify(model)),
      file('models/kaputt.bbmodel', '{nicht json'),
      file('textures/fell.png', png(16, 16)),
      file('script.lua', 'vanilla_model.PLAYER:setVisible(false)')
    ])
    expect(avatar.name).toBe('Fuchs')
    expect(avatar.authors).toEqual(['A', 'B'])
    expect(avatar.color).toBe('#EEC652')
    expect(avatar.models).toHaveLength(1)
    expect(avatar.models[0]!.root.id).toBe('figura.models.model')
    expect(avatar.models[0]!.warnings.some((w) => w.includes('fell.png'))).toBe(false)
    expect(avatar.hiddenVanilla.size).toBe(12)
    expect(avatar.warnings.some((w) => w.includes('kaputt.bbmodel'))).toBe(true)
  })

  it('nimmt den Ordnernamen, wenn avatar.json fehlt', async () => {
    const avatar = await loadFiguraAvatar('Ordner', [file('model.bbmodel', JSON.stringify(sampleModel()))])
    expect(avatar.name).toBe('Ordner')
    expect(avatar.warnings.some((w) => w.includes('avatar.json'))).toBe(true)
  })
})

describe('buildAvatarModel', () => {
  it('hängt Figura-Modelle an und blendet Vanilla-Teile aus', async () => {
    const avatar = await loadFiguraAvatar('A', [new TextEncoder().encode(JSON.stringify(sampleModel()))].map((data) => ({ path: 'model.bbmodel', data })))
    const model = buildAvatarModel({
      skin: normalizeSkin(createPlaceholderSkin()),
      modelType: 'classic',
      cosmetics: NO_COSMETICS,
      figura: avatar,
      vanillaHidden: new Set(['head', 'hat'])
    })
    expect(findPart(model.root, 'figura.model.Head')).toBeDefined()
    expect(findPart(model.root, 'vanilla.head')?.visible).toBe(false)
    expect(findPart(model.root, 'vanilla.body')?.visible).toBe(true)
    expect(model.textures.has('figura.model#tex0')).toBe(true)
  })
})
