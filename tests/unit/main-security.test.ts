import { describe, expect, it } from 'vitest'
import { isAllowedUrl } from '../../src/main/network-guard'
import { extractSkinInfo, sanitizeSkinUrl } from '../../src/main/skin-download'

describe('Netzwerk-Sperre', () => {
  it('erlaubt nur lokale Ressourcen', () => {
    expect(isAllowedUrl('file:///C:/app/index.html', null)).toBe(true)
    expect(isAllowedUrl('data:image/png;base64,AAAA', null)).toBe(true)
    expect(isAllowedUrl('blob:file:///1234', null)).toBe(true)
    expect(isAllowedUrl('https://example.com/', null)).toBe(false)
    expect(isAllowedUrl('https://cdn.jsdelivr.net/npm/x', null)).toBe(false)
    expect(isAllowedUrl('kaputt', null)).toBe(false)
  })

  it('erlaubt im Entwicklungsmodus nur den Dev-Server', () => {
    expect(isAllowedUrl('http://localhost:5173/src/main.tsx', 'localhost:5173')).toBe(true)
    expect(isAllowedUrl('ws://localhost:5173/', 'localhost:5173')).toBe(true)
    expect(isAllowedUrl('http://localhost:8080/', 'localhost:5173')).toBe(false)
  })
})

function profile(textures: unknown): unknown {
  return {
    id: '0123456789abcdef0123456789abcdef',
    properties: [{ name: 'textures', value: Buffer.from(JSON.stringify(textures)).toString('base64') }]
  }
}

describe('Mojang-Profil auswerten', () => {
  it('liest Skin-URL und Slim-Modell', () => {
    const info = extractSkinInfo(profile({ textures: { SKIN: { url: 'http://textures.minecraft.net/texture/abc', metadata: { model: 'slim' } } } }))
    expect(info).toEqual({ url: 'http://textures.minecraft.net/texture/abc', model: 'slim' })
  })

  it('erkennt Classic ohne Metadaten und Spieler ohne eigenen Skin', () => {
    expect(extractSkinInfo(profile({ textures: { SKIN: { url: 'http://textures.minecraft.net/texture/abc' } } }))?.model).toBe('classic')
    expect(extractSkinInfo(profile({ textures: {} }))).toBeNull()
  })

  it('wirft bei kaputten Antworten', () => {
    expect(() => extractSkinInfo({})).toThrow()
    expect(() => extractSkinInfo({ properties: [{ name: 'textures', value: '###' }] })).toThrow()
  })

  it('erzwingt HTTPS und erlaubt nur den offiziellen Textur-Server', () => {
    expect(sanitizeSkinUrl('http://textures.minecraft.net/texture/abc')).toBe('https://textures.minecraft.net/texture/abc')
    expect(() => sanitizeSkinUrl('https://evil.example/texture/abc')).toThrow()
    expect(() => sanitizeSkinUrl('https://textures.minecraft.net.evil.example/x')).toThrow()
  })
})
