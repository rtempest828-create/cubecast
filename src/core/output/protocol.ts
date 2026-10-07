import type { RgbaImage } from '../image/rgba-image'
import type { AvatarModel, PartNode, TextureDef } from '../model/avatar-model'
import type { PartPose, Pose } from '../pipeline/pose'

/**
 * Nachrichten von der App an die Ausgabe (OBS-Browserquelle, Ausgabefenster).
 * Übertragen als JSON per Server-Sent Events vom lokalen Ausgabe-Server.
 * Die Ausgabe zeigt nur, was die App schickt – Tracking und Lua laufen nur in der App.
 */

export type BackgroundMode = 'transparent' | 'green' | 'color'
export type CameraPreset = 'full' | 'half' | 'head' | 'custom'

export interface CameraState {
  readonly position: readonly [number, number, number]
  readonly target: readonly [number, number, number]
  readonly fov: number
}

export interface OutputSettings {
  readonly background: BackgroundMode
  /** Hintergrundfarbe bei `color` (#rrggbb). */
  readonly color: string
  readonly camera: CameraPreset
  /** Eigene Kamera (aus der App übernommen) für `custom`. */
  readonly customCamera: CameraState | null
  /** Zusätzlicher Zoom (1 = Preset). */
  readonly zoom: number
  /** Blickrichtung der Kamera um die Figur (Grad, 0 = von vorn). */
  readonly angle: number
  readonly outerLayer: boolean
}

export const DEFAULT_OUTPUT_SETTINGS: OutputSettings = {
  background: 'transparent',
  color: '#00ff00',
  camera: 'half',
  customCamera: null,
  zoom: 1,
  angle: 0,
  outerLayer: true
}

export interface SerializedTexture {
  readonly id: string
  readonly name: string
  readonly width: number
  readonly height: number
  readonly uvWidth: number
  readonly uvHeight: number
  /** RGBA-Pixel, Base64. */
  readonly data: string
  readonly emissive?: string
}

export interface SerializedModel {
  readonly root: PartNode
  readonly textures: readonly SerializedTexture[]
}

/** Pose als kompakte Liste: [id, rx, ry, rz, px, py, pz, sx, sy, sz, sichtbar(0/1), eingeblendet(0/1), u, v, Bild]. */
export type PoseEntry = readonly [string, ...number[]]

export type OutputMessage =
  | { readonly type: 'model'; readonly model: SerializedModel }
  | { readonly type: 'pose'; readonly parts: readonly PoseEntry[] }
  | { readonly type: 'texture'; readonly id: string; readonly width: number; readonly height: number; readonly data: string }
  | { readonly type: 'settings'; readonly settings: OutputSettings }

// ---------------------------------------------------------------------------
// Base64 ohne Node-Buffer (läuft in App, Ausgabe und Tests)

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function bytesToBase64(bytes: Uint8Array | Uint8ClampedArray): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63]! : '='
  }
  return out
}

const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]))

export function base64ToBytes(text: string): Uint8ClampedArray {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8ClampedArray(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n = ((LOOKUP.get(clean[i]!) ?? 0) << 18) | ((LOOKUP.get(clean[i + 1] ?? 'A') ?? 0) << 12) | ((LOOKUP.get(clean[i + 2] ?? 'A') ?? 0) << 6) | (LOOKUP.get(clean[i + 3] ?? 'A') ?? 0)
    if (o < out.length) out[o++] = (n >> 16) & 255
    if (o < out.length) out[o++] = (n >> 8) & 255
    if (o < out.length) out[o++] = n & 255
  }
  return out
}

// ---------------------------------------------------------------------------

export function serializeImage(image: RgbaImage): { width: number; height: number; data: string } {
  return { width: image.width, height: image.height, data: bytesToBase64(image.data) }
}

export function deserializeImage(width: number, height: number, data: string): RgbaImage {
  const bytes = base64ToBytes(data)
  if (bytes.length !== width * height * 4) throw new Error('Bildgröße passt nicht zu den Daten')
  return { width, height, data: bytes }
}

