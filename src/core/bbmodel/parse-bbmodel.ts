import { decodePng } from '../image/png-decode'
import { createImage, fillRect, type RgbaImage } from '../image/rgba-image'
import { quatFromEulerZYX, quatRotate } from '../math/quat'
import type { Vec3 } from '../math/vec'
import type { CubeDef, FaceDir, FaceUv, MeshDef, PartNode, TextureDef } from '../model/avatar-model'
import { boxUv } from '../model/box-uv'
import { parentTypeOf } from '../figura/parent-types'

/**
 * Parser für Blockbench-Modelle (`.bbmodel`, JSON), wie Figura sie verwendet.
 *
 * Koordinaten: In Blockbench schaut die Figur nach −Z (Seite „north“) und ihre rechte
 * Seite liegt bei +X. Unser Modellraum ist dazu um 180° um die Hochachse gedreht
 * (Figur schaut nach +Z, rechte Seite bei −X): x → −x, z → −z, Drehungen um X und Z
 * kehren ihr Vorzeichen um. UVs bleiben gleich, nur die Zuordnung zu den Ecken ändert sich.
 */

export interface ParsedBbmodel {
  readonly root: PartNode
  readonly textures: readonly TextureDef[]
  /** Rohdaten der Animationen (Auswertung in `core/animation/clip.ts`). */
  readonly animations: readonly unknown[]
  /** Gruppen-UUID → Teil-ID (Animationen sprechen Gruppen per UUID an). */
  readonly partIdByUuid: ReadonlyMap<string, string>
  readonly warnings: readonly string[]
}

export interface BbmodelOptions {
  /** Präfix für alle IDs, z. B. „figura.model“ – muss pro Modell eindeutig sein. */
  readonly idPrefix: string
  /** Anzeigename des Wurzelteils (Figura: Dateiname ohne Endung). */
  readonly rootName: string
  /** Liefert die Bytes einer externen Textur (relativ zur Modelldatei) oder null. */
  readonly loadExternal?: (path: string) => Uint8Array | null
}

export class BbmodelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BbmodelError'
  }
}

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const vec = (v: unknown, fallback: Vec3 = [0, 0, 0]): Vec3 =>
  Array.isArray(v) && v.length >= 3 ? [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])] : fallback

/** Blockbench → unser Modellraum. */
export const toOurs = (v: Vec3): Vec3 => [-v[0], v[1], -v[2]]
export const rotationToOurs = (r: Vec3): Vec3 => [-r[0], r[1], -r[2]]

const BB_FACES = ['north', 'south', 'east', 'west', 'up', 'down'] as const
type BbFace = (typeof BB_FACES)[number]

/** Blockbench-Seite → unsere Seite. */
const FACE_MAP: Readonly<Record<BbFace, FaceDir>> = { north: '+z', south: '-z', east: '-x', west: '+x', up: '+y', down: '-y' }
/**
 * Welche Blockbench-Ecke (Reihenfolge der three.js-BoxGeometry) zu unserer Ecke
 * [oben links, oben rechts, unten links, unten rechts] gehört. Für die Seitenflächen
 * stimmen sie überein, Ober- und Unterseite sind durch die Drehung vertauscht.
 */
const CORNER_MAP: Readonly<Record<BbFace, readonly [number, number, number, number]>> = {
  north: [0, 1, 2, 3],
  south: [0, 1, 2, 3],
  east: [0, 1, 2, 3],
  west: [0, 1, 2, 3],
  up: [3, 2, 1, 0],
  down: [1, 0, 3, 2]
}

type Corner = readonly [number, number]

/** UV einer Seite inkl. Blockbench-Drehung (0/90/180/270) als Ecken in unserer Reihenfolge. */
export function faceUvFromBb(face: BbFace, uv: readonly number[], rotation: number): FaceUv {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = uv
  let corners: Corner[] = [
    [x1, y1],
    [x2, y1],
    [x1, y2],
    [x2, y2]
  ]
  // Je 90°: Ecke oben links bekommt, was vorher unten links lag (Blockbench-Verhalten).
  for (let r = ((Math.round(rotation / 90) % 4) + 4) % 4; r > 0; r--) corners = [corners[2]!, corners[0]!, corners[3]!, corners[1]!]
  const map = CORNER_MAP[face]
  const ours = map.map((i) => corners[i]!) as [Corner, Corner, Corner, Corner]
  return { u0: ours[0][0], v0: ours[0][1], u1: ours[3][0], v1: ours[3][1], corners: ours }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Ersatztextur (violett/schwarz kariert), wenn eine Textur fehlt oder kaputt ist. */
function missingTexture(): RgbaImage {
  const image = createImage(16, 16)
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) fillRect(image, x * 8, y * 8, 8, 8, (x + y) % 2 ? 0x000000ff : 0xf800f8ff)
  return image
}

