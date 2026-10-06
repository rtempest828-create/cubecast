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
  figuraOpenFolder: 'figura:open-folder'
} as const

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
}

/** Gültige Minecraft-Spielernamen (alte Konten können kürzer als 3 Zeichen sein). */
export const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{1,16}$/

/** Obergrenze für Skin-Dateien (auch HD-Skins sind weit darunter). */
export const MAX_SKIN_FILE_BYTES = 5 * 1024 * 1024
