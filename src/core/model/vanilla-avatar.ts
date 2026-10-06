import { add3 } from '../math/vec'
import type { NormalizedSkin, SkinModelType } from '../skin/skin'
import { vanillaPartSpecs } from '../skin/vanilla-parts'
import type { AvatarModel, PartNode, TextureDef } from './avatar-model'
import { boxUv } from './box-uv'

export const SKIN_TEXTURE_ID = 'skin'

/**
 * Baut das Vanilla-Spielermodell: sechs Körperteile, jedes mit seiner Außenschicht
 * als Kind-Teil (gleicher Drehpunkt), damit sich die Ebenen getrennt ein-/ausblenden lassen.
 */
export function buildVanillaAvatar(skin: NormalizedSkin, model: SkinModelType): AvatarModel {
  const texture: TextureDef = { id: SKIN_TEXTURE_ID, name: 'Skin', image: skin.image, uvWidth: 64, uvHeight: 64 }

  const parts: PartNode[] = vanillaPartSpecs(model).map((spec) => {
    const to = add3(spec.from, spec.size)
    const layer: PartNode = {
      id: `vanilla.${spec.layerId}`,
      name: spec.layerId,
      origin: 'vanilla-layer',
      vanillaId: spec.layerId,
      pivot: spec.pivot,
      rotation: [0, 0, 0],
      visible: true,
      children: [],
      cubes: [
        {
          id: `vanilla.${spec.layerId}.cube`,
          name: spec.layerId,
          from: spec.from,
          to,
          inflate: spec.layerInflate,
          textureId: SKIN_TEXTURE_ID,
          layer: 'cutout',
          faces: boxUv(spec.layerUv[0], spec.layerUv[1], spec.size)
        }
      ]
    }
    return {
      id: `vanilla.${spec.id}`,
      name: spec.id,
      origin: 'vanilla',
      vanillaId: spec.id,
      pivot: spec.pivot,
      rotation: [0, 0, 0],
      visible: true,
      children: [layer],
      cubes: [
        {
          id: `vanilla.${spec.id}.cube`,
          name: spec.id,
          from: spec.from,
          to,
          inflate: 0,
          textureId: SKIN_TEXTURE_ID,
          layer: 'opaque',
          faces: boxUv(spec.uv[0], spec.uv[1], spec.size)
        }
      ]
    }
  })

  const root: PartNode = {
    id: 'root',
    name: 'root',
    origin: 'root',
    pivot: [0, 0, 0],
    rotation: [0, 0, 0],
    visible: true,
    cubes: [],
    children: parts
  }
  return { root, textures: new Map([[texture.id, texture]]) }
}
