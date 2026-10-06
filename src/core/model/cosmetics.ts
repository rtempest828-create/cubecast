import { createImage, fillRect } from '../image/rgba-image'
import type { Vec3 } from '../math/vec'
import { FACE_DIRS, type CubeDef, type FaceDir, type FaceUv, type PartNode, type TextureDef } from './avatar-model'

/**
 * Eingebautes Test-Zubehör: Fuchsohren, ein dreiteiliger Fuchsschwanz und ein Headset.
 * Damit lässt sich die Physik ohne Figura-Avatar ausprobieren. Die Teile haben normale
 * Namen („Ohr links“, „Schwanz 1“ …), damit sie dieselbe Rollen-Erkennung durchlaufen
 * wie später importierte Teile.
 */
export interface CosmeticSettings {
  readonly foxEars: boolean
  readonly foxTail: boolean
  readonly headset: boolean
}

export const NO_COSMETICS: CosmeticSettings = { foxEars: false, foxTail: false, headset: false }

export const COSMETICS_TEXTURE_ID = 'cosmetics'

/** Farbpalette: jede Farbe belegt ein 4 × 4-Feld der 16 × 16-Textur. */
const PALETTE = {
  orange: 0xe0782cff,
  white: 0xf2f0eaff,
  darkOrange: 0xa9531aff,
  black: 0x1b1c1fff,
  darkGrey: 0x34363bff,
  grey: 0x55585eff,
  accent: 0x6fb8ffff
} as const
type ColorName = keyof typeof PALETTE
const COLOR_INDEX = Object.keys(PALETTE) as ColorName[]

export function createCosmeticsTexture(): TextureDef {
  const image = createImage(16, 16)
  COLOR_INDEX.forEach((name, i) => fillRect(image, (i % 4) * 4, Math.floor(i / 4) * 4, 4, 4, PALETTE[name]))
  return { id: COSMETICS_TEXTURE_ID, name: 'Zubehör', image, uvWidth: 16, uvHeight: 16 }
}

/** Alle Seiten eines Würfels in einer Farbe (Mitte des Farbfelds, damit nichts überblutet). */
function solid(color: ColorName): Partial<Record<FaceDir, FaceUv>> {
  const i = COLOR_INDEX.indexOf(color)
  const u = (i % 4) * 4 + 1
  const v = Math.floor(i / 4) * 4 + 1
  return Object.fromEntries(FACE_DIRS.map((dir) => [dir, { u0: u, v0: v, u1: u + 2, v1: v + 2 }]))
}

let cubeCounter = 0
function cube(name: string, from: Vec3, to: Vec3, color: ColorName): CubeDef {
  return { id: `cosmetic.cube.${name}.${cubeCounter++}`, name, from, to, inflate: 0, textureId: COSMETICS_TEXTURE_ID, layer: 'opaque', faces: solid(color) }
}

function part(id: string, name: string, pivot: Vec3, cubes: CubeDef[], children: PartNode[] = [], rotation: Vec3 = [0, 0, 0]): PartNode {
  return { id, name, origin: 'cosmetic', pivot, rotation, visible: true, cubes, children }
}

/** Ohr: Spiegelung über `side` (−1 = rechte Seite der Figur, +1 = linke). */
function ear(side: -1 | 1): PartNode {
  const x = (v: number): number => v * side
  const [a, b] = side < 0 ? [x(4), x(1)] : [x(1), x(4)]
  const name = side < 0 ? 'Ohr rechts' : 'Ohr links'
  return part(`cosmetic.ear.${side < 0 ? 'right' : 'left'}`, name, [x(2.5), 32, 0], [
    cube(`${name} außen`, [a, 32, -0.5], [b, 34.5, 0.5], 'orange'),
    cube(`${name} oben`, [Math.min(x(3.5), x(1.5)), 34.5, -0.5], [Math.max(x(3.5), x(1.5)), 35.5, 0.5], 'orange'),
    cube(`${name} Spitze`, [Math.min(x(3), x(2)), 35.5, -0.5], [Math.max(x(3), x(2)), 36.5, 0.5], 'darkOrange'),
    cube(`${name} innen`, [Math.min(x(3.5), x(1.5)), 32.5, 0.5], [Math.max(x(3.5), x(1.5)), 34.5, 0.75], 'white')
  ])
}

function tail(): PartNode {
  const tip = part('cosmetic.tail.3', 'Schwanz 3', [0, 13, -10.5], [cube('Schwanz Spitze', [-1.5, 11.5, -13.5], [1.5, 14.5, -10.5], 'white')], [], [15, 0, 0])
  const middle = part('cosmetic.tail.2', 'Schwanz 2', [0, 13, -6], [cube('Schwanz Mitte', [-2, 11, -10.5], [2, 15, -6], 'orange')], [tip], [15, 0, 0])
  return part('cosmetic.tail.1', 'Schwanz 1', [0, 13, -2], [cube('Schwanz Ansatz', [-1.5, 11.5, -6], [1.5, 14.5, -2], 'orange')], [middle], [-40, 0, 0])
}

/** Blockiges Headset mit Bügel, Ohrmuscheln und Mikrofonarm (rechte Seite der Figur). */
function headset(): PartNode {
  return part('cosmetic.headset', 'Headset', [0, 24, 0], [
    cube('Bügel', [-4.75, 32, -0.75], [4.75, 32.75, 0.75], 'black'),
    cube('Bügel rechts', [-4.75, 29.5, -0.75], [-4.25, 32, 0.75], 'black'),
    cube('Bügel links', [4.25, 29.5, -0.75], [4.75, 32, 0.75], 'black'),
    cube('Muschel rechts', [-5.5, 25.5, -2], [-4.25, 29.5, 2], 'darkGrey'),
    cube('Muschel links', [4.25, 25.5, -2], [5.5, 29.5, 2], 'darkGrey'),
    cube('Logo rechts', [-5.75, 26.75, -0.75], [-5.5, 28.25, 0.75], 'grey'),
    cube('Logo links', [5.5, 26.75, -0.75], [5.75, 28.25, 0.75], 'grey'),
    cube('Mikrofonarm', [-5.25, 26, 1.5], [-4.75, 26.5, 5.25], 'black'),
    cube('Mikrofon', [-5.1, 25.5, 4.75], [-3.6, 26.9, 6.1], 'grey')
  ])
}

/** Liefert die Zubehör-Teile für Kopf und Körper. */
export function buildCosmetics(settings: CosmeticSettings): { head: PartNode[]; body: PartNode[] } {
  cubeCounter = 0
  return {
    head: [...(settings.foxEars ? [ear(-1), ear(1)] : []), ...(settings.headset ? [headset()] : [])],
    body: settings.foxTail ? [tail()] : []
  }
}

export function hasCosmetics(settings: CosmeticSettings): boolean {
  return settings.foxEars || settings.foxTail || settings.headset
}
