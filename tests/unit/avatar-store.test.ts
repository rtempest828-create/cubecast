import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AvatarStore, isValidAvatarKey, MAX_CONFIG_BYTES } from '../../src/main/avatar-store'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vtuber-store-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('AvatarStore', () => {
  it('akzeptiert nur harmlose Schlüssel', () => {
    expect(isValidAvatarKey('skin-0123456789abcdef')).toBe(true)
    for (const bad of ['', '../x', 'a/b', 'C:\\x', 'Skin', 'x'.repeat(81), '-x', 42, null]) expect(isValidAvatarKey(bad)).toBe(false)
  })

  it('speichert und lädt JSON', async () => {
    const store = new AvatarStore(join(directory, 'avatars'))
    expect(await store.load('skin-a')).toBeNull()
    expect(await store.save('skin-a', { version: 1, list: [1, 2] })).toBe(true)
    expect(await store.load('skin-a')).toEqual({ version: 1, list: [1, 2] })
    // Keine Temporärdatei übrig
    expect(await readdir(join(directory, 'avatars'))).toEqual(['skin-a.json'])
  })

  it('verweigert ungültige Schlüssel und zu große Daten', async () => {
    const store = new AvatarStore(directory)
    expect(await store.save('../evil', {})).toBe(false)
    expect(await store.save('skin-big', { data: 'x'.repeat(MAX_CONFIG_BYTES) })).toBe(false)
    expect(await store.load('../evil')).toBeNull()
  })

  it('legt beschädigte Dateien beiseite statt abzustürzen', async () => {
    await writeFile(join(directory, 'skin-b.json'), '{ kaputt', 'utf8')
    const store = new AvatarStore(directory)
    expect(await store.load('skin-b')).toBeNull()
    const files = await readdir(directory)
    expect(files.some((f) => f.startsWith('skin-b-broken-'))).toBe(true)
    expect(await readFile(join(directory, files.find((f) => f.startsWith('skin-b-broken-'))!), 'utf8')).toBe('{ kaputt')
  })
})
