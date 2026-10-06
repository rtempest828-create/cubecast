import type { SkinModelType } from '../core/skin/skin'
import { MAX_SKIN_FILE_BYTES, PLAYER_NAME_PATTERN, type SkinDownloadResult } from '../shared/ipc'

/**
 * Skin-Download über die öffentliche Mojang-API:
 *   1. Spielername → UUID          (api.mojang.com)
 *   2. UUID → Profil mit Texturen  (sessionserver.mojang.com, Base64-JSON)
 *   3. Skin-PNG                    (textures.minecraft.net)
 * Nur diese drei Hosts werden je angesprochen.
 */

const TIMEOUT_MS = 10_000
const SKIN_HOST = 'textures.minecraft.net'

type Failure = Extract<SkinDownloadResult, { ok: false }>

class DownloadFailure extends Error {
  constructor(readonly result: Failure) {
    super(result.error)
  }
}

function fail(error: Failure['error']): never {
  throw new DownloadFailure({ ok: false, error })
}

async function get(url: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' })
  if (response.status === 429) fail('rate-limited')
  return response
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Liest das `textures`-Property aus dem Profil und liefert Skin-URL und Modelltyp. */
export function extractSkinInfo(profile: unknown): { url: string; model: SkinModelType } | null {
  if (!isRecord(profile) || !Array.isArray(profile['properties'])) fail('bad-response')
  const property = profile['properties'].find((p: unknown) => isRecord(p) && p['name'] === 'textures')
  if (!isRecord(property) || typeof property['value'] !== 'string') fail('bad-response')

  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(property['value'], 'base64').toString('utf8'))
  } catch {
    fail('bad-response')
  }
  const textures = isRecord(decoded) ? decoded['textures'] : undefined
  const skin = isRecord(textures) ? textures['SKIN'] : undefined
  if (!isRecord(skin)) return null
  if (typeof skin['url'] !== 'string') fail('bad-response')
  const metadata = skin['metadata']
  const model: SkinModelType = isRecord(metadata) && metadata['model'] === 'slim' ? 'slim' : 'classic'
  return { url: skin['url'], model }
}

/** Erzwingt HTTPS und erlaubt ausschließlich den offiziellen Textur-Host. */
export function sanitizeSkinUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    fail('bad-response')
  }
  if (url.hostname !== SKIN_HOST) fail('bad-response')
  url.protocol = 'https:'
  return url.toString()
}

export async function downloadSkinByName(rawName: string): Promise<SkinDownloadResult> {
  const name = rawName.trim()
  if (!PLAYER_NAME_PATTERN.test(name)) return { ok: false, error: 'invalid-name' }

  try {
    const lookup = await get(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`)
    if (lookup.status === 404 || lookup.status === 204) fail('not-found')
    if (!lookup.ok) fail('bad-response')
    const lookupJson: unknown = await lookup.json()
    if (!isRecord(lookupJson) || typeof lookupJson['id'] !== 'string' || !/^[0-9a-f]{32}$/i.test(lookupJson['id'])) {
      fail('bad-response')
    }
    const exactName = typeof lookupJson['name'] === 'string' ? lookupJson['name'] : name

    const profile = await get(`https://sessionserver.mojang.com/session/minecraft/profile/${lookupJson['id']}`)
    if (profile.status === 404 || profile.status === 204) fail('not-found')
    if (!profile.ok) fail('bad-response')
    const skin = extractSkinInfo(await profile.json())
    if (!skin) fail('no-skin')

    const png = await get(sanitizeSkinUrl(skin.url))
    if (!png.ok) fail('bad-response')
    const declared = Number(png.headers.get('content-length') ?? '0')
    if (declared > MAX_SKIN_FILE_BYTES) fail('too-large')
    const buffer = await png.arrayBuffer()
    if (buffer.byteLength > MAX_SKIN_FILE_BYTES) fail('too-large')

    return { ok: true, png: new Uint8Array(buffer), model: skin.model, name: exactName }
  } catch (error) {
    if (error instanceof DownloadFailure) return error.result
    // Timeout, DNS-Fehler, keine Verbindung, kaputtes JSON …
    console.warn('[Skin-Download] fehlgeschlagen:', error)
    return { ok: false, error: 'network' }
  }
}
