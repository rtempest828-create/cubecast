import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { figuraKey, FiguraReadError, FiguraRegistry, readFiguraFolder } from '../../src/main/figura-import'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'figura-test-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function avatar(dir: string, files: Record<string, string>): string {
  const base = join(root, dir)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(base, path, '..'), { recursive: true })
    writeFileSync(join(base, path), content)
  }
  return base
}

describe('readFiguraFolder', () => {
  it('liest nur erlaubte Dateitypen, mit „/“ als Trenner', async () => {
    const dir = avatar('a', { 'avatar.json': '{}', 'model.bbmodel': '{}', 'scripts/main.lua': '', 'tex/fell.png': 'x', 'virus.exe': 'x', 'sound.ogg': 'x', '.git/config': 'x' })
    const files = await readFiguraFolder(dir)
    expect(files.map((f) => f.path).sort()).toEqual(['avatar.json', 'model.bbmodel', 'scripts/main.lua', 'tex/fell.png'])
  })

  it('lehnt Ordner ohne Modell ab', async () => {
    const dir = avatar('b', { 'avatar.json': '{}' })
    await expect(readFiguraFolder(dir)).rejects.toSatisfy((e: unknown) => e instanceof FiguraReadError && e.code === 'no-avatar')
  })

  it('folgt keinen symbolischen Links aus dem Ordner heraus', async () => {
    const outside = avatar('geheim', { 'passwort.json': '{"geheim":1}' })
    const dir = avatar('c', { 'model.bbmodel': '{}' })
    try {
      symlinkSync(outside, join(dir, 'link'), 'junction')
    } catch {
      return // Symlinks/Junctions nicht erlaubt (z. B. ohne Rechte) – nichts zu prüfen
    }
    const files = await readFiguraFolder(dir)
    expect(files.map((f) => f.path)).toEqual(['model.bbmodel'])
  })
})

describe('FiguraRegistry', () => {
  it('findet Avatare (auch in Unterordnern) im offiziellen Minecraft-Ordner und lädt sie nur per Schlüssel', async () => {
    const avatars = join(root, '.minecraft', 'figura', 'avatars')
    mkdirSync(join(avatars, 'Fuchs'), { recursive: true })
    writeFileSync(join(avatars, 'Fuchs', 'avatar.json'), '{"name":"Sternenfuchs"}')
    writeFileSync(join(avatars, 'Fuchs', 'model.bbmodel'), '{}')
    mkdirSync(join(avatars, 'Kategorie', 'Katze'), { recursive: true })
    writeFileSync(join(avatars, 'Kategorie', 'Katze', 'model.bbmodel'), '{}')

    const registry = new FiguraRegistry()
    const entries = await registry.scan(root)
    expect(entries.map((e) => e.name).sort()).toEqual(['Katze', 'Sternenfuchs'])
    expect(entries.every((e) => e.location === 'Minecraft')).toBe(true)

    const fuchs = entries.find((e) => e.name === 'Sternenfuchs')!
    expect(fuchs.key).toBe(figuraKey(join(avatars, 'Fuchs')))
    const loaded = await registry.load(fuchs.key)
    expect(loaded.ok && loaded.files.length).toBe(2)
    expect(await registry.load('figura-unbekannt')).toEqual({ ok: false, error: 'not-found' })
  })

  it('Schlüssel sind gültige Avatar-Schlüssel', () => {
    expect(figuraKey('C:\\x\\y')).toMatch(/^figura-[0-9a-f]{16}$/)
    expect(figuraKey('C:\\X\\Y')).toBe(figuraKey('c:\\x\\y'))
  })
})
