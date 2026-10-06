/**
 * Dreidimensionaler Vektor als Tupel. Bewusst kein Klassenobjekt, damit die
 * Werte direkt mit dem `.bbmodel`-Format (Arrays) und JSON kompatibel sind.
 */
export type Vec3 = readonly [number, number, number]

export const ZERO3: Vec3 = [0, 0, 0]

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
