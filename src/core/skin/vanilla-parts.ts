import type { Vec3 } from '../math/vec'
import type { SkinModelType } from './skin'

/** Die sechs Grundteile des Spielermodells. */
export type VanillaPartId = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'

/** Die Außenschicht-Teile (zweite Textur-Ebene). Namen wie in Figuras `vanilla_model`. */
export type VanillaLayerId = 'hat' | 'jacket' | 'rightSleeve' | 'leftSleeve' | 'rightPants' | 'leftPants'

export interface VanillaPartSpec {
  readonly id: VanillaPartId
  readonly layerId: VanillaLayerId
  /** Drehpunkt im Modellraum. */
  readonly pivot: Vec3
  /** Untere Ecke des Würfels im Modellraum. */
  readonly from: Vec3
  /** Breite (x), Höhe (y), Tiefe (z) in Pixeln. */
  readonly size: Vec3
  /** Box-UV-Ursprung der Grundebene. */
  readonly uv: readonly [number, number]
  /** Box-UV-Ursprung der Außenschicht. */
  readonly layerUv: readonly [number, number]
  /** Vergrößerung der Außenschicht in jede Richtung (Minecraft: Hut 0,5, Rest 0,25). */
  readonly layerInflate: number
}

/**
 * Maße wie in Minecrafts `PlayerModel`, umgerechnet in unseren Modellraum:
 * Einheit = 1 Skin-Pixel, Y nach oben, Füße bei y = 0, die Figur schaut nach +Z,
 * ihre rechte Seite liegt bei −X (aus Sicht der Kamera also links).
 */
export function vanillaPartSpecs(model: SkinModelType): readonly VanillaPartSpec[] {
  const slim = model === 'slim'
  const armWidth = slim ? 3 : 4
  // Slim-Arme sitzen in Minecraft einen halben Pixel tiefer.
  const armPivotY = slim ? 21.5 : 22
  const armBottom = armPivotY - 10

  return [
    { id: 'head', layerId: 'hat', pivot: [0, 24, 0], from: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0], layerUv: [32, 0], layerInflate: 0.5 },
    { id: 'body', layerId: 'jacket', pivot: [0, 24, 0], from: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16], layerUv: [16, 32], layerInflate: 0.25 },
    {
      id: 'rightArm',
      layerId: 'rightSleeve',
      pivot: [-5, armPivotY, 0],
      from: [-4 - armWidth, armBottom, -2],
      size: [armWidth, 12, 4],
      uv: [40, 16],
      layerUv: [40, 32],
      layerInflate: 0.25
    },
    {
      id: 'leftArm',
      layerId: 'leftSleeve',
      pivot: [5, armPivotY, 0],
      from: [4, armBottom, -2],
      size: [armWidth, 12, 4],
      uv: [32, 48],
      layerUv: [48, 48],
      layerInflate: 0.25
    },
    { id: 'rightLeg', layerId: 'rightPants', pivot: [-1.9, 12, 0], from: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16], layerUv: [0, 32], layerInflate: 0.25 },
    { id: 'leftLeg', layerId: 'leftPants', pivot: [1.9, 12, 0], from: [-0.1, 0, -2], size: [4, 12, 4], uv: [16, 48], layerUv: [0, 48], layerInflate: 0.25 }
  ]
}
