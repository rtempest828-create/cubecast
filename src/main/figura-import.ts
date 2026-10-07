import { createHash } from 'node:crypto'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, relative, resolve, sep } from 'node:path'
import type { FiguraAvatarEntry, FiguraFolderResult } from '../shared/ipc'

/** Grenzen beim Einlesen eines Avatar-Ordners (Figura selbst erlaubt online nur 100 KB). */
export const FIGURA_LIMITS = {
  maxFiles: 2000,
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxDepth: 8
} as const

/** Nur diese Dateitypen werden gelesen; alles andere (z. B. .exe, .ogg) wird übersprungen. */
const ALLOWED_EXTENSIONS = new Set(['.json', '.bbmodel', '.lua', '.png'])

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

export class FiguraReadError extends Error {
  constructor(readonly code: 'too-large' | 'read-failed' | 'no-avatar') {
    super(code)
  }
}

/** Stabiler Schlüssel pro Ordner (für die gespeicherte Rollen-Zuordnung). */
export function figuraKey(folder: string): string {
  const hash = createHash('sha256').update(resolve(folder).toLowerCase()).digest('hex').slice(0, 16)
  return `figura-${hash}`
}

/**
 * Liest alle erlaubten Dateien eines Avatar-Ordners. Symbolische Links werden nicht
 * verfolgt, damit ein Avatar nicht auf Dateien außerhalb seines Ordners zeigen kann.
 */
export async function readFiguraFolder(folder: string): Promise<{ path: string; data: Uint8Array }[]> {
  const root = resolve(folder)
  const files: { path: string; data: Uint8Array }[] = []
  let total = 0

  const visit = async (dir: string, depth: number): Promise<void> => {
    if (depth > FIGURA_LIMITS.maxDepth) return
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        await visit(full, depth + 1)
        continue
      }
      if (!entry.isFile() || !ALLOWED_EXTENSIONS.has(extensionOf(entry.name))) continue
      if (files.length >= FIGURA_LIMITS.maxFiles) throw new FiguraReadError('too-large')
      const info = await lstat(full)
      if (info.size > FIGURA_LIMITS.maxFileBytes) throw new FiguraReadError('too-large')
      total += info.size
      if (total > FIGURA_LIMITS.maxTotalBytes) throw new FiguraReadError('too-large')
      const rel = relative(root, full)
      if (rel.startsWith('..') || rel.includes(':')) continue
      files.push({ path: rel.split(sep).join('/'), data: new Uint8Array(await readFile(full)) })
    }
  }

  await visit(root, 0)
  if (!files.some((f) => /\.bbmodel$/i.test(f.path))) throw new FiguraReadError('no-avatar')
  return files
}

export interface AvatarRoot {
  readonly dir: string
  readonly location: string
}

async function subdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => join(dir, e.name))
  } catch {
    return []
  }
}

/** Figura-Ordner der bekannten Launcher (offizieller Launcher, Modrinth, CurseForge, Prism, MultiMC). */
export async function figuraRoots(appData: string, home: string = homedir()): Promise<AvatarRoot[]> {
  const roots: AvatarRoot[] = [{ dir: join(appData, '.minecraft', 'figura', 'avatars'), location: 'Minecraft' }]
  const instances = async (base: string, label: string, sub: readonly string[][]): Promise<void> => {
    for (const instance of await subdirectories(base)) {
      for (const parts of sub) roots.push({ dir: join(instance, ...parts, 'figura', 'avatars'), location: `${label} – ${basename(instance)}` })
    }
  }
  await instances(join(appData, 'ModrinthApp', 'profiles'), 'Modrinth', [[]])
  await instances(join(home, 'curseforge', 'minecraft', 'Instances'), 'CurseForge', [[]])
  await instances(join(appData, 'PrismLauncher', 'instances'), 'Prism', [['.minecraft'], ['minecraft']])
  await instances(join(appData, 'MultiMC', 'instances'), 'MultiMC', [['.minecraft'], ['minecraft']])
  return roots
}

const decoder = new TextDecoder('utf-8')

async function avatarName(dir: string): Promise<string> {
  try {
    const meta: unknown = JSON.parse(decoder.decode(await readFile(join(dir, 'avatar.json'))))
    if (typeof meta === 'object' && meta !== null && typeof (meta as Record<string, unknown>)['name'] === 'string') {
      const name = ((meta as Record<string, unknown>)['name'] as string).trim()
      if (name) return name.slice(0, 80)
    }
  } catch {
    // Kein oder kaputtes avatar.json: Ordnername verwenden.
  }
  return basename(dir)
}

/** Ein Ordner ist ein Avatar, wenn er ein avatar.json oder ein .bbmodel enthält; sonst ist er eine Kategorie. */
async function collectAvatars(dir: string, location: string, depth: number, out: { dir: string; location: string }[]): Promise<void> {
  if (depth > 3 || out.length >= 500) return
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  const isAvatar = entries.some((e) => e.isFile() && (e.name.toLowerCase() === 'avatar.json' || /\.bbmodel$/i.test(e.name)))
  if (isAvatar && depth > 0) {
    out.push({ dir, location })
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.')) await collectAvatars(join(dir, entry.name), location, depth + 1, out)
  }
}

/**
 * Merkt sich gefundene bzw. per Dialog gewählte Ordner. Der Renderer bekommt nur
 * Schlüssel zu sehen und kann so keine beliebigen Pfade lesen lassen.
 */
export class FiguraRegistry {
  private readonly folders = new Map<string, { dir: string; location: string }>()

  /** Ordner zu einem Schlüssel (für Profile). */
  folderOf(key: string): { dir: string; location: string } | null {
    return this.folders.get(key) ?? null
  }

  register(dir: string, location: string): string {
    const key = figuraKey(dir)
    this.folders.set(key, { dir: resolve(dir), location })
    return key
  }

  /** `extraRoots`: weitere Ordner mit Avataren, z. B. die mitgelieferten Beispiele. */
  async scan(appData: string, extraRoots: readonly AvatarRoot[] = []): Promise<FiguraAvatarEntry[]> {
    const found: { dir: string; location: string }[] = []
    for (const root of [...(await figuraRoots(appData)), ...extraRoots]) await collectAvatars(root.dir, root.location, 0, found)
    const entries: FiguraAvatarEntry[] = []
    for (const avatar of found) {
      const key = this.register(avatar.dir, avatar.location)
      entries.push({ key, name: await avatarName(avatar.dir), location: avatar.location, folder: basename(avatar.dir) })
    }
    return entries.sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name))
  }

  async load(key: string): Promise<FiguraFolderResult> {
    const folder = this.folders.get(key)
    if (!folder) return { ok: false, error: 'not-found' }
    try {
      const files = await readFiguraFolder(folder.dir)
      return { ok: true, key, folderName: basename(folder.dir), location: folder.location, files }
    } catch (error) {
      if (error instanceof FiguraReadError) return { ok: false, error: error.code }
      console.warn('[Figura] Ordner konnte nicht gelesen werden:', error)
      return { ok: false, error: 'read-failed' }
    }
  }
}
