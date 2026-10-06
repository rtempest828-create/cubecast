import type { Vec3 } from '../math/vec'
import type { FaceDir, FaceUv } from './avatar-model'

/**
 * Minecraft-„Box-UV“: Aus einem Ursprung (u, v) und der Würfelgröße ergibt sich das
 * bekannte Netz-Layout der Skin-Textur:
 *
 *            [ oben ][ unten ]
 *   [rechts][ vorne ][ links ][ hinten ]
 *
 * „rechts/links“ aus Sicht der Figur: rechts = −X, links = +X; vorne = +Z.
 * Die Ausrichtung jeder Seite (welche Ecke „oben links“ ist) steht in `cube-geometry.ts`
 * und entspricht `ModelPart.Cube` in Minecraft (inklusive der Eigenheit, dass die
 * Unterseite dieselbe Ausrichtung wie die Oberseite hat).
 */
export function boxUv(u: number, v: number, size: Vec3): Record<FaceDir, FaceUv> {
  const [w, h, d] = size
  return {
    '+y': { u0: u + d, v0: v, u1: u + d + w, v1: v + d },
    '-y': { u0: u + d + w, v0: v, u1: u + d + 2 * w, v1: v + d },
    '-x': { u0: u, v0: v + d, u1: u + d, v1: v + d + h },
    '+z': { u0: u + d, v0: v + d, u1: u + d + w, v1: v + d + h },
    '+x': { u0: u + d + w, v0: v + d, u1: u + 2 * d + w, v1: v + d + h },
    '-z': { u0: u + 2 * d + w, v0: v + d, u1: u + 2 * d + 2 * w, v1: v + d + h }
  }
}
