import type { Vec3 } from '../math/vec'
import { OneEuroFilter, oneEuroParamsFromSliders } from './one-euro'

/**
 * Arm-Tracking aus dem MediaPipe Pose Landmarker.
 *
 * Vom Worker kommen 8 Weltpunkte (Meter, Ursprung zwischen den Hüften) als
 * `Float32Array` mit je [x, y, z, Sichtbarkeit] in dieser Reihenfolge:
 */
export const POSE_POINTS = ['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'leftHip', 'rightHip'] as const
export type PosePoint = (typeof POSE_POINTS)[number]
/** Indizes dieser Punkte im MediaPipe-Pose-Modell (33 Punkte). */
export const MEDIAPIPE_POSE_INDICES: readonly number[] = [11, 12, 13, 14, 15, 16, 23, 24]

export const POSE_FLOATS = POSE_POINTS.length * 4

/** Mindest-Sichtbarkeit, damit ein Punkt verwendet wird. */
export const MIN_VISIBILITY = 0.5

interface Point {
  readonly p: Vec3
  readonly visibility: number
}

function point(packed: Float32Array, name: PosePoint): Point {
  const i = POSE_POINTS.indexOf(name) * 4
  return { p: [packed[i] ?? 0, packed[i + 1] ?? 0, packed[i + 2] ?? 0], visibility: packed[i + 3] ?? 0 }
}

/**
 * Rotation (Grad, Euler ZYX) eines Minecraft-Arms, der in Ruhe nach unten (−Y) hängt,
 * so dass er in Richtung `direction` (Figurenraum: x links der Figur, y oben, z zur Kamera) zeigt.
 */
export function armRotationFor(direction: Vec3): Vec3 | null {
  const length = Math.hypot(direction[0], direction[1], direction[2])
  if (length < 1e-6) return null
  const [dx, dy, dz] = [direction[0] / length, direction[1] / length, direction[2] / length]
  const pitch = -Math.asin(Math.max(-1, Math.min(1, dz)))
  const roll = Math.atan2(dx, -dy)
  return [(pitch * 180) / Math.PI, 0, (roll * 180) / Math.PI]
}

export interface ArmTargets {
  readonly left: Vec3 | null
  readonly right: Vec3 | null
}

/**
 * Berechnet Zielrotationen beider Arme der Figur. MediaPipe-Weltkoordinaten:
 * x rechts im Bild, y nach unten, z von der Kamera weg. „left“ ist die linke Seite der Person.
 * Gespiegelt gehört der rechte Arm der Person zum linken Arm der Figur.
 */
export function armTargetsFromPose(packed: Float32Array, mirror: boolean): ArmTargets {
  const forSide = (avatarSide: 'left' | 'right'): Vec3 | null => {
    const personSide = mirror ? (avatarSide === 'left' ? 'right' : 'left') : avatarSide
    const shoulder = point(packed, `${personSide}Shoulder`)
    const wrist = point(packed, `${personSide}Wrist`)
    const elbow = point(packed, `${personSide}Elbow`)
    if (shoulder.visibility < MIN_VISIBILITY) return null
    // Handgelenk bevorzugt; ist es verdeckt, reicht der Ellbogen für die Grobrichtung.
    const end = wrist.visibility >= MIN_VISIBILITY ? wrist : elbow.visibility >= MIN_VISIBILITY ? elbow : null
    if (!end) return null
    const d: Vec3 = [end.p[0] - shoulder.p[0], end.p[1] - shoulder.p[1], end.p[2] - shoulder.p[2]]
    return armRotationFor([(mirror ? -1 : 1) * d[0], -d[1], -d[2]])
  }
  return { left: forSide('left'), right: forSide('right') }
}

/** Glättet die Arm-Ziele und blendet weich zwischen Tracking und Leerlauf über. */
export class ArmTracker {
  private readonly filters = { left: [0, 1, 2].map(() => new OneEuroFilter(oneEuroParamsFromSliders(0.6, 0.6))), right: [0, 1, 2].map(() => new OneEuroFilter(oneEuroParamsFromSliders(0.6, 0.6))) }
  private readonly weights = { left: 0, right: 0 }
  private readonly last: Record<'left' | 'right', Vec3> = { left: [0, 0, 0], right: [0, 0, 0] }

  /** Liefert pro Seite Rotation und Gewicht (0 = Leerlauf, 1 = Tracking). */
  update(targets: ArmTargets | null, timeSec: number, dtSec: number): Record<'left' | 'right', { rotation: Vec3; weight: number }> {
    const result = {} as Record<'left' | 'right', { rotation: Vec3; weight: number }>
    for (const side of ['left', 'right'] as const) {
      const target = targets?.[side] ?? null
      if (target) {
        // Winkelsprünge bei ±180° vermeiden: Ziel in die Nähe des letzten Werts legen.
        const unwrapped = target.map((v, i) => {
          const previous = this.last[side][i]!
          return v + 360 * Math.round((previous - v) / 360)
        })
        this.last[side] = unwrapped.map((v, i) => this.filters[side][i]!.filter(v, timeSec)) as unknown as Vec3
      }
      const goal = target ? 1 : 0
      this.weights[side] += (goal - this.weights[side]) * (1 - Math.exp(-dtSec / 0.2))
      result[side] = { rotation: this.last[side], weight: this.weights[side] }
    }
    return result
  }
}
