import type { RgbaImage } from '../image/rgba-image'
import type { Vec3 } from '../math/vec'
import type { VanillaLayerId, VanillaPartId } from '../skin/vanilla-parts'

/**
 * Gemeinsames Modellformat für Vanilla-Skin, `.bbmodel`-Teile und das Gesichts-Overlay.
 *
 * Koordinaten wie im Blockbench-Format: absolut im Modellraum (Einheit = Pixel,
 * Y nach oben, Figur schaut nach +Z). Drehpunkte und Würfel sind absolut angegeben,
 * die Umrechnung in relative Positionen erledigt der Renderer.
 */

/** Würfelseite, benannt nach ihrer Normalen. */
export type FaceDir = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'

export const FACE_DIRS: readonly FaceDir[] = ['+x', '-x', '+y', '-y', '+z', '-z']

/**
 * UV-Rechteck einer Würfelseite in Textur-Einheiten (siehe `TextureDef.uvWidth`).
 * (u0, v0) liegt an der Ecke „oben links“ der Seite laut Konvention in `cube-geometry.ts`.
 * u1 < u0 bzw. v1 < v0 bedeutet gespiegelt.
 */
export interface FaceUv {
  readonly u0: number
  readonly v0: number
  readonly u1: number
  readonly v1: number
}

/** Wie ein Würfel gezeichnet wird. */
export type RenderLayer =
  /** deckend, nur Vorderseiten */
  | 'opaque'
  /** Alpha-Test (Pixel ganz sichtbar oder ganz weg), beidseitig – wie Minecrafts Außenschicht */
  | 'cutout'

export interface CubeDef {
  readonly id: string
  readonly name: string
  readonly from: Vec3
  readonly to: Vec3
  /** Vergrößerung in jede Richtung, UVs bleiben gleich. */
  readonly inflate: number
  readonly textureId: string
  readonly layer: RenderLayer
  /** Fehlende Seiten werden nicht gezeichnet. */
  readonly faces: Readonly<Partial<Record<FaceDir, FaceUv>>>
}

/** Herkunft eines Teils (für Baumansicht, Rollen-Vorschläge, Figura-APIs). */
export type PartOrigin = 'root' | 'vanilla' | 'vanilla-layer' | 'bbmodel' | 'face-overlay' | 'cosmetic'

export interface PartNode {
  readonly id: string
  readonly name: string
  readonly origin: PartOrigin
  readonly pivot: Vec3
  /** Ruhe-Rotation in Grad (Euler, Reihenfolge ZYX wie in Blockbench). */
  readonly rotation: Vec3
  readonly visible: boolean
  readonly vanillaId?: VanillaPartId | VanillaLayerId
  readonly cubes: readonly CubeDef[]
  readonly children: readonly PartNode[]
}

export interface TextureDef {
  readonly id: string
  readonly name: string
  readonly image: RgbaImage
  /** Größe des UV-Raums (bei HD-Skins 64, obwohl das Bild größer ist). */
  readonly uvWidth: number
  readonly uvHeight: number
}

export interface AvatarModel {
  readonly root: PartNode
  readonly textures: ReadonlyMap<string, TextureDef>
}

/** Durchläuft alle Teile in Tiefensuche (Eltern vor Kindern). */
export function walkParts(node: PartNode, visit: (part: PartNode, parent: PartNode | null) => void, parent: PartNode | null = null): void {
  visit(node, parent)
  for (const child of node.children) walkParts(child, visit, node)
}

export function findPart(root: PartNode, id: string): PartNode | undefined {
  let found: PartNode | undefined
  walkParts(root, (part) => {
    if (!found && part.id === id) found = part
  })
  return found
}
