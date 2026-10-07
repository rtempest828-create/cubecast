import { createHash } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PROFILE_NAME_PATTERN, type ProfileSummary } from '../shared/ipc'

/** Obergrenze pro Profil (enthält ggf. den Skin als PNG). */
export const MAX_PROFILE_BYTES = 12 * 1024 * 1024

interface StoredProfile {
  readonly version: 1
  readonly name: string
  readonly updated: string
  readonly data: unknown
}

export function isValidProfileName(name: unknown): name is string {
  return typeof name === 'string' && name.trim() === name && PROFILE_NAME_PATTERN.test(name)
}

/** Dateiname aus dem Profilnamen: lesbarer Teil + Hash (Groß-/Kleinschreibung egal, keine Sonderzeichen). */
export function profileFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'profil'
  const hash = createHash('sha256').update(name.toLowerCase()).digest('hex').slice(0, 8)
  return `${slug}-${hash}.json`
}

/**
 * Profile (Avatar, Tracking-, Körper- und Ausgabe-Einstellungen) als JSON-Dateien.
 * Kaputte Dateien werden beim Auflisten übersprungen.
 */
export class ProfileStore {
  constructor(private readonly directory: string) {}

  async list(): Promise<ProfileSummary[]> {
    let files: string[]
    try {
      files = (await readdir(this.directory)).filter((f) => f.endsWith('.json'))
    } catch {
      return []
    }
    const out: ProfileSummary[] = []
    for (const file of files.slice(0, 500)) {
      const summary = (await this.readHeader(join(this.directory, file))) ?? (await this.read(join(this.directory, file)))
      if (summary) out.push({ name: summary.name, updated: summary.updated })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Name und Datum stehen am Anfang der Datei – ohne das ganze Profil (mit Skin) zu lesen. */
  private async readHeader(path: string): Promise<ProfileSummary | null> {
    let handle
    try {
      handle = await open(path, 'r')
      const buffer = Buffer.alloc(1024)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      const head = buffer.subarray(0, bytesRead).toString('utf8')
      const match = /^\{"version":1,"name":("(?:[^"\\]|\\.)*"),"updated":"([^"]*)"/.exec(head)
      if (!match) return null
      const name: unknown = JSON.parse(match[1]!)
      return isValidProfileName(name) ? { name, updated: match[2]! } : null
    } catch {
      return null
    } finally {
      await handle?.close()
    }
  }

  private async read(path: string): Promise<StoredProfile | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
      if (typeof parsed !== 'object' || parsed === null) return null
      const p = parsed as Record<string, unknown>
      if (p['version'] !== 1 || !isValidProfileName(p['name'])) return null
      return { version: 1, name: p['name'], updated: typeof p['updated'] === 'string' ? p['updated'] : '', data: p['data'] }
    } catch {
      return null
    }
  }

  async load(name: unknown): Promise<unknown> {
    if (!isValidProfileName(name)) return null
    const profile = await this.read(join(this.directory, profileFileName(name)))
    return profile?.data ?? null
  }

  async save(name: unknown, data: unknown, now = new Date()): Promise<boolean> {
    if (!isValidProfileName(name)) return false
    let json: string
    try {
      json = JSON.stringify({ version: 1, name, updated: now.toISOString(), data } satisfies StoredProfile)
    } catch {
      return false
    }
    if (json === undefined || Buffer.byteLength(json, 'utf8') > MAX_PROFILE_BYTES) return false
    try {
      await mkdir(this.directory, { recursive: true })
      const file = join(this.directory, profileFileName(name))
      await writeFile(`${file}.tmp`, json, 'utf8')
      await rename(`${file}.tmp`, file)
      return true
    } catch (error) {
      console.warn('[Profile] Speichern fehlgeschlagen:', error)
      return false
    }
  }

  async remove(name: unknown): Promise<boolean> {
    if (!isValidProfileName(name)) return false
    try {
      await rm(join(this.directory, profileFileName(name)))
      return true
    } catch {
      return false
    }
  }
}
