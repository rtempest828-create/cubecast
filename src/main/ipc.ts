import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { t } from '../shared/i18n'
import { IPC, MAX_SKIN_FILE_BYTES, type OpenFileResult, type SkinDownloadResult } from '../shared/ipc'
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

export function registerIpcHandlers(appUrl: string): void {
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
