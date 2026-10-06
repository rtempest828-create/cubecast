import { computed, signal } from '@preact/signals'
import type { FiguraAvatar } from '@core/figura/figura-avatar'
import type { VanillaId } from '@core/figura/vanilla-scan'
import { buildAvatarModel } from '@core/model/build-avatar'
import { NO_COSMETICS, type CosmeticSettings } from '@core/model/cosmetics'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { normalizeSkin, type NormalizedSkin, type SkinModelType } from '@core/skin/skin'

/** Zentraler UI-Zustand (Preact Signals). */

export type TabId = 'model' | 'tracking' | 'face' | 'physics' | 'animations' | 'output' | 'settings'

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

export const vanillaHidden = computed<ReadonlySet<VanillaId>>(() => {
  const figura = loadedFigura.value
  if (!figura) return new Set()
  return new Set(vanillaOverride.value ?? figura.avatar.hiddenVanilla)
})

export const avatarModel = computed(() =>
  buildAvatarModel({
    skin: loadedSkin.value.skin,
    modelType: effectiveModel.value,
    cosmetics: cosmeticSettings.value,
    figura: loadedFigura.value?.avatar ?? null,
    vanillaHidden: vanillaHidden.value
  })
)

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
