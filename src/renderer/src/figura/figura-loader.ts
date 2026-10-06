import { signal } from '@preact/signals'
import { loadFiguraAvatar } from '@core/figura/figura-avatar'
import { logger } from '@core/log/logger'
import { t } from '@shared/i18n'
import type { FiguraAvatarEntry, FiguraFolderResult } from '@shared/ipc'
import { loadedFigura, pushToast } from '../state/app-state'

/** Gefundene Avatare in den Figura-Ordnern der Launcher. */
export const figuraEntries = signal<readonly FiguraAvatarEntry[]>([])
export const figuraSearching = signal(false)
export const figuraLoading = signal(false)

export async function refreshFiguraList(): Promise<void> {
  if (figuraSearching.peek()) return
  figuraSearching.value = true
  try {
    figuraEntries.value = await window.vtuber.figura.list()
  } catch (error) {
    logger.warn('Figura', `Suche fehlgeschlagen: ${String(error)}`)
    figuraEntries.value = []
  } finally {
    figuraSearching.value = false
  }
}

async function applyResult(result: FiguraFolderResult): Promise<void> {
  if (!result.ok) {
    if (result.error !== 'cancelled') pushToast('error', t(`figura.error.${result.error}`))
    return
  }
  try {
    const avatar = await loadFiguraAvatar(result.folderName, result.files)
    for (const warning of avatar.warnings) logger.info('Figura', warning)
    loadedFigura.value = { key: result.key, location: result.location, avatar }
    pushToast('success', t('figura.toast.loaded', { name: avatar.name }))
  } catch (error) {
    pushToast('error', t('figura.error.parse', { reason: error instanceof Error ? error.message : String(error) }))
  }
}

async function withLoading(task: () => Promise<FiguraFolderResult>): Promise<void> {
  if (figuraLoading.peek()) return
  figuraLoading.value = true
  try {
    await applyResult(await task())
  } finally {
    figuraLoading.value = false
  }
}

export function loadFigura(key: string): Promise<void> {
  return withLoading(() => window.vtuber.figura.load(key))
}

export function openFiguraFolder(): Promise<void> {
  return withLoading(() => window.vtuber.figura.openFolder())
}

export function unloadFigura(): void {
  if (!loadedFigura.peek()) return
  loadedFigura.value = null
  pushToast('info', t('figura.toast.unloaded'))
}
