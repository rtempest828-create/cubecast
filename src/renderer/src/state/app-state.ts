import { computed, signal } from '@preact/signals'
import { buildVanillaAvatar } from '@core/model/vanilla-avatar'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { normalizeSkin, type NormalizedSkin, type SkinModelType } from '@core/skin/skin'

/** Zentraler UI-Zustand (Preact Signals). */

export type TabId = 'model' | 'tracking' | 'face' | 'physics' | 'output' | 'settings'

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

export const avatarModel = computed(() => buildVanillaAvatar(loadedSkin.value.skin, effectiveModel.value))

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
