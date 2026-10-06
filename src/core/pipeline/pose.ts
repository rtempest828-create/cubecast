import type { Vec3 } from '../math/vec'
import type { HeadRotation } from '../tracking/types'

/**
 * Pose eines Frames: zusätzliche Transformationen pro Teil, relativ zur Ruhelage.
 * Rotationen in Grad (Euler ZYX), werden auf die Ruhe-Rotation addiert – wie bei Figura.
 */
export interface PartPose {
  readonly rotation: Vec3
}

export type Pose = ReadonlyMap<string, PartPose>

export const HEAD_PART_ID = 'vanilla.head'

/** M2: nur der Kopf folgt dem Tracking. Weitere Schritte der Pipeline folgen ab M3. */
export function poseFromHead(head: HeadRotation): Pose {
  return new Map([[HEAD_PART_ID, { rotation: [head.pitch, head.yaw, head.roll] }]])
}
