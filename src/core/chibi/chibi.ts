import type { RgbaImage } from '../image/rgba-image'
import type { Vec3 } from '../math/vec'
import type { AvatarModel, CubeDef, FaceDir, FaceUv, MeshDef, PartNode, TextureDef } from '../model/avatar-model'

/**
 * Chibi-Modus: nicht-destruktive Kind-/Chibi-Version des Avatars (siehe docs/spec-M3b-chibi.md).
 *
 * Das fertige Modell wird umgebaut: Beine, Körper und Arme werden kürzer, der Kopf größer,
 * alle Teile bleiben verbunden (Füße am Boden, Kopf auf dem Körper). Zubehör und Figura-Teile
 * wandern mit dem Körperteil, an dem sie hängen. Teil-IDs bleiben gleich, damit Rollen,
 * Tracking, Physik, Animationen und Lua unverändert funktionieren.
 */

export type ChibiPreset = 'kid' | 'chibi' | 'sd' | 'custom'
/** resample = B (pixeltreu neu rechnen), scale = A (nur Geometrie), crop = A+ (Mitte weglassen). */
export type ChibiTextureMode = 'resample' | 'scale' | 'crop'

export interface ChibiPartAdjust {
  /** Zusätzlicher Faktor um den Drehpunkt des Teils. */
  readonly scale: Vec3
  /** Verschiebung in Pixeln. */
  readonly offset: Vec3
  /** Drehpunkt verschieben (Geometrie bleibt). */
  readonly pivot: Vec3
}

export interface ChibiSettings {
  readonly enabled: boolean
  readonly preset: ChibiPreset
  readonly head: number
  readonly body: number
  readonly arms: number
  readonly legs: number
  readonly textureMode: ChibiTextureMode
  readonly parts: Readonly<Record<string, ChibiPartAdjust>>
}

export const CHIBI_PRESETS: Readonly<Record<Exclude<ChibiPreset, 'custom'>, { head: number; body: number; arms: number; legs: number }>> = {
  kid: { head: 1.2, body: 0.8, arms: 0.8, legs: 0.75 },
  chibi: { head: 1.5, body: 0.6, arms: 0.6, legs: 0.5 },
  sd: { head: 2, body: 0.5, arms: 0.5, legs: 0.35 }
}

export const DEFAULT_CHIBI: ChibiSettings = { enabled: false, preset: 'chibi', ...CHIBI_PRESETS.chibi, textureMode: 'resample', parts: {} }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const clamp = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const vec = (v: unknown, fallback: number, min: number, max: number): Vec3 =>
  Array.isArray(v) && v.length === 3 ? [clamp(v[0], min, max, fallback), clamp(v[1], min, max, fallback), clamp(v[2], min, max, fallback)] : [fallback, fallback, fallback]

/** Liest gespeicherte Chibi-Einstellungen robust. */
export function parseChibiSettings(value: unknown): ChibiSettings {
  if (!isRecord(value)) return DEFAULT_CHIBI
  const parts: Record<string, ChibiPartAdjust> = {}
  if (isRecord(value['parts'])) {
    for (const [id, raw] of Object.entries(value['parts']).slice(0, 500)) {
      if (!isRecord(raw) || id.length > 300) continue
      parts[id] = { scale: vec(raw['scale'], 1, 0.05, 5), offset: vec(raw['offset'], 0, -64, 64), pivot: vec(raw['pivot'], 0, -64, 64) }
    }
  }
  return {
    enabled: value['enabled'] === true,
    preset: (['kid', 'chibi', 'sd', 'custom'] as const).includes(value['preset'] as ChibiPreset) ? (value['preset'] as ChibiPreset) : 'chibi',
    head: clamp(value['head'], 0.5, 3, DEFAULT_CHIBI.head),
    body: clamp(value['body'], 0.2, 1.5, DEFAULT_CHIBI.body),
    arms: clamp(value['arms'], 0.2, 1.5, DEFAULT_CHIBI.arms),
    legs: clamp(value['legs'], 0.1, 1.5, DEFAULT_CHIBI.legs),
    textureMode: (['resample', 'scale', 'crop'] as const).includes(value['textureMode'] as ChibiTextureMode) ? (value['textureMode'] as ChibiTextureMode) : 'resample',
    parts
  }
}

// ---------------------------------------------------------------------------
// Geometrie

