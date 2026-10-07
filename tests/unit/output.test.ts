import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyCustomVariants, paintCell, parseCustomVariants, variantEdits } from '@core/face/face-custom'
import { analyzeFace } from '@core/face/face-layout'
import { extractFaceSource } from '@core/face/face-source'
import { generateFaceVariants } from '@core/face/face-variants'
import { buildVanillaAvatar } from '@core/model/vanilla-avatar'
import {
  base64ToBytes,
  bytesToBase64,
  DEFAULT_OUTPUT_SETTINGS,
  deserializeModel,
  deserializePose,
  parseOutputSettings,
  presetFrame,
  serializeModel,
  serializePose
} from '@core/output/protocol'
import { PoseBuilder } from '@core/pipeline/pose'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { normalizeSkin } from '@core/skin/skin'
import { isAllowedUrl } from '../../src/main/network-guard'
import { OutputServer } from '../../src/main/output-server'
import { isValidProfileName, profileFileName, ProfileStore } from '../../src/main/profile-store'

const skin = normalizeSkin(createPlaceholderSkin())

describe('Ausgabe-Protokoll', () => {
  it('Base64 hin und zurück', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 257]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37) & 255)
      const encoded = bytesToBase64(bytes)
      expect(encoded).toBe(Buffer.from(bytes).toString('base64'))
      expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(bytes))
    }
  })

  it('Modell und Pose überstehen die Übertragung', () => {
    const model = buildVanillaAvatar(skin, 'classic')
    const copy = deserializeModel(JSON.parse(JSON.stringify(serializeModel(model))))
    expect(copy.root).toEqual(model.root)
    expect([...copy.textures.keys()]).toEqual([...model.textures.keys()])
    const original = [...model.textures.values()][0]!
    expect(Array.from(copy.textures.get(original.id)!.image.data)).toEqual(Array.from(original.image.data))

    const pose = new PoseBuilder()
    const head = pose.part('vanilla.head')
    head.rotation[1] = 12.34567
    head.visible = false
    head.frame = 2
    const back = deserializePose(JSON.parse(JSON.stringify(serializePose(pose.build()))))
    expect(back.get('vanilla.head')).toMatchObject({ rotation: [0, 12.346, 0], visible: false, shown: false, frame: 2 })
  })

  it('Einstellungen werden robust gelesen', () => {
    expect(parseOutputSettings(null)).toEqual(DEFAULT_OUTPUT_SETTINGS)
    expect(parseOutputSettings({ background: 'lila', camera: 'head', zoom: 99, color: 'rot' })).toMatchObject({ background: 'transparent', camera: 'head', zoom: 4, color: '#00ff00' })
    expect(parseOutputSettings({ customCamera: { position: [1, 2, 3], target: [0, 1, 0], fov: 50 } }).customCamera).toEqual({ position: [1, 2, 3], target: [0, 1, 0], fov: 50 })
  })

  it('Kamera-Presets rahmen die Figur passend', () => {
    const bounds = { minY: 0, maxY: 32 }
    const full = presetFrame('full', bounds)
    const half = presetFrame('half', bounds)
    const head = presetFrame('head', bounds)
    expect(full.height).toBeGreaterThan(half.height)
    expect(half.height).toBeGreaterThan(head.height)
    expect(head.centerY).toBeGreaterThan(half.centerY)
  })
})

describe('Netzwerk-Sperre mit Ausgabe-Server', () => {
  it('erlaubt nur den eigenen Port auf 127.0.0.1', () => {
    expect(isAllowedUrl('http://127.0.0.1:47800/events', null, 47800)).toBe(true)
    expect(isAllowedUrl('http://127.0.0.1:47801/', null, 47800)).toBe(false)
    expect(isAllowedUrl('http://localhost:47800/', null, 47800)).toBe(false)
    expect(isAllowedUrl('http://127.0.0.1:47800/', null, 0)).toBe(false)
  })
})

// ---------------------------------------------------------------------------

function get(port: number, path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString()
        // Ereignisstrom: nach den ersten Daten abbrechen
        if (path === '/events' && body.includes('"type":"model"')) req.destroy()
      })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
      res.on('close', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', (error) => (error.message.includes('socket hang up') ? undefined : reject(error)))
    req.end()
  })
}

