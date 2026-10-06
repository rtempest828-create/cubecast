import type { Vec3 } from './vec'

/** Quaternion als Tupel [x, y, z, w]. */
export type Quat = readonly [number, number, number, number]

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1]

const DEG = 180 / Math.PI
const RAD = Math.PI / 180

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ]
}

/** Inverse einer Einheits-Quaternion. */
export function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]]
}

export function quatNormalize(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length]
}

/**
 * Spiegelung an der YZ-Ebene (x → −x): Nicken bleibt, Drehen und Neigen kehren sich um.
 * So verhält sich ein Spiegelbild.
 */
export function quatMirrorX(q: Quat): Quat {
  return [q[0], -q[1], -q[2], q[3]]
}

/**
 * Rotationsanteil einer 4×4-Matrix (spaltenweise gespeichert, wie bei MediaPipe und WebGL).
 * Eine eventuelle Skalierung wird vorher herausgerechnet.
 */
export function quatFromMatrix4(m: ArrayLike<number>): Quat {
  const sx = Math.hypot(m[0]!, m[1]!, m[2]!) || 1
  const sy = Math.hypot(m[4]!, m[5]!, m[6]!) || 1
  const sz = Math.hypot(m[8]!, m[9]!, m[10]!) || 1
  // r[Zeile][Spalte]
  const r00 = m[0]! / sx, r10 = m[1]! / sx, r20 = m[2]! / sx
  const r01 = m[4]! / sy, r11 = m[5]! / sy, r21 = m[6]! / sy
  const r02 = m[8]! / sz, r12 = m[9]! / sz, r22 = m[10]! / sz

  const trace = r00 + r11 + r22
  let q: Quat
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    q = [(r21 - r12) * s, (r02 - r20) * s, (r10 - r01) * s, 0.25 / s]
  } else if (r00 > r11 && r00 > r22) {
    const s = 2 * Math.sqrt(1 + r00 - r11 - r22)
    q = [0.25 * s, (r01 + r10) / s, (r02 + r20) / s, (r21 - r12) / s]
  } else if (r11 > r22) {
    const s = 2 * Math.sqrt(1 + r11 - r00 - r22)
    q = [(r01 + r10) / s, 0.25 * s, (r12 + r21) / s, (r02 - r20) / s]
  } else {
    const s = 2 * Math.sqrt(1 + r22 - r00 - r11)
    q = [(r02 + r20) / s, (r12 + r21) / s, 0.25 * s, (r10 - r01) / s]
  }
  return quatNormalize(q)
}

/**
 * Euler-Winkel in Grad mit Reihenfolge ZYX (Matrix = Rz · Ry · Rx), wie Blockbench,
 * Minecraft und Figura sie verwenden. Ergebnis: [x (Nicken), y (Drehen), z (Neigen)].
 */
export function quatToEulerZYX(q: Quat): Vec3 {
  const [x, y, z, w] = q
  const r00 = 1 - 2 * (y * y + z * z)
  const r10 = 2 * (x * y + w * z)
  const r20 = 2 * (x * z - w * y)
  const r21 = 2 * (y * z + w * x)
  const r22 = 1 - 2 * (x * x + y * y)
  const r01 = 2 * (x * y - w * z)
  const r11 = 1 - 2 * (x * x + z * z)

  const ry = Math.asin(Math.max(-1, Math.min(1, -r20)))
  if (Math.abs(r20) < 0.9999999) {
    return [Math.atan2(r21, r22) * DEG, ry * DEG, Math.atan2(r10, r00) * DEG]
  }
  // Kardanische Blockade (±90° Drehung): Neigen in die Z-Achse legen.
  return [0, ry * DEG, Math.atan2(-r01, r11) * DEG]
}

/** Gegenstück zu `quatToEulerZYX` (Winkel in Grad). */
export function quatFromEulerZYX(xDeg: number, yDeg: number, zDeg: number): Quat {
  const hx = (xDeg * RAD) / 2
  const hy = (yDeg * RAD) / 2
  const hz = (zDeg * RAD) / 2
  const qx: Quat = [Math.sin(hx), 0, 0, Math.cos(hx)]
  const qy: Quat = [0, Math.sin(hy), 0, Math.cos(hy)]
  const qz: Quat = [0, 0, Math.sin(hz), Math.cos(hz)]
  return quatMultiply(quatMultiply(qz, qy), qx)
}

/** Spaltenweise 4×4-Matrix aus Quaternion und Verschiebung (für Tests und Simulator). */
export function matrix4FromQuat(q: Quat, translation: Vec3 = [0, 0, 0]): number[] {
  const [x, y, z, w] = q
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y), 0,
    2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x), 0,
    2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y), 0,
    translation[0], translation[1], translation[2], 1
  ]
}