/** Skalieren um einen Ankerpunkt, dann verschieben (absolute Modellkoordinaten). */
interface Transform {
  readonly anchor: Vec3
  readonly scale: Vec3
  readonly translate: Vec3
}

const IDENTITY: Transform = { anchor: [0, 0, 0], scale: [1, 1, 1], translate: [0, 0, 0] }

const apply = (t: Transform, p: Vec3): Vec3 => [
  t.anchor[0] + (p[0] - t.anchor[0]) * t.scale[0] + t.translate[0],
  t.anchor[1] + (p[1] - t.anchor[1]) * t.scale[1] + t.translate[1],
  t.anchor[2] + (p[2] - t.anchor[2]) * t.scale[2] + t.translate[2]
]

type PointMap = (p: Vec3) => Vec3

function transformCube(cube: CubeDef, map: PointMap, scale: Vec3): CubeDef {
  const from = map(cube.from)
  const to = map(cube.to)
  return {
    ...cube,
    from,
    to,
    inflate: cube.inflate * Math.min(scale[0], scale[1], scale[2]),
    ...(cube.origin ? { origin: map(cube.origin) } : {})
  }
}

function transformMesh(mesh: MeshDef, map: PointMap): MeshDef {
  return { ...mesh, triangles: mesh.triangles.map((t) => ({ ...t, positions: [map(t.positions[0]), map(t.positions[1]), map(t.positions[2])] as const })) }
}

const mul3 = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]]

/**
 * Wendet eine Abbildung auf einen ganzen Teilbaum an. Einzelanpassungen (`parts`) wirken
 * zusätzlich um den (bereits verschobenen) Drehpunkt des jeweiligen Teils und vererben sich.
 */
function transformTree(
  node: PartNode,
  inherited: { map: PointMap; scale: Vec3; region: Region },
  layout: ChibiLayout,
  adjust: Readonly<Record<string, ChibiPartAdjust>>,
  scales: Map<string, Vec3>
): PartNode {
  // Teile mit Vanilla-ID oder Figura-Parent-Type gehören zu ihrem Körperbereich – egal wie tief sie
  // liegen (Figura-Modelle hängen unter einer eigenen Wurzel). Alle Abbildungen sind absolut.
  // Gleicher Bereich wie das Elternteil (z. B. Hut-Ebene im Kopf): Abbildung samt Feinanpassungen erben.
  const explicit = explicitRegion(node)
  const region = explicit ?? inherited.region
  const own0 = explicit && explicit !== inherited.region ? layout.transforms[explicit] : null
  const map = own0 ? (p: Vec3) => apply(own0, p) : inherited.map
  const scale = own0 ? own0.scale : inherited.scale
  let localMap = map
  let localScale = scale
  let pivot = map(node.pivot)
  const own = adjust[node.id]
  if (own) {
    const center = pivot
    const extra: Transform = { anchor: center, scale: own.scale, translate: own.offset }
    const outer = localMap
    localMap = (p) => apply(extra, outer(p))
    localScale = mul3(scale, own.scale)
    pivot = [center[0] + own.offset[0] + own.pivot[0], center[1] + own.offset[1] + own.pivot[1], center[2] + own.offset[2] + own.pivot[2]]
  }
  // Verschiebungen eines Teils (Animation, Lua) wirken im Raum des Elternteils.
  scales.set(node.id, scale)
  return {
    ...node,
    pivot,
    cubes: node.cubes.map((c) => {
      scales.set(c.id, localScale)
      return transformCube(c, localMap, localScale)
    }),
    ...(node.meshes ? { meshes: node.meshes.map((m) => transformMesh(m, localMap)) } : {}),
    children: node.children.map((child) => transformTree(child, { map: localMap, scale: localScale, region }, layout, adjust, scales))
  }
}

type Region = 'head' | 'body' | 'arms' | 'legs' | 'fixed'

/** Körperbereich eines Teils mit Vanilla-ID oder Figura-Parent-Type (sonst null = vom Elternteil erben). */
function explicitRegion(part: PartNode): Region | null {
  const key = part.vanillaId ?? part.figuraParent
  if (!key) return null
  if (key === 'head' || key === 'hat' || key === 'Head') return 'head'
  if (['rightArm', 'leftArm', 'rightSleeve', 'leftSleeve', 'LeftArm', 'RightArm'].includes(key)) return 'arms'
  if (['rightLeg', 'leftLeg', 'rightPants', 'leftPants', 'LeftLeg', 'RightLeg'].includes(key)) return 'legs'
  if (key === 'World') return 'fixed'
  return 'body'
}