describe('OutputServer', () => {
  let server: OutputServer | null = null
  afterEach(() => server?.stop())

  it('lauscht nur lokal, prüft Host und Herkunft und sendet den letzten Stand', async () => {
    server = new OutputServer({ rendererDir: null, devServerUrl: null, allowedOrigins: ['app://bundle'] })
    const port = await server.start(47950)
    server.publish({ type: 'settings', settings: DEFAULT_OUTPUT_SETTINGS })
    server.publish({ type: 'model', model: { root: { id: 'root', name: 'root', origin: 'root', pivot: [0, 0, 0], rotation: [0, 0, 0], visible: true, cubes: [], children: [] }, textures: [] } })

    const events = await get(port, '/events')
    expect(events.status).toBe(200)
    expect(events.headers['content-type']).toContain('text/event-stream')
    expect(events.body.indexOf('"type":"settings"')).toBeLessThan(events.body.indexOf('"type":"model"'))

    expect((await get(port, '/events', { host: 'evil.example:80' })).status).toBe(403)
    expect((await get(port, '/events', { origin: 'https://evil.example' })).status).toBe(403)
    const allowed = await get(port, '/events', { origin: 'app://bundle' })
    expect(allowed.headers['access-control-allow-origin']).toBe('app://bundle')
    // Ohne gebaute Oberfläche gibt es keine Dateien, und nur die Ausgabeseite wäre erlaubt.
    expect((await get(port, '/index.html')).status).toBe(404)
    expect((await get(port, '/../package.json')).status).toBe(404)
  })

  it('weicht auf den nächsten freien Port aus', async () => {
    server = new OutputServer({ rendererDir: null, devServerUrl: null, allowedOrigins: [] })
    const first = await server.start(47960)
    const second = new OutputServer({ rendererDir: null, devServerUrl: null, allowedOrigins: [] })
    try {
      expect(await second.start(47960)).toBe(first + 1)
    } finally {
      second.stop()
    }
  })
})

describe('Profile', () => {
  let dir = ''
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('prüft Namen und speichert/lädt/löscht', async () => {
    expect(isValidProfileName('Stream 1')).toBe(true)
    expect(isValidProfileName('../böse')).toBe(false)
    expect(isValidProfileName('')).toBe(false)
    expect(isValidProfileName(' leer')).toBe(false)
    expect(profileFileName('Stream')).toBe(profileFileName('stream'))
    expect(profileFileName('Ä!?')).toMatch(/^[a-z0-9-]+\.json$/)

    dir = mkdtempSync(join(tmpdir(), 'profile-test-'))
    const store = new ProfileStore(dir)
    expect(await store.save('Stream', { a: 1 }, new Date('2026-10-07T12:00:00Z'))).toBe(true)
    expect(await store.save('../x', { a: 1 })).toBe(false)
    expect(await store.list()).toEqual([{ name: 'Stream', updated: '2026-10-07T12:00:00.000Z' }])
    expect(await store.load('Stream')).toEqual({ a: 1 })
    expect(await store.load('Gibtsnicht')).toBeNull()
    expect(await store.remove('Stream')).toBe(true)
    expect(await store.list()).toEqual([])
  })
})

describe('Face-Editor', () => {
  const source = extractFaceSource(skin)
  const analysis = analyzeFace(source.grid)
  const generated = generateFaceVariants(source.grid, analysis)

  it('eigene Varianten ersetzen die automatischen', () => {
    const edits = paintCell(paintCell(variantEdits(generated, 'mouth.open'), 3, 7, 0xff0000ff), 4, 7, 0x00ff00ff)
    const custom = parseCustomVariants({ 'mouth.open': edits.map(([x, y, c]) => [x, y, `#${c.toString(16).padStart(8, '0')}`]), quatsch: [[1, 1, '#ffffffff']] })
    expect(Object.keys(custom)).toEqual(['mouth.open'])
    const applied = applyCustomVariants(generated, custom)
    expect(applied.mouth.open).toContainEqual([3, 7, 0xff0000ff])
    expect(applied.mouth.smile).toBe(generated.mouth.smile)
    // Zelle zurück auf Original
    expect(paintCell(applied.mouth.open, 3, 7, null).some(([x, y]) => x === 3 && y === 7)).toBe(false)
  })

  it('verwirft ungültige Zellen', () => {
    expect(parseCustomVariants({ 'eye.left.2': [[9, 0, '#ffffffff'], [1, 1, 'rot'], [2, 2, '#FFFFFFFF']] })).toEqual({ 'eye.left.2': [[2, 2, '#ffffffff']] })
    expect(parseCustomVariants('kaputt')).toEqual({})
  })
})