async function parseTextures(model: Json, options: BbmodelOptions, warnings: string[]): Promise<TextureDef[]> {
  const resolution = isRecord(model['resolution']) ? model['resolution'] : {}
  const projectW = num(resolution['width'], 16)
  const projectH = num(resolution['height'], 16)
  const raw = Array.isArray(model['textures']) ? model['textures'] : []

  const textures = await Promise.all(
    raw.map(async (entry, index): Promise<{ def: TextureDef; baseName: string }> => {
      const t = isRecord(entry) ? entry : {}
      const name = typeof t['name'] === 'string' ? t['name'] : `textur${index}`
      let image: RgbaImage | null = null
      try {
        const source = typeof t['source'] === 'string' ? t['source'] : ''
        let bytes: Uint8Array | null = null
        if (source.startsWith('data:')) bytes = base64ToBytes(source.slice(source.indexOf(',') + 1))
        else bytes = options.loadExternal?.(typeof t['relative_path'] === 'string' ? t['relative_path'] : name) ?? options.loadExternal?.(name) ?? null
        if (bytes) image = await decodePng(bytes)
        else warnings.push(`Textur „${name}“ nicht gefunden – Ersatztextur verwendet.`)
      } catch {
        warnings.push(`Textur „${name}“ konnte nicht gelesen werden – Ersatztextur verwendet.`)
      }
      const def: TextureDef = {
        id: `${options.idPrefix}#tex${index}`,
        name,
        image: image ?? missingTexture(),
        uvWidth: num(t['uv_width'], projectW),
        uvHeight: num(t['uv_height'], projectH)
      }
      return { def, baseName: name.replace(/\.png$/i, '') }
    })
  )

  // Figura: „name_e.png“ ist die Leucht-Schicht von „name.png“.
  return textures.map(({ def, baseName }) => {
    const emissive = textures.find((t) => t.baseName === `${baseName}_e`)
    return emissive && emissive.def.image.width === def.image.width && emissive.def.image.height === def.image.height ? { ...def, emissive: emissive.def.image } : def
  })
}

const textureIndex = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null)

