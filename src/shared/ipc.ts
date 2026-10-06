import type { SkinModelType } from '../core/skin/skin'

/**
 * Verträge zwischen Main-Prozess und Renderer. Der Renderer hat keinen
 * Node-Zugriff; alles läuft über diese typisierte, minimale Schnittstelle.
 */

export const IPC = {
  skinDownloadByName: 'skin:download-by-name',
  skinOpenFile: 'skin:open-file'
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

/** Im Renderer als `window.vtuber` verfügbar. */
export interface VtuberApi {
  readonly skin: {
    /** Lädt den Skin eines Spielers über die Mojang-API (einziger erlaubter Netzwerkzugriff). */
    downloadByName(name: string): Promise<SkinDownloadResult>
    /** Öffnet einen Dateidialog für PNG-Dateien. */
    openFile(): Promise<OpenFileResult>
  }
}

/** Gültige Minecraft-Spielernamen (alte Konten können kürzer als 3 Zeichen sein). */
export const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{1,16}$/

/** Obergrenze für Skin-Dateien (auch HD-Skins sind weit darunter). */
export const MAX_SKIN_FILE_BYTES = 5 * 1024 * 1024
