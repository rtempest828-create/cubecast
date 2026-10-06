import { quatConjugate, quatMirrorX, quatMultiply, quatToEulerZYX, type Quat } from '../math/quat'
import type { HeadRotation } from './types'

/**
 * Kopfrotation relativ zur kalibrierten Neutralhaltung.
 *
 * Koordinaten: MediaPipe beschreibt das Gesicht im Kameraraum (x rechts im Bild,
 * y oben, z zur Kamera). Unsere Figur steht genauso (schaut nach +Z zur Kamera),
 * daher lässt sich die Rotation direkt übertragen. Ohne Spiegelung verhält sich die
 * Figur wie das unveränderte Kamerabild, mit Spiegelung wie ein Spiegelbild.
 */
export function relativeHeadRotation(current: Quat, neutral: Quat, mirror: boolean): HeadRotation {
  let delta = quatMultiply(current, quatConjugate(neutral))
  if (mirror) delta = quatMirrorX(delta)
  const [pitch, yaw, roll] = quatToEulerZYX(delta)
  return { pitch, yaw, roll }
}
