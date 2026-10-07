import type { OutputMessage } from '../core/output/protocol'
import type { SkinModelType } from '../core/skin/skin'

/**
 * Verträge zwischen Main-Prozess und Renderer. Der Renderer hat keinen
 * Node-Zugriff; alles läuft über diese typisierte, minimale Schnittstelle.
 */

export const IPC = {
  skinDownloadByName: 'skin:download-by-name',
  skinOpenFile: 'skin:open-file',
  avatarConfigLoad: 'avatar-config:load',
  avatarConfigSave: 'avatar-config:save',
  figuraList: 'figura:list',
  figuraLoad: 'figura:load',
  figuraOpenFolder: 'figura:open-folder',
  outputPublish: 'output:publish',
  outputStatus: 'output:status',
  outputStatusChanged: 'output:status-changed',
  outputOpenWindow: 'output:open-window',
  outputCloseWindow: 'output:close-window',
  outputCopyUrl: 'output:copy-url',
  profileList: 'profile:list',
  profileSave: 'profile:save',
  profileLoad: 'profile:load',
  profileRemove: 'profile:remove',
  hotkeysSet: 'hotkeys:set',
  hotkeyTriggered: 'hotkeys:triggered',
  appOpenDataFolder: 'app:open-data-folder',
  appInfo: 'app:info'
} as const

export interface OutputStatus {
  readonly running: boolean
  readonly url: string
  readonly clients: number
  readonly windowOpen: boolean
}

export interface OutputWindowOptions {
  readonly width: number
  readonly height: number
  readonly alwaysOnTop: boolean
}

export interface ProfileSummary {
  readonly name: string
  /** ISO-Zeitpunkt der letzten Speicherung. */
  readonly updated: string
}

export interface HotkeyBinding {
  readonly id: string
  /** Electron-Tastenkürzel, z. B. „CommandOrControl+Alt+1“. */
  readonly accelerator: string
}

export interface HotkeyResult {
  readonly id: string
  readonly ok: boolean
}

export interface AppInfo {
  readonly version: string
  readonly dataFolder: string
}

/** Gültige Tastenkürzel: Modifikatoren + eine Taste (F-Tasten auch allein). */
export const ACCELERATOR_PATTERN =
  /^(?:(?:CommandOrControl|Control|Alt|Shift|Super)\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4])|Space|Tab|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete|num\d|Plus|-|=|,|\.)$|^F(?:1[3-9]|2[0-4])$/

/** Gültige Profilnamen. */
// eslint-disable-next-line no-control-regex -- Steuerzeichen sind in Dateinamen verboten
export const PROFILE_NAME_PATTERN = /^[^\\/:*?"<>|\u0000-\u001f]{1,60}$/

export type SkinDownloadError =
  | 'invalid-name'
  | 'not-found'
  | 'no-skin'
  | 'rate-limited'
  | 'network'
  | 'bad-response'
  | 'too-large'

export type SkinDownloadResult =
  | { readonly ok: true; readonly png: Uint8Array; readonly model: SkinModelType; readonly name: string }
  | { readonly ok: false; readonly error: SkinDownloadError }

export type OpenFileError = 'cancelled' | 'too-large' | 'read-failed'

export type OpenFileResult =
  | { readonly ok: true; readonly data: Uint8Array; readonly fileName: string }
  | { readonly ok: false; readonly error: OpenFileError }

/** Ein gefundener Figura-Avatar-Ordner. `key` ist zugleich der Schlüssel der gespeicherten Zuordnung. */
export interface FiguraAvatarEntry {
  readonly key: string
  readonly name: string
  /** Wo er gefunden wurde, z. B. „Modrinth – Fabric 1.21.11“. */
  readonly location: string
  readonly folder: string
}

export type FiguraLoadError = 'cancelled' | 'not-found' | 'too-large' | 'read-failed' | 'no-avatar'

export type FiguraFolderResult =
  | {
      readonly ok: true
      readonly key: string
      readonly folderName: string
      readonly location: string
      /** Dateien relativ zum Ordner (mit „/“); nur .json, .bbmodel, .lua, .png. */
      readonly files: readonly { readonly path: string; readonly data: Uint8Array }[]
    }
  | { readonly ok: false; readonly error: FiguraLoadError }

/** Im Renderer als `window.vtuber` verfügbar. */
export interface VtuberApi {
  readonly skin: {
    /** Lädt den Skin eines Spielers über die Mojang-API (einziger erlaubter Netzwerkzugriff). */
    downloadByName(name: string): Promise<SkinDownloadResult>
    /** Öffnet einen Dateidialog für PNG-Dateien. */
    openFile(): Promise<OpenFileResult>
  }
  /** Einstellungen pro Avatar (Rollen-Zuordnung usw.), gespeichert als JSON im Benutzerordner. */
  readonly avatarConfig: {
    load(key: string): Promise<unknown>
    save(key: string, data: unknown): Promise<boolean>
  }
  /** Figura-Avatare: werden nur gelesen, nie verändert. */
  readonly figura: {
    /** Sucht Avatare in den Figura-Ordnern bekannter Launcher. */
    list(): Promise<readonly FiguraAvatarEntry[]>
    load(key: string): Promise<FiguraFolderResult>
    /** Ordnerdialog für einen Avatar an beliebiger Stelle. */
    openFolder(): Promise<FiguraFolderResult>
  }
  /** OBS-Ausgabe und Ausgabefenster. */
  readonly output: {
    publish(message: OutputMessage): void
    status(): Promise<OutputStatus>
    onStatus(listener: (status: OutputStatus) => void): () => void
    openWindow(options: OutputWindowOptions): Promise<boolean>
    closeWindow(): Promise<void>
    copyUrl(): Promise<void>
  }
  /** Profile (Avatar + Einstellungen) als JSON-Dateien im Benutzerordner. */
  readonly profiles: {
    list(): Promise<readonly ProfileSummary[]>
    save(name: string, data: unknown): Promise<boolean>
    load(name: string): Promise<unknown>
    remove(name: string): Promise<boolean>
  }
  /** Globale Tastenkürzel (wirken auch, wenn ein anderes Programm aktiv ist). */
  readonly hotkeys: {
    set(bindings: readonly HotkeyBinding[]): Promise<readonly HotkeyResult[]>
    onTriggered(listener: (id: string) => void): () => void
  }
  readonly app: {
    info(): Promise<AppInfo>
    openDataFolder(): Promise<void>
  }
}

/** Gültige Minecraft-Spielernamen (alte Konten können kürzer als 3 Zeichen sein). */
export const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{1,16}$/

/** Obergrenze für Skin-Dateien (auch HD-Skins sind weit darunter). */
export const MAX_SKIN_FILE_BYTES = 5 * 1024 * 1024