export interface ChibiLayout {
  /** Effektive Faktoren (Längen bei „resample“/„crop“ auf ganze Pixel gerundet). */
  readonly head: number
  readonly body: number
  readonly arms: number
  readonly legs: number
  readonly transforms: Readonly<Record<Region, Transform>>
}

/** Vanilla-Maße (Pixel): Beine 0–12, Körper 12–24, Arme hängen ab 24, Kopf ab 24. */
const LEG_TOP = 12
const BODY_TOP = 24
const LIMB_LENGTH = 12

export function chibiLayout(settings: ChibiSettings): ChibiLayout {
  const pixel = settings.textureMode !== 'scale'
  const len = (f: number): number => (pixel ? Math.max(1, Math.round(LIMB_LENGTH * f)) / LIMB_LENGTH : f)
  const legs = len(settings.legs)
  const body = len(settings.body)
  const arms = len(settings.arms)
  const head = settings.head
  const hip = LEG_TOP * legs
  const top = hip + LIMB_LENGTH * body
  return {
    head,
    body,
    arms,
    legs,
    transforms: {
      legs: { anchor: [0, 0, 0], scale: [1, legs, 1], translate: [0, 0, 0] },
      body: { anchor: [0, LEG_TOP, 0], scale: [1, body, 1], translate: [0, hip - LEG_TOP, 0] },
      arms: { anchor: [0, BODY_TOP, 0], scale: [1, arms, 1], translate: [0, top - BODY_TOP, 0] },
      head: { anchor: [0, BODY_TOP, 0], scale: [head, head, head], translate: [0, top - BODY_TOP, 0] },
      fixed: IDENTITY
    }
  }
}

export interface ChibiResult {
  readonly model: AvatarModel
  /** Gesamtfaktor pro Teil (für Verschiebungen aus Animationen und Lua). */
  readonly partScale: ReadonlyMap<string, Vec3>
  readonly layout: ChibiLayout
}

/** Baut die Chibi-Version des Modells (ohne Wirkung, wenn ausgeschaltet). */
export function applyChibi(model: AvatarModel, settings: ChibiSettings, skinTextureId = 'skin'): ChibiResult {
  const layout = chibiLayout(settings)
  const scales = new Map<string, Vec3>()
  if (!settings.enabled) return { model, partScale: scales, layout }

  // Teile ohne eigenen Bereich (z. B. Figura-Modellwurzel, Zubehör an der Wurzel) folgen dem Körper.
  const body = layout.transforms.body
  const children = model.root.children.map((part) => transformTree(part, { map: (p) => apply(body, p), scale: body.scale, region: 'body' }, layout, settings.parts, scales))
  let root: PartNode = { ...model.root, children }

  // Texturen: Vanilla-Arme/-Beine/-Körper pixeltreu kürzen (B oder A+), UVs anpassen.
  let textures = model.textures
  const skin = model.textures.get(skinTextureId)
  if (skin && settings.textureMode !== 'scale') {
    const plan = resamplePlan(root, skinTextureId, layout)
    if (plan.length > 0) {
      root = applyPlanUvs(root, plan)
      const next = new Map(textures)
      next.set(skinTextureId, { ...skin, image: resampleSkin(skin.image, skin.uvWidth, plan, settings.textureMode) } satisfies TextureDef)
      textures = next
    }
  }
  return { model: { root, textures }, partScale: scales, layout }
}

// ---------------------------------------------------------------------------
// Texturen (B: neu rechnen, A+: Mitte weglassen)

/** Eine Seitenfläche, deren Höhe sich ändert: Rechteck im UV-Raum und neue Höhe. */
export interface ResampleEntry {
  readonly cubeId: string
  readonly face: FaceDir
  readonly u: number
  readonly v: number
  readonly width: number
  readonly oldHeight: number
  readonly newHeight: number
}

const SIDE_FACES: readonly FaceDir[] = ['+x', '-x', '+z', '-z']

