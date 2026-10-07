import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import type { OutputMessage } from '../core/output/protocol'
import { t } from '../shared/i18n'
import {
  IPC,
  MAX_SKIN_FILE_BYTES,
  type AppInfo,
  type FiguraAvatarEntry,
  type FiguraFolderResult,
  type HotkeyResult,
  type OpenFileResult,
  type OutputStatus,
  type OutputWindowOptions,
  type ProfileSummary,
  type SkinDownloadResult
} from '../shared/ipc'
import type { AvatarStore } from './avatar-store'
import { FiguraRegistry } from './figura-import'
import { applyHotkeys, validBindings } from './hotkeys'
import type { OutputServer } from './output-server'
import type { OutputWindow } from './output-window'
import type { ProfileStore } from './profile-store'
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

function isTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent, appUrl: string): boolean {
  return isTrustedUrl(event.senderFrame?.url ?? '', appUrl)
}

export function registerIpcHandlers(appUrl: string, avatarStore: AvatarStore): FiguraRegistry {
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
  return figura
}

export interface OutputDeps {
  readonly output: OutputServer
  readonly outputWindow: OutputWindow
  readonly profiles: ProfileStore
  readonly figura: FiguraRegistry
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const MESSAGE_TYPES = new Set(['model', 'pose', 'texture', 'settings'])

/** Ausgabe (OBS/Fenster), Profile, globale Tastenkürzel und App-Infos. */
export function registerOutputHandlers(appUrl: string, deps: OutputDeps): void {
  const { output, outputWindow, profiles, figura } = deps
  const status = (): OutputStatus => ({ running: output.port > 0, url: output.url, clients: output.clientCount, windowOpen: outputWindow.isOpen })
  const notify = (): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents.getURL().startsWith(appUrl)) window.webContents.send(IPC.outputStatusChanged, status())
    }
  }
  output.onClientsChanged = notify
  outputWindow.onChanged = notify

  ipcMain.on(IPC.outputPublish, (event, message: unknown) => {
    if (!isTrustedSender(event, appUrl) || !isRecord(message) || !MESSAGE_TYPES.has(String(message['type']))) return
    output.publish(message as unknown as OutputMessage)
  })
  ipcMain.handle(IPC.outputStatus, (event): OutputStatus | null => (isTrustedSender(event, appUrl) ? status() : null))
  ipcMain.handle(IPC.outputOpenWindow, (event, options: unknown): boolean => {
    if (!isTrustedSender(event, appUrl) || !isRecord(options) || output.port === 0) return false
    const o = options as Partial<OutputWindowOptions>
    outputWindow.open(output.url, { width: Number(o.width) || 720, height: Number(o.height) || 720, alwaysOnTop: o.alwaysOnTop === true })
    return true
  })
  ipcMain.handle(IPC.outputCloseWindow, (event): void => {
    if (isTrustedSender(event, appUrl)) outputWindow.close()
  })
  ipcMain.handle(IPC.outputCopyUrl, (event): void => {
    if (isTrustedSender(event, appUrl) && output.port > 0) clipboard.writeText(output.url)
  })

  // Profile: Figura-Ordner werden im Hauptprozess ergänzt, der Renderer kennt nur Schlüssel.
  ipcMain.handle(IPC.profileList, async (event): Promise<ProfileSummary[]> => (isTrustedSender(event, appUrl) ? profiles.list() : []))
  ipcMain.handle(IPC.profileSave, async (event, name: unknown, data: unknown): Promise<boolean> => {
    if (!isTrustedSender(event, appUrl) || !isRecord(data)) return false
    const fig = isRecord(data['figura']) ? data['figura'] : null
    const folder = fig && typeof fig['key'] === 'string' ? figura.folderOf(fig['key']) : null
    const stored = fig ? { ...data, figura: { ...fig, folder: folder?.dir ?? null, location: folder?.location ?? fig['location'] ?? '' } } : data
    return profiles.save(name, stored)
  })
  ipcMain.handle(IPC.profileLoad, async (event, name: unknown): Promise<unknown> => {
    if (!isTrustedSender(event, appUrl)) return null
    const data = await profiles.load(name)
    if (isRecord(data) && isRecord(data['figura']) && typeof data['figura']['folder'] === 'string') {
      const fig = data['figura']
      const location = typeof fig['location'] === 'string' ? fig['location'] : ''
      const key = figura.register(String(fig['folder']), location)
      return { ...data, figura: { key, location } }
    }
    return data
  })
  ipcMain.handle(IPC.profileRemove, async (event, name: unknown): Promise<boolean> => (isTrustedSender(event, appUrl) ? profiles.remove(name) : false))

  ipcMain.handle(IPC.hotkeysSet, (event, bindings: unknown): HotkeyResult[] => {
    if (!isTrustedSender(event, appUrl)) return []
    const sender = event.sender
    return applyHotkeys(validBindings(bindings), (id) => {
      if (!sender.isDestroyed()) sender.send(IPC.hotkeyTriggered, id)
    })
  })

  ipcMain.handle(IPC.appInfo, (event): AppInfo | null => (isTrustedSender(event, appUrl) ? { version: app.getVersion(), dataFolder: app.getPath('userData') } : null))
  ipcMain.handle(IPC.appOpenDataFolder, async (event): Promise<void> => {
    if (isTrustedSender(event, appUrl)) await shell.openPath(app.getPath('userData'))
  })
}