export function serializeModel(model: AvatarModel): SerializedModel {
  const textures: SerializedTexture[] = []
  for (const texture of model.textures.values()) {
    textures.push({
      id: texture.id,
      name: texture.name,
      width: texture.image.width,
      height: texture.image.height,
      uvWidth: texture.uvWidth,
      uvHeight: texture.uvHeight,
      data: bytesToBase64(texture.image.data),
      ...(texture.emissive ? { emissive: bytesToBase64(texture.emissive.data) } : {})
    })
  }
  return { root: model.root, textures }
}

export function deserializeModel(model: SerializedModel): AvatarModel {
  const textures = new Map<string, TextureDef>()
  for (const t of model.textures) {
    textures.set(t.id, {
      id: t.id,
      name: t.name,
      image: deserializeImage(t.width, t.height, t.data),
      uvWidth: t.uvWidth,
      uvHeight: t.uvHeight,
      ...(t.emissive ? { emissive: deserializeImage(t.width, t.height, t.emissive) } : {})
    })
  }
  return { root: model.root, textures }
}

const round = (v: number): number => Math.round(v * 1000) / 1000

export function serializePose(pose: Pose): PoseEntry[] {
  const out: PoseEntry[] = []
  for (const [id, p] of pose) {
    out.push([
      id,
      round(p.rotation[0]),
      round(p.rotation[1]),
      round(p.rotation[2]),
      round(p.position[0]),
      round(p.position[1]),
      round(p.position[2]),
      round(p.scale[0]),
      round(p.scale[1]),
      round(p.scale[2]),
      p.visible ? 1 : 0,
      p.shown ? 1 : 0,
      round(p.uvOffset[0]),
      round(p.uvOffset[1]),
      p.frame
    ])
  }
  return out
}

export function deserializePose(entries: readonly PoseEntry[]): Pose {
  const pose = new Map<string, PartPose>()
  for (const [id, ...v] of entries) {
    if (typeof id !== 'string' || v.length < 14) continue
    const n = (i: number): number => (Number.isFinite(v[i]) ? v[i]! : 0)
    pose.set(id, {
      rotation: [n(0), n(1), n(2)],
      position: [n(3), n(4), n(5)],
      scale: [n(6), n(7), n(8)],
      visible: n(9) !== 0,
      shown: n(10) !== 0,
      uvOffset: [n(11), n(12)],
      frame: n(13)
    })
  }
  return pose
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const vec3 = (v: unknown): [number, number, number] | null =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1], v[2]] : null
const clamp = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

/** Liest gespeicherte Ausgabe-Einstellungen robust. */
export function parseOutputSettings(value: unknown): OutputSettings {
  if (!isRecord(value)) return DEFAULT_OUTPUT_SETTINGS
  const camera = isRecord(value['customCamera']) ? value['customCamera'] : null
  const position = camera ? vec3(camera['position']) : null
  const target = camera ? vec3(camera['target']) : null
  return {
    background: (['transparent', 'green', 'color'] as const).includes(value['background'] as BackgroundMode) ? (value['background'] as BackgroundMode) : 'transparent',
    color: typeof value['color'] === 'string' && /^#[0-9a-f]{6}$/i.test(value['color']) ? value['color'] : DEFAULT_OUTPUT_SETTINGS.color,
    camera: (['full', 'half', 'head', 'custom'] as const).includes(value['camera'] as CameraPreset) ? (value['camera'] as CameraPreset) : 'half',
    customCamera: position && target ? { position, target, fov: clamp(camera?.['fov'], 10, 90, 35) } : null,
    zoom: clamp(value['zoom'], 0.3, 4, 1),
    angle: clamp(value['angle'], -180, 180, 0),
    outerLayer: value['outerLayer'] !== false
  }
}

/** Grober Rahmen der Figur je Preset (Modellraum, Pixel): Höhe des Bildausschnitts und dessen Mitte. */
export function presetFrame(preset: Exclude<CameraPreset, 'custom'>, bounds: { minY: number; maxY: number }): { centerY: number; height: number } {
  const top = bounds.maxY
  const bottom = bounds.minY
  switch (preset) {
    case 'full':
      return { centerY: (top + bottom) / 2, height: (top - bottom) * 1.1 }
    case 'half': {
      const from = bottom + (top - bottom) * 0.38
      return { centerY: (top + from) / 2, height: (top - from) * 1.15 }
    }
    case 'head': {
      const from = top - Math.min(12, (top - bottom) * 0.35)
      return { centerY: (top + from) / 2, height: (top - from) * 1.35 }
    }
  }
}
