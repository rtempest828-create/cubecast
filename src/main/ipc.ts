import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { t } from '../shared/i18n'
import { IPC, MAX_SKIN_FILE_BYTES, type FiguraAvatarEntry, type FiguraFolderResult, type OpenFileResult, type SkinDownloadResult } from '../shared/ipc'
import type { AvatarStore } from './avatar-store'
import { FiguraRegistry } from './figura-import'
import { downloadSkinByName } from './skin-download'

/** Nur Anfragen aus unseren eigenen Fenstern beantworten. */
export function isTrustedUrl(senderUrl: string, appUrl: string): boolean {
  try {
    const sender = new URL(senderUrl)
    const app = new URL(appUrl)
    if (app.protocol === 'file:') {
      // Pfade vergleichen statt Strings: Kodierung (%20) und Groß-/Kleinschreibung variieren unter Windows.
      const normalize = (u: URL): string => decodeURIComponent(u.pathname).toLowerCase()
      return sender.protocol === 'file:' && normalize(sender) === normalize(app)
    }
    // Nicht `origin` vergleichen: Für eigene Protokolle (app:) ist sie laut URL-Standard „null“.
    return sender.protocol === app.protocol && sender.host === app.host
  } catch {
    return false
  }
}

function isTrustedSender(event: IpcMainInvokeEvent, appUrl: string): boolean {
  return isTrustedUrl(event.senderFrame?.url ?? '', appUrl)
}

export function registerIpcHandlers(appUrl: string, avatarStore: AvatarStore): void {
  const figura = new FiguraRegistry()

  ipcMain.handle(IPC.figuraList, async (event): Promise<readonly FiguraAvatarEntry[]> => {
    if (!isTrustedSender(event, appUrl)) return []
    try {
      const examples = join(app.getAppPath(), 'examples', 'figura')
      return await figura.scan(app.getPath('appData'), [{ dir: examples, location: t('figura.location.examples') }])
    } catch (error) {
      console.warn('[Figura] Suche fehlgeschlagen:', error)
      return []
    }
  })

  ipcMain.handle(IPC.figuraLoad, async (event, key: unknown): Promise<FiguraFolderResult> => {
    if (!isTrustedSender(event, appUrl) || typeof key !== 'string') return { ok: false, error: 'not-found' }
    return figura.load(key)
  })

  ipcMain.handle(IPC.figuraOpenFolder, async (event): Promise<FiguraFolderResult> => {
    if (!isTrustedSender(event, appUrl)) return { ok: false, error: 'read-failed' }
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = { title: t('dialog.openFigura.title'), properties: ['openDirectory'] }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const folder = result.filePaths[0]
    if (result.canceled || !folder) return { ok: false, error: 'cancelled' }
    return figura.load(figura.register(folder, t('figura.location.folder')))
  })

  ipcMain.handle(IPC.avatarConfigLoad, async (event, key: unknown): Promise<unknown> => {
    if (!isTrustedSender(event, appUrl)) return null
    return avatarStore.load(key)
  })

  ipcMain.handle(IPC.avatarConfigSave, async (event, key: unknown, data: unknown): Promise<boolean> => {
    if (!isTrustedSender(event, appUrl)) return false
    return avatarStore.save(key, data)
  })

  ipcMain.handle(IPC.skinDownloadByName, async (event, name: unknown): Promise<SkinDownloadResult> => {
    if (!isTrustedSender(event, appUrl) || typeof name !== 'string') return { ok: false, error: 'invalid-name' }
    return downloadSkinByName(name)
  })

  ipcMain.handle(IPC.skinOpenFile, async (event): Promise<OpenFileResult> => {
    if (!isTrustedSender(event, appUrl)) return { ok: false, error: 'read-failed' }
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: t('dialog.openSkin.title'),
      filters: [{ name: t('dialog.openSkin.filter'), extensions: ['png'] }],
      properties: ['openFile']
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return { ok: false, error: 'cancelled' }
    try {
      const info = await stat(filePath)
      if (info.size > MAX_SKIN_FILE_BYTES) return { ok: false, error: 'too-large' }
      const data = await readFile(filePath)
      return { ok: true, data: new Uint8Array(data), fileName: basename(filePath) }
    } catch (error) {
      console.warn('[Datei] konnte nicht gelesen werden:', error)
      return { ok: false, error: 'read-failed' }
    }
  })
}
