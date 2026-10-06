import { decodePng, PngDecodeError } from '@core/image/png-decode'
import { normalizeSkin, SkinError, type SkinModelType } from '@core/skin/skin'
import { t } from '@shared/i18n'
import { MAX_SKIN_FILE_BYTES } from '@shared/ipc'
import { loadedSkin, modelChoice, pushToast, type SkinSource } from '../state/app-state'

/** Übersetzt Fehler beim Laden in eine verständliche Meldung. */
export function describeSkinError(error: unknown): string {
  if (error instanceof PngDecodeError) return t('error.skin.decode', { reason: error.reason })
  if (error instanceof SkinError) return t('error.skin.size', error.details)
  console.error('[Skin] unerwarteter Fehler:', error)
  return t('error.skin.unknown')
}

/** Dekodiert, prüft und übernimmt einen Skin. Gibt bei Fehlern eine Meldung aus statt zu werfen. */
export async function loadSkinFromBytes(bytes: Uint8Array, source: SkinSource, officialModel: SkinModelType | null = null): Promise<boolean> {
  try {
    const skin = normalizeSkin(await decodePng(bytes))
    loadedSkin.value = { skin, source, officialModel }
    modelChoice.value = 'auto'
    pushToast('success', t('toast.skinLoaded'))
    return true
  } catch (error) {
    pushToast('error', describeSkinError(error))
    return false
  }
}

/** Per Drag & Drop abgelegte Datei laden. */
export async function loadSkinFromFile(file: File): Promise<void> {
  if (!file.name.toLowerCase().endsWith('.png') && file.type !== 'image/png') {
    pushToast('error', t('error.skin.notPng'))
    return
  }
  if (file.size > MAX_SKIN_FILE_BYTES) {
    pushToast('error', t('error.file.too-large'))
    return
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    await loadSkinFromBytes(bytes, { kind: 'file', fileName: file.name })
  } catch {
    pushToast('error', t('error.file.read-failed'))
  }
}

export async function openSkinFileDialog(): Promise<void> {
  const result = await window.vtuber.skin.openFile()
  if (result.ok) {
    await loadSkinFromBytes(result.data, { kind: 'file', fileName: result.fileName })
  } else if (result.error !== 'cancelled') {
    pushToast('error', t(`error.file.${result.error}`))
  }
}

export async function downloadPlayerSkin(name: string): Promise<void> {
  const result = await window.vtuber.skin.downloadByName(name)
  if (result.ok) {
    await loadSkinFromBytes(result.png, { kind: 'player', name: result.name }, result.model)
  } else {
    pushToast('error', t(`error.download.${result.error}`))
  }
}