/** Ein Blockbench-Würfel → ein oder mehrere CubeDefs (eine pro verwendeter Textur). */
function parseCube(element: Json, textures: readonly TextureDef[], projectBoxUv: boolean, idBase: string, warnings: string[]): CubeDef[] {
  const name = typeof element['name'] === 'string' ? element['name'] : 'Würfel'
  const from = toOurs(vec(element['from']))
  const to = toOurs(vec(element['to']))
  const common = {
    name,
    from,
    to,
    inflate: num(element['inflate']),
    layer: 'cutout' as const,
    rotation: rotationToOurs(vec(element['rotation'])),
    origin: toOurs(vec(element['origin'])),
    visible: element['visibility'] !== false
  }
  const faces = isRecord(element['faces']) ? element['faces'] : {}
  const boxMode = typeof element['box_uv'] === 'boolean' ? element['box_uv'] : projectBoxUv

  const byTexture = new Map<number, Partial<Record<FaceDir, FaceUv>>>()
  const add = (tex: number | null, dir: FaceDir, uv: FaceUv): void => {
    if (tex === null || !textures[tex]) return
    const entry = byTexture.get(tex) ?? {}
    entry[dir] = uv
    byTexture.set(tex, entry)
  }

  if (boxMode) {
    const raw = vec(element['from']).map((v, i) => Math.abs(vec(element['to'])[i]! - v))
    const size: Vec3 = [Math.floor(raw[0]! + 1e-6), Math.floor(raw[1]! + 1e-6), Math.floor(raw[2]! + 1e-6)]
    const offset = Array.isArray(element['uv_offset']) ? element['uv_offset'] : [0, 0]
    const uvs = boxUv(num(offset[0]), num(offset[1]), size)
    const mirror = element['mirror_uv'] === true
    const tex = textureIndex(isRecord(faces['north']) ? faces['north']['texture'] : 0) ?? 0
    for (const [dir, uv] of Object.entries(uvs) as [FaceDir, FaceUv][]) {
      // Gespiegelte Box-UV: linke und rechte Seite tauschen, alles horizontal spiegeln.
      const target: FaceDir = mirror && (dir === '+x' || dir === '-x') ? (dir === '+x' ? '-x' : '+x') : dir
      add(tex, target, mirror ? { u0: uv.u1, v0: uv.v0, u1: uv.u0, v1: uv.v1 } : uv)
    }
  } else {
    for (const face of BB_FACES) {
      const f = faces[face]
      if (!isRecord(f) || !Array.isArray(f['uv'])) continue
      add(textureIndex(f['texture']), FACE_MAP[face], faceUvFromBb(face, f['uv'].map((v) => num(v)), num(f['rotation'])))
    }
  }
  if (byTexture.size === 0) warnings.push(`Würfel „${name}“ hat keine Textur und wird nicht gezeichnet.`)

  return [...byTexture].map(([tex, faceUvs], i) => ({ ...common, id: `${idBase}${i ? `#${i}` : ''}`, textureId: textures[tex]!.id, faces: faceUvs }))
}

/** Ein Blockbench-Mesh → Dreiecke in unserem Raum (eine MeshDef pro Textur). */
function parseMesh(element: Json, textures: readonly TextureDef[], idBase: string, warnings: string[]): MeshDef[] {
  const name = typeof element['name'] === 'string' ? element['name'] : 'Mesh'
  const origin = vec(element['origin'])
  const rot = vec(element['rotation'])
  const q = quatFromEulerZYX(rot[0], rot[1], rot[2])
  const vertices = isRecord(element['vertices']) ? element['vertices'] : {}
  const world = (key: string): Vec3 | null => {
    const local = vertices[key]
    if (!Array.isArray(local)) return null
    const r = quatRotate(q, vec(local))
    return toOurs([r[0] + origin[0], r[1] + origin[1], r[2] + origin[2]])
  }

  const byTexture = new Map<number, MeshDef['triangles'][number][]>()
  let polygons = 0
  for (const face of Object.values(isRecord(element['faces']) ? element['faces'] : {})) {
    if (!isRecord(face) || !Array.isArray(face['vertices'])) continue
    const tex = textureIndex(face['texture'])
    if (tex === null || !textures[tex]) continue
    const keys = face['vertices'].filter((k): k is string => typeof k === 'string')
    const uvMap = isRecord(face['uv']) ? face['uv'] : {}
    const points = keys.map((k) => ({ p: world(k), uv: Array.isArray(uvMap[k]) ? ([num(uvMap[k][0]), num(uvMap[k][1])] as const) : ([0, 0] as const) }))
    if (points.some((pt) => !pt.p) || points.length < 3) continue
    let order = points.map((_, i) => i)
    if (points.length === 4) {
      // Blockbench speichert Vierecke nicht immer in Umlaufreihenfolge – prüfen und ggf. umsortieren.
      const n = (a: number, b: number, c: number): Vec3 => {
        const [pa, pb, pc] = [points[a]!.p!, points[b]!.p!, points[c]!.p!]
        const u: Vec3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
        const v: Vec3 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]
        return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      }
      const n1 = n(0, 1, 2)
      const n2 = n(0, 2, 3)
      if (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < 0) order = [0, 1, 3, 2]
    } else if (points.length > 4) {
      polygons++
    }
    const triangles = byTexture.get(tex) ?? []
    for (let i = 1; i + 1 < order.length; i++) {
      const [a, b, c] = [points[order[0]!]!, points[order[i]!]!, points[order[i + 1]!]!]
      triangles.push({ positions: [a.p!, b.p!, c.p!], uvs: [a.uv, b.uv, c.uv] })
    }
    byTexture.set(tex, triangles)
  }
  if (polygons > 0) warnings.push(`Mesh „${name}“: ${polygons} Vielecke mit mehr als 4 Ecken wurden vereinfacht zerlegt.`)
  const visible = element['visibility'] !== false
  return [...byTexture].map(([tex, triangles], i) => ({ id: `${idBase}${i ? `#${i}` : ''}`, name, textureId: textures[tex]!.id, visible, triangles }))
}

/** Liest eine `.bbmodel`-Datei (bereits als JSON geparst). Wirft nur bei völlig ungültigen Daten. */
export async function parseBbmodel(json: unknown, options: BbmodelOptions): Promise<ParsedBbmodel> {
  if (!isRecord(json) || !Array.isArray(json['elements']) || !Array.isArray(json['outliner'])) {
    throw new BbmodelError('Keine gültige Blockbench-Datei (elements/outliner fehlen).')
  }
  const warnings: string[] = []
  const meta = isRecord(json['meta']) ? json['meta'] : {}
  const textures = await parseTextures(json, options, warnings)
  const projectBoxUv = meta['box_uv'] === true

  // Elemente nach UUID, damit der Gliederungsbaum sie zuordnen kann.
  const elements = new Map<string, Json>()
  for (const element of json['elements']) if (isRecord(element) && typeof element['uuid'] === 'string') elements.set(element['uuid'], element)
  // Blockbench 5 speichert Gruppen getrennt in „groups“; der Gliederungsbaum enthält dann nur UUIDs.
  const groups = new Map<string, Json>()
  for (const group of Array.isArray(json['groups']) ? json['groups'] : []) if (isRecord(group) && typeof group['uuid'] === 'string') groups.set(group['uuid'], group)

  const partIdByUuid = new Map<string, string>()
  const ignoredTypes = new Set<string>()
  const usedIds = new Set<string>()
  const uniqueId = (wanted: string): string => {
    let id = wanted
    for (let n = 2; usedIds.has(id); n++) id = `${wanted}~${n}`
    usedIds.add(id)
    return id
  }

  const attachElement = (uuid: string, path: string, cubes: CubeDef[], meshes: MeshDef[]): void => {
    const element = elements.get(uuid)
    if (!element) return
    const type = typeof element['type'] === 'string' ? element['type'] : 'cube'
    const name = typeof element['name'] === 'string' ? element['name'] : type
    const idBase = uniqueId(`${path}/${name}`)
    if (type === 'cube') cubes.push(...parseCube(element, textures, projectBoxUv, idBase, warnings))
    else if (type === 'mesh') meshes.push(...parseMesh(element, textures, idBase, warnings))
    else ignoredTypes.add(type)
  }

  const buildGroup = (node: Json, parentPath: string, depth: number): PartNode | null => {
    const group = typeof node['name'] === 'string' ? node : (groups.get(String(node['uuid'])) ?? null)
    if (!group || depth > 64) return null
    const name = String(group['name'])
    const id = uniqueId(`${parentPath}.${name}`)
    if (typeof group['uuid'] === 'string') partIdByUuid.set(group['uuid'], id)
    const cubes: CubeDef[] = []
    const meshes: MeshDef[] = []
    const children: PartNode[] = []
    const childList = Array.isArray(node['children']) ? node['children'] : Array.isArray(group['children']) ? group['children'] : []
    for (const child of childList) {
      if (typeof child === 'string') attachElement(child, id, cubes, meshes)
      else if (isRecord(child)) {
        const part = buildGroup(child, id, depth + 1)
        if (part) children.push(part)
      }
    }
    const parent = parentTypeOf(name)
    if (parent?.hidden) warnings.push(`Gruppe „${name}“ (Parent-Type ${parent.type}) gehört zu einer Spielansicht, die es hier nicht gibt, und wird ausgeblendet.`)
    return {
      id,
      name,
      origin: 'bbmodel',
      pivot: toOurs(vec(group['origin'])),
      rotation: rotationToOurs(vec(group['rotation'])),
      visible: group['visibility'] !== false && !parent?.hidden,
      ...(parent ? { figuraParent: parent.type } : {}),
      cubes,
      ...(meshes.length > 0 ? { meshes } : {}),
      children
    }
  }

  const rootCubes: CubeDef[] = []
  const rootMeshes: MeshDef[] = []
  const rootChildren: PartNode[] = []
  for (const node of json['outliner']) {
    if (typeof node === 'string') attachElement(node, options.idPrefix, rootCubes, rootMeshes)
    else if (isRecord(node)) {
      const part = buildGroup(node, options.idPrefix, 0)
      if (part) rootChildren.push(part)
    }
  }
  if (ignoredTypes.size > 0) warnings.push(`Nicht unterstützte Elemente ignoriert: ${[...ignoredTypes].join(', ')}.`)

  return {
    root: {
      id: options.idPrefix,
      name: options.rootName,
      origin: 'bbmodel',
      pivot: [0, 0, 0],
      rotation: [0, 0, 0],
      visible: true,
      cubes: rootCubes,
      ...(rootMeshes.length > 0 ? { meshes: rootMeshes } : {}),
      children: rootChildren
    },
    textures,
    animations: Array.isArray(json['animations']) ? json['animations'] : [],
    partIdByUuid,
    warnings
  }
}
