import { computed, signal } from '@preact/signals'
import type { FiguraAvatar } from '@core/figura/figura-avatar'
import type { VanillaId } from '@core/figura/vanilla-scan'
import { applyChibi, chibiSkinPlan, DEFAULT_CHIBI, resampleSkin, type ChibiSettings } from '@core/chibi/chibi'
import type { RgbaImage } from '@core/image/rgba-image'
import { buildAvatarModel } from '@core/model/build-avatar'
import { SKIN_TEXTURE_ID } from '@core/model/vanilla-avatar'
import { NO_COSMETICS, type CosmeticSettings } from '@core/model/cosmetics'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { normalizeSkin, type NormalizedSkin, type SkinModelType } from '@core/skin/skin'

/** Zentraler UI-Zustand (Preact Signals). */

export type TabId = 'model' | 'tracking' | 'face' | 'physics' | 'animations' | 'script' | 'output' | 'settings'

export type SkinSource =
  | { readonly kind: 'placeholder' }
  | { readonly kind: 'file'; readonly fileName: string }
  | { readonly kind: 'player'; readonly name: string }

export interface LoadedSkin {
  readonly skin: NormalizedSkin
  readonly source: SkinSource
  /** Modelltyp laut Mojang-Profil (nur beim Download per Spielername bekannt). */
  readonly officialModel: SkinModelType | null
}

export type ModelChoice = 'auto' | SkinModelType

export const activeTab = signal<TabId>('model')

export const loadedSkin = signal<LoadedSkin>({
  skin: normalizeSkin(createPlaceholderSkin()),
  source: { kind: 'placeholder' },
  officialModel: null
})

export const modelChoice = signal<ModelChoice>('auto')
export const showOuterLayer = signal(true)

/** Automatisch ermittelter Modelltyp: Mojang-Angabe vor Pixel-Heuristik. */
export const autoModel = computed<SkinModelType>(() => loadedSkin.value.officialModel ?? loadedSkin.value.skin.detectedModel)

export const effectiveModel = computed<SkinModelType>(() => (modelChoice.value === 'auto' ? autoModel.value : modelChoice.value))

/** Eingebautes Test-Zubehör; wird pro Avatar mit der Rollen-Zuordnung gespeichert (siehe rig-state). */
export const cosmeticSettings = signal<CosmeticSettings>(NO_COSMETICS)

export interface LoadedFigura {
  /** Schlüssel des Ordners (auch für die gespeicherte Zuordnung). */
  readonly key: string
  readonly location: string
  readonly avatar: FiguraAvatar
}

/** Geladener Figura-Avatar (zusätzlich zum Skin, der den Minecraft-Körper liefert). */
export const loadedFigura = signal<LoadedFigura | null>(null)

/** Eigene Auswahl ausgeblendeter Vanilla-Teile; null = wie im Figura-Skript. Wird mit der Zuordnung gespeichert. */
export const vanillaOverride = signal<readonly VanillaId[] | null>(null)

/** Läuft das Lua-Skript, bestimmt es die Vanilla-Sichtbarkeit selbst (statt der Text-Suche). */
export const luaControlsVanilla = signal(false)

export const vanillaHidden = computed<ReadonlySet<VanillaId>>(() => {
  const figura = loadedFigura.value
  if (!figura) return new Set()
  if (vanillaOverride.value) return new Set(vanillaOverride.value)
  return luaControlsVanilla.value ? new Set() : new Set(figura.avatar.hiddenVanilla)
})

/** Modell ohne Chibi-Umbau. */
export const baseAvatarModel = computed(() =>
  buildAvatarModel({
    skin: loadedSkin.value.skin,
    modelType: effectiveModel.value,
    cosmetics: cosmeticSettings.value,
    figura: loadedFigura.value?.avatar ?? null,
    vanillaHidden: vanillaHidden.value
  })
)

/** Chibi-Modus (pro Avatar gespeichert, siehe rig-state). */
export const chibiSettings = signal<ChibiSettings>(DEFAULT_CHIBI)

export const chibiResult = computed(() => applyChibi(baseAvatarModel.value, chibiSettings.value, SKIN_TEXTURE_ID))

/** Das angezeigte Modell (ggf. als Chibi). */
export const avatarModel = computed(() => chibiResult.value.model)

/** Skin-Textur für den Chibi-Modus umrechnen (die Laufzeit setzt die Skin-Textur immer wieder neu). */
export const chibiSkinTransform = computed<(image: RgbaImage) => RgbaImage>(() => {
  const settings = chibiSettings.value
  const plan = chibiSkinPlan(baseAvatarModel.value, settings, SKIN_TEXTURE_ID)
  if (plan.length === 0) return (image) => image
  return (image) => resampleSkin(image, 64, plan, settings.textureMode)
})

// ---------------------------------------------------------------------------
// Hinweise/Fehlermeldungen („Toasts“)

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  readonly id: number
  readonly kind: ToastKind
  readonly message: string
}

export const toasts = signal<readonly Toast[]>([])
let nextToastId = 1

export function pushToast(kind: ToastKind, message: string): void {
  const id = nextToastId++
  toasts.value = [...toasts.value.slice(-4), { id, kind, message }]
  setTimeout(() => dismissToast(id), kind === 'error' ? 9000 : 3500)
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}
