import { createImage, fillRect, type RgbaImage } from '../image/rgba-image'
import type { Vec3 } from '../math/vec'
import { boxUv } from '../model/box-uv'
import { FACE_DIRS } from '../model/avatar-model'

/**
 * Eigener Platzhalter-Skin, der beim Start angezeigt wird.
 * (Mojangs Steve/Alex-Texturen dürfen nicht mitgeliefert werden.)
 */
const SKIN = 0xe3b48fff
const SKIN_SHADE = 0xcf9d78ff
const HAIR = 0x4b2e1fff
const EYE_WHITE = 0xf4f4f4ff
const EYE = 0x3b6fd1ff
const MOUTH = 0x9c5a4cff
const SHIRT = 0x2f9e8fff
const SHIRT_DARK = 0x237a6eff
const PANTS = 0x3a3f6bff
const SHOES = 0x5b5b5bff

function paintBox(image: RgbaImage, u: number, v: number, size: Vec3, color: number): void {
  const faces = boxUv(u, v, size)
  for (const dir of FACE_DIRS) {
    const f = faces[dir]
    fillRect(image, Math.min(f.u0, f.u1), Math.min(f.v0, f.v1), Math.abs(f.u1 - f.u0), Math.abs(f.v1 - f.v0), color)
  }
}

/** Seitenflächen (rechts, vorne, links, hinten) eines Box-UV-Netzes ab Zeile `fromRow` füllen. */
function paintSides(image: RgbaImage, u: number, v: number, size: Vec3, fromRow: number, rows: number, color: number): void {
  const [w, , d] = size
  fillRect(image, u, v + d + fromRow, 2 * (w + d), rows, color)
}

export function createPlaceholderSkin(): RgbaImage {
  const img = createImage(64, 64)
  const head: Vec3 = [8, 8, 8]
  const body: Vec3 = [8, 12, 4]
  const limb: Vec3 = [4, 12, 4]

  // Kopf: Haut, Haare oben/hinten, Gesicht vorne
  paintBox(img, 0, 0, head, SKIN)
  fillRect(img, 8, 0, 8, 8, HAIR) // oben
  paintSides(img, 0, 0, head, 0, 2, HAIR)
  fillRect(img, 24, 8, 8, 8, HAIR) // hinten
  fillRect(img, 0, 10, 3, 3, HAIR) // Koteletten rechts
  fillRect(img, 21, 10, 3, 3, HAIR) // Koteletten links
  // Gesicht (vorne: 8..15 × 8..15)
  fillRect(img, 9, 12, 2, 1, EYE_WHITE)
  fillRect(img, 13, 12, 2, 1, EYE_WHITE)
  fillRect(img, 10, 12, 1, 1, EYE)
  fillRect(img, 13, 12, 1, 1, EYE)
  fillRect(img, 11, 14, 2, 1, MOUTH)
  fillRect(img, 11, 13, 2, 1, SKIN_SHADE) // Nase

  // Körper
  paintBox(img, 16, 16, body, SHIRT)
  fillRect(img, 20, 30, 8, 2, SHIRT_DARK) // Saum vorne

  // Arme: Ärmel oben, darunter Haut
  for (const [u, v] of [[40, 16], [32, 48]] as const) {
    paintBox(img, u, v, limb, SKIN)
    paintSides(img, u, v, limb, 0, 4, SHIRT)
    fillRect(img, u + 4, v, 4, 4, SHIRT) // Schulter oben
  }

  // Beine: Hose, Schuhe
  for (const [u, v] of [[0, 16], [16, 48]] as const) {
    paintBox(img, u, v, limb, PANTS)
    paintSides(img, u, v, limb, 10, 2, SHOES)
    fillRect(img, u + 8, v, 4, 4, SHOES) // Sohle
  }

  return img
}
