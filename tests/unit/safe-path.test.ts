import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mimeTypeFor, resolveInside } from '../../src/main/safe-path'

const root = resolve('C:/app/out/renderer')

describe('resolveInside (app://-Protokoll)', () => {
  it('löst normale Pfade innerhalb des Ordners auf', () => {
    expect(resolveInside(root, '/index.html')).toBe(join(root, 'index.html'))
    expect(resolveInside(root, '/assets/vision%20wasm.wasm')).toBe(join(root, 'assets', 'vision wasm.wasm'))
  })

  it('verhindert das Verlassen des Ordners', () => {
    expect(resolveInside(root, '/../main/index.js')).toBeNull()
    expect(resolveInside(root, '/assets/../../secret.txt')).toBeNull()
    expect(resolveInside(root, '/%2e%2e/%2e%2e/secret.txt')).toBeNull()
    expect(resolveInside(root, '/..%5C..%5Csecret.txt')).toBeNull()
    expect(resolveInside(root, '/')).toBeNull()
    expect(resolveInside(root, '/a%00b')).toBeNull()
    expect(resolveInside(root, '/%E0%A4%A')).toBeNull()
  })

  it('liefert passende MIME-Typen (WASM muss application/wasm sein)', () => {
    expect(mimeTypeFor('x/vision.wasm')).toBe('application/wasm')
    expect(mimeTypeFor('x/index.JS')).toContain('javascript')
    expect(mimeTypeFor('x/model.task')).toBe('application/octet-stream')
  })
})
