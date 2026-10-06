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

interface MutablePartPose {
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

  build(): Pose {
    return this.parts
  }
}