function resamplePlan(root: PartNode, textureId: string, layout: ChibiLayout): ResampleEntry[] {
  const plan: ResampleEntry[] = []
  const factor: Partial<Record<string, number>> = {
    rightArm: layout.arms, leftArm: layout.arms, rightSleeve: layout.arms, leftSleeve: layout.arms,
    rightLeg: layout.legs, leftLeg: layout.legs, rightPants: layout.legs, leftPants: layout.legs,
    body: layout.body, jacket: layout.body
  }
  const visit = (node: PartNode): void => {
    const f = node.origin === 'vanilla' || node.origin === 'vanilla-layer' ? factor[node.vanillaId ?? ''] : undefined
    if (f !== undefined && f !== 1) {
      for (const cube of node.cubes) {
        if (cube.textureId !== textureId) continue
        for (const face of SIDE_FACES) {
          const uv = cube.faces[face]
          if (!uv) continue
          const oldHeight = Math.abs(uv.v1 - uv.v0)
          const newHeight = Math.max(1, Math.round(oldHeight * f))
          if (newHeight === oldHeight) continue
          plan.push({ cubeId: cube.id, face, u: Math.min(uv.u0, uv.u1), v: Math.min(uv.v0, uv.v1), width: Math.abs(uv.u1 - uv.u0), oldHeight, newHeight })
        }
      }
    }
    node.children.forEach(visit)
  }
  visit(root)
  return plan
}

function applyPlanUvs(node: PartNode, plan: readonly ResampleEntry[]): PartNode {
  const cubes = node.cubes.map((cube) => {
    const entries = plan.filter((e) => e.cubeId === cube.id)
    if (entries.length === 0) return cube
    const faces: Partial<Record<FaceDir, FaceUv>> = { ...cube.faces }
    for (const e of entries) {
      const uv = faces[e.face]!
      // Oben (v klein) bleibt oben; die Fläche endet jetzt nach `newHeight` Zeilen.
      faces[e.face] = uv.v0 <= uv.v1 ? { ...uv, v1: uv.v0 + e.newHeight } : { ...uv, v0: uv.v1 + e.newHeight }
    }
    return { ...cube, faces }
  })
  return { ...node, cubes, children: node.children.map((c) => applyPlanUvs(c, plan)) }
}

/** Quellzeile für eine neue Zeile (in UV-Einheiten). */
export function sourceRow(row: number, oldHeight: number, newHeight: number, mode: Exclude<ChibiTextureMode, 'scale'>): number {
  if (mode === 'resample') return Math.min(oldHeight - 1, Math.floor(((row + 0.5) * oldHeight) / newHeight))
  // A+: oberer Teil (Schultern/Hüfte) und unterer Teil (Hände/Füße) bleiben, die Mitte fällt weg.
  const top = Math.ceil(newHeight / 2)
  return row < top ? row : oldHeight - (newHeight - row)
}

/** Schreibt die gekürzten Flächen in eine Kopie der Skin-Textur (oben in das alte Rechteck). */
export function resampleSkin(image: RgbaImage, uvWidth: number, plan: readonly ResampleEntry[], mode: ChibiTextureMode): RgbaImage {
  if (mode === 'scale' || plan.length === 0) return image
  const s = image.width / uvWidth
  const data = new Uint8ClampedArray(image.data)
  for (const e of plan) {
    // Erst alle Quellzeilen lesen, dann schreiben (Ziel und Quelle überlappen).
    const rows: Uint8ClampedArray[] = []
    for (let r = 0; r < e.newHeight * s; r++) {
      const unit = sourceRow(Math.floor(r / s), e.oldHeight, e.newHeight, mode)
      const y = Math.round((e.v + unit) * s + (r % s))
      const x = Math.round(e.u * s)
      const start = (y * image.width + x) * 4
      rows.push(image.data.slice(start, start + Math.round(e.width * s) * 4))
    }
    rows.forEach((row, r) => data.set(row, (Math.round(e.v * s + r) * image.width + Math.round(e.u * s)) * 4))
  }
  return { ...image, data }
}

/** Plan für eine Skin-Textur (für die Laufzeit, die die Skin-Textur jedes Mal neu setzt). */
export function chibiSkinPlan(original: AvatarModel, settings: ChibiSettings, skinTextureId = 'skin'): ResampleEntry[] {
  if (!settings.enabled || settings.textureMode === 'scale') return []
  return resamplePlan(original.root, skinTextureId, chibiLayout(settings))
}
