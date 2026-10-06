import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Schlüssel eines Avatars, z. B. „skin-3f2a…“. Nur Kleinbuchstaben, Ziffern, Bindestrich. */
export const AVATAR_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/

export const MAX_CONFIG_BYTES = 1024 * 1024

export function isValidAvatarKey(key: unknown): key is string {
  return typeof key === 'string' && AVATAR_KEY_PATTERN.test(key)
}

/**
 * Speichert Einstellungen pro Avatar (Rollen-Zuordnung, Gesichts-Layout) als JSON-Dateien.
 * Die Avatar-Dateien selbst (Skin, Figura-Ordner) werden nie verändert.
 */
export class AvatarStore {
  constructor(private readonly directory: string) {}

  private fileFor(key: string): string {
    return join(this.directory, `${key}.json`)
  }

  /** Liefert die gespeicherten Daten oder null (nicht vorhanden oder unlesbar). */
  async load(key: unknown): Promise<unknown> {
    if (!isValidAvatarKey(key)) return null
    let text: string
    try {
      text = await readFile(this.fileFor(key), 'utf8')
    } catch {
      return null
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      // Kaputte Datei beiseitelegen statt sie beim nächsten Speichern stillschweigend zu verlieren.
      console.warn(`[Avatar-Einstellungen] ${key}.json ist beschädigt und wurde umbenannt.`)
      await rename(this.fileFor(key), this.fileFor(`${key}-broken-${Date.now()}`)).catch(() => undefined)
      return null
    }
  }

  async save(key: unknown, data: unknown): Promise<boolean> {
    if (!isValidAvatarKey(key)) return false
    let json: string
    try {
      json = JSON.stringify(data, null, 2)
    } catch {
      return false
    }
    if (json === undefined || Buffer.byteLength(json, 'utf8') > MAX_CONFIG_BYTES) return false
    try {
      await mkdir(this.directory, { recursive: true })
      // Erst in eine Temporärdatei schreiben, dann umbenennen: kein halb geschriebenes JSON bei Absturz.
      const temp = `${this.fileFor(key)}.tmp`
      await writeFile(temp, json, 'utf8')
      await rename(temp, this.fileFor(key))
      return true
    } catch (error) {
      console.warn('[Avatar-Einstellungen] Speichern fehlgeschlagen:', error)
      return false
    }
  }
}
