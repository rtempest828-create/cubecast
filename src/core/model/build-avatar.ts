import type { FiguraAvatar } from '../figura/figura-avatar'
import type { SkinModelType, NormalizedSkin } from '../skin/skin'
import type { AvatarModel, PartNode, TextureDef } from './avatar-model'
import type { CosmeticSettings } from './cosmetics'
import { buildVanillaAvatar } from './vanilla-avatar'

export interface AvatarBuildOptions {
  readonly skin: NormalizedSkin
  readonly modelType: SkinModelType
  readonly cosmetics: CosmeticSettings
  readonly figura: FiguraAvatar | null
  /** Ausgeblendete Vanilla-Teile (z. B. „head“, „hat“) – wie Figuras `vanilla_model`. */
  readonly vanillaHidden: ReadonlySet<string>
}

/** Blendet Vanilla-Teile aus (rekursiv nur über ihre `vanillaId`). */
function applyVanillaVisibility(part: PartNode, hidden: ReadonlySet<string>): PartNode {
  const visible = part.vanillaId && hidden.has(part.vanillaId) ? false : part.visible
  return { ...part, visible, children: part.children.map((child) => applyVanillaVisibility(child, hidden)) }
}

/**
 * Gesamtmodell: Vanilla-Skin (mit Gesichts-Overlay und Test-Zubehör) plus alle
 * Modelle eines Figura-Avatars als weitere Kinder der Wurzel.
 */
export function buildAvatarModel(options: AvatarBuildOptions): AvatarModel {
  const base = buildVanillaAvatar(options.skin, options.modelType, options.cosmetics)
  const vanilla = base.root.children.map((part) => applyVanillaVisibility(part, options.vanillaHidden))
  if (!options.figura) return { ...base, root: { ...base.root, children: vanilla } }

  const textures = new Map<string, TextureDef>(base.textures)
  for (const model of options.figura.models) for (const texture of model.textures) textures.set(texture.id, texture)
  return { root: { ...base.root, children: [...vanilla, ...options.figura.models.map((m) => m.root)] }, textures }
}
