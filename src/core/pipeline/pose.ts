import type { Vec3 } from '../math/vec'

/**
 * Pose eines Frames: Veränderungen pro Teil relativ zur Ruhelage (wie bei Figura):
 * - `rotation`: Grad (Euler ZYX), addiert
 * - `position`: Pixel, addiert
 * - `scale`: Faktor, multipliziert
 * - `visible`: false blendet das Teil (mit Kindern) aus
 * - `uvOffset`: Textur-Verschiebung in Pixeln
 * - `frame`: Bildnummer für Bildwechsel (Gesichts-Overlay)
 */
export interface PartPose {
  readonly rotation: Vec3
  readonly position: Vec3
  readonly scale: Vec3
  readonly visible: boolean
  readonly uvOffset: readonly [number, number]
  readonly frame: number
}

export type Pose = ReadonlyMap<string, PartPose>

export const HEAD_PART_ID = 'vanilla.head'

export interface MutablePartPose {
  rotation: [number, number, number]
  position: [number, number, number]
  scale: [number, number, number]
  visible: boolean
  uvOffset: [number, number]
  frame: number
}

/** Sammelt Beiträge mehrerer Treiber zu einer Pose. */
export class PoseBuilder {
  private readonly parts = new Map<string, MutablePartPose>()

  part(id: string): MutablePartPose {
    let entry = this.parts.get(id)
    if (!entry) {
      entry = { rotation: [0, 0, 0], position: [0, 0, 0], scale: [1, 1, 1], visible: true, uvOffset: [0, 0], frame: 0 }
      this.parts.set(id, entry)
    }
    return entry
  }

  /** Liest ein Teil, ohne es anzulegen. */
  peek(id: string): MutablePartPose | undefined {
    return this.parts.get(id)
  }

  build(): Pose {
    return this.parts
  }

  /** Startet mit einer vorhandenen Pose (z. B. aus den Rollen-Treibern). */
  static from(pose: Pose): PoseBuilder {
    const builder = new PoseBuilder()
    for (const [id, p] of pose) {
      builder.parts.set(id, {
        rotation: [p.rotation[0], p.rotation[1], p.rotation[2]],
        position: [p.position[0], p.position[1], p.position[2]],
        scale: [p.scale[0], p.scale[1], p.scale[2]],
        visible: p.visible,
        uvOffset: [p.uvOffset[0], p.uvOffset[1]],
        frame: p.frame
      })
    }
    return builder
  }
}
