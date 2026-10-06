import type { VanillaLayerId, VanillaPartId } from '../skin/vanilla-parts'

export type VanillaId = VanillaPartId | VanillaLayerId

export const VANILLA_PARTS: readonly VanillaPartId[] = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']
export const VANILLA_LAYERS: readonly VanillaLayerId[] = ['hat', 'jacket', 'rightSleeve', 'leftSleeve', 'rightPants', 'leftPants']
export const ALL_VANILLA: readonly VanillaId[] = [...VANILLA_PARTS, ...VANILLA_LAYERS]

/** Figuras `vanilla_model`-Namen → unsere Teile. */
const GROUPS: Readonly<Record<string, readonly VanillaId[]>> = {
  ALL: ALL_VANILLA,
  PLAYER: ALL_VANILLA,
  INNER_LAYER: VANILLA_PARTS,
  OUTER_LAYER: VANILLA_LAYERS,
  HEAD: ['head'],
  BODY: ['body'],
  LEFT_ARM: ['leftArm'],
  RIGHT_ARM: ['rightArm'],
  LEFT_LEG: ['leftLeg'],
  RIGHT_LEG: ['rightLeg'],
  HAT: ['hat'],
  JACKET: ['jacket'],
  LEFT_SLEEVE: ['leftSleeve'],
  RIGHT_SLEEVE: ['rightSleeve'],
  LEFT_PANTS: ['leftPants'],
  RIGHT_PANTS: ['rightPants']
}

/** Entfernt Lua-Kommentare (Zeilen- und Blockkommentare), damit auskommentierter Code nicht zählt. */
function stripComments(source: string): string {
  return source.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, '').replace(/--[^\n]*/g, '')
}

/**
 * Übergangslösung bis zur Lua-Laufzeit (M5c): findet einfache Aufrufe wie
 * `vanilla_model.PLAYER:setVisible(false)` in den Skripten und blendet diese Teile aus.
 */
export function scanHiddenVanilla(scripts: readonly string[]): Set<VanillaId> {
  const hidden = new Set<VanillaId>()
  const pattern = /vanilla_model\s*\.\s*([A-Z_]+)\s*:\s*setVisible\s*\(\s*false\s*\)/g
  for (const script of scripts) {
    for (const match of stripComments(script).matchAll(pattern)) {
      for (const id of GROUPS[match[1] ?? ''] ?? []) hidden.add(id)
    }
  }
  return hidden
}
