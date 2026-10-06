import { extractFaceSource } from '../face/face-source'
import { add3, type Vec3 } from '../math/vec'
import { FACE_PART_IDS } from '../roles/rig'
import type { NormalizedSkin, SkinModelType } from '../skin/skin'
import { vanillaPartSpecs } from '../skin/vanilla-parts'
import type { AvatarModel, PartNode, TextureDef } from './avatar-model'
import { boxUv } from './box-uv'

export const SKIN_TEXTURE_ID = 'skin'
export const FACE_TEXTURE_ID = 'face'

/** Abstand des Overlays vor der Kopf-Vorderseite (hinter der Hut-Ebene bei 0,5). */
export const FACE_OVERLAY_OFFSET = 0.01

/**
 * Gesichts-Overlay: eine Ebene knapp vor der Kopf-Vorderseite mit austauschbarer
 * Textur, darunter „virtuelle“ Teile für Augen, Pupillen, Brauen und Mund. Diese haben
 * keine eigene Geometrie, lassen sich aber im Debug-Baum auswählen und mit Rollen steuern.
 */
function faceOverlayPart(headPivot: Vec3): PartNode {
  const z = 4 + FACE_OVERLAY_OFFSET
  const virtual = (id: string, name: string): PartNode => ({
    id,
    name,
    origin: 'face-overlay',
    pivot: headPivot,
    rotation: [0, 0, 0],
    visible: true,
    cubes: [],
    children: []
  })
  return {
    id: FACE_PART_IDS.overlay,
    name: 'Gesicht (Overlay)',
    origin: 'face-overlay',
    pivot: headPivot,
    rotation: [0, 0, 0],
    visible: true,
    cubes: [
      {
        id: `${FACE_PART_IDS.overlay}.plane`,
        name: 'Gesicht',
        from: [-4, 24, z],
        to: [4, 32, z],
        inflate: 0,
        textureId: FACE_TEXTURE_ID,
        layer: 'opaque',
        faces: { '+z': { u0: 0, v0: 0, u1: 8, v1: 8 } }
      }
    ],
    children: [
      virtual(FACE_PART_IDS.rightEye, 'Auge rechts'),
      virtual(FACE_PART_IDS.leftEye, 'Auge links'),
      virtual(FACE_PART_IDS.rightPupil, 'Pupille rechts'),
      virtual(FACE_PART_IDS.leftPupil, 'Pupille links'),
      virtual(FACE_PART_IDS.rightBrow, 'Braue rechts'),
      virtual(FACE_PART_IDS.leftBrow, 'Braue links'),
      virtual(FACE_PART_IDS.mouth, 'Mund')
    ]
  }
}

/**
 * Baut das Vanilla-Spielermodell: sechs Körperteile, jedes mit seiner Außenschicht
 * als Kind-Teil (gleicher Drehpunkt), damit sich die Ebenen getrennt ein-/ausblenden lassen.
 */
export function buildVanillaAvatar(skin: NormalizedSkin, model: SkinModelType): AvatarModel {
  const texture: TextureDef = { id: SKIN_TEXTURE_ID, name: 'Skin', image: skin.image, uvWidth: 64, uvHeight: 64 }
  const faceTexture: TextureDef = { id: FACE_TEXTURE_ID, name: 'Gesicht', image: extractFaceSource(skin).image, uvWidth: 8, uvHeight: 8 }

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
      children: spec.id === 'head' ? [layer, faceOverlayPart(spec.pivot)] : [layer],
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
  return {
    root,
    textures: new Map([
      [texture.id, texture],
      [faceTexture.id, faceTexture]
    ])
  }
}
