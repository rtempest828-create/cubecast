import type { RoleId } from '../roles/roles'

/**
 * Figura-„Parent-Types“: Gruppen, deren Name mit einem dieser Schlüsselwörter beginnt,
 * hängen an einem Teil des Spielermodells (z. B. „Head“ folgt dem Kopf).
 *
 * - `role`: welche Rolle das Teil bei uns bekommt (Tracking, Körperneigung, Arm-Tracking)
 * - `hidden`: gehört zu Ansichten, die es hier nicht gibt (GUI, Schädel, Kamera …)
 */
export interface ParentTypeInfo {
  readonly type: string
  readonly role: RoleId | null
  readonly hidden: boolean
}

const TYPES: readonly ParentTypeInfo[] = [
  { type: 'Head', role: 'head', hidden: false },
  { type: 'Body', role: 'body', hidden: false },
  { type: 'LeftArm', role: 'leftArm', hidden: false },
  { type: 'RightArm', role: 'rightArm', hidden: false },
  { type: 'LeftLeg', role: 'leftLeg', hidden: false },
  { type: 'RightLeg', role: 'rightLeg', hidden: false },
  // Umhang und Elytren hängen am Körper.
  { type: 'Cape', role: 'body', hidden: false },
  { type: 'LeftElytron', role: 'body', hidden: false },
  { type: 'LeftElytra', role: 'body', hidden: false },
  { type: 'RightElytron', role: 'body', hidden: false },
  { type: 'RightElytra', role: 'body', hidden: false },
  // Weltfest: bleibt einfach stehen.
  { type: 'World', role: null, hidden: false },
  // Nur in Spielansichten sinnvoll, die es hier nicht gibt.
  { type: 'Skull', role: null, hidden: true },
  { type: 'Portrait', role: null, hidden: true },
  { type: 'Hud', role: null, hidden: true },
  { type: 'HUD', role: null, hidden: true },
  { type: 'Gui', role: null, hidden: true },
  { type: 'GUI', role: null, hidden: true },
  { type: 'Camera', role: null, hidden: true },
  { type: 'Arrow', role: null, hidden: true },
  { type: 'Trident', role: null, hidden: true },
  { type: 'Item', role: null, hidden: true },
  { type: 'LeftItemPivot', role: null, hidden: true },
  { type: 'RightItemPivot', role: null, hidden: true },
  { type: 'LeftSpyglassPivot', role: null, hidden: true },
  { type: 'RightSpyglassPivot', role: null, hidden: true },
  { type: 'HelmetItemPivot', role: null, hidden: true },
  { type: 'LeftParrotPivot', role: null, hidden: true },
  { type: 'RightParrotPivot', role: null, hidden: true }
]

// Längere Schlüsselwörter zuerst, damit z. B. „LeftItemPivot“ nicht als „LeftArm“-Fehltreffer endet.
const BY_LENGTH = [...TYPES].sort((a, b) => b.type.length - a.type.length)

/** Parent-Type einer Gruppe anhand des Namensanfangs (wie Figura) oder null. */
export function parentTypeOf(name: string): ParentTypeInfo | null {
  return BY_LENGTH.find((info) => name.startsWith(info.type)) ?? null
}
