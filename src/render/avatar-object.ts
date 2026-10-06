import {
  AxesHelper,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  FrontSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  Vector3,
  type DataTexture,
  type Euler,
  type Object3D,
  type Raycaster
} from 'three'
import type { CellRect } from '../core/face/face-layout'
import type { RgbaImage } from '../core/image/rgba-image'
import { sub3, type Vec3 } from '../core/math/vec'
import type { AvatarModel, CubeDef, PartNode, PartOrigin, RenderLayer } from '../core/model/avatar-model'
import { buildCubeGeometry, buildMeshGeometry, type GeometryData } from '../core/model/cube-geometry'
import type { Pose } from '../core/pipeline/pose'
import { FACE_PART_IDS } from '../core/roles/rig'
import { createPixelTexture } from './pixel-texture'

/** Setzt/entfernt `id` in `set`; true, wenn sich etwas geändert hat. */
function toggle(set: Set<string>, id: string, wanted: boolean): boolean {
  if (set.has(id) === wanted) return false
  if (wanted) set.add(id)
  else set.delete(id)
  return true
}

/** Leucht-Textur: Farbe mit Deckkraft multiplizieren, damit durchsichtige Pixel nicht leuchten. */
function premultiplied(image: RgbaImage): RgbaImage {
  const data = new Uint8ClampedArray(image.data)
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255
    data[i] = data[i]! * a
    data[i + 1] = data[i + 1]! * a
    data[i + 2] = data[i + 2]! * a
    data[i + 3] = 255
  }
  return { ...image, data }
}

const HIGHLIGHT_COLOR = 0x74d77f
const FACE_HIGHLIGHT_COLOR = 0xffd166

interface PartRecord {
  readonly node: PartNode
  readonly parent: PartRecord | null
  readonly group: Group
  readonly restPosition: Vector3
  readonly restRotation: Euler
  readonly meshes: MeshRecord[]
}

interface MeshRecord {
  readonly mesh: Mesh
  readonly part: PartRecord
  /** Würfel oder null bei einem freien Polygonnetz (Blockbench-„Mesh“). */
  readonly cube: CubeDef | null
  readonly elementId: string
  readonly textureId: string
  readonly layer: RenderLayer
  /** Sichtbarkeit des Elements selbst (Blockbench-Auge). */
  readonly elementVisible: boolean
  readonly baseUvs: Float32Array
  readonly uvWidth: number
  readonly uvHeight: number
  uvOffset: readonly [number, number]
}

export interface PickResult {
  readonly partId: string
  readonly cubeId: string
  /** Texturkoordinate des Treffers (0…1, v von oben). */
  readonly uv: readonly [number, number] | null
}

export interface DebugDisplayOptions {
  readonly wireframe: boolean
  readonly pivots: boolean
}

/**
 * Three.js-Abbild eines `AvatarModel`. Jedes Teil wird eine `Group` am Drehpunkt;
 * Posen (Tracking, Rollen, später Animationen und Lua) verändern diese Gruppen.
 * Sichtbarkeit wird pro Mesh berechnet, damit auch „Solo“ für Unterteile funktioniert.
 */
export class AvatarObject {
  readonly root = new Group()
  private readonly parts = new Map<string, PartRecord>()
  private readonly meshes: MeshRecord[] = []
  private readonly geometries: BufferGeometry[] = []
  private readonly materials = new Map<string, MeshLambertMaterial>()
  private readonly textures = new Map<string, DataTexture>()
  private readonly emissiveTextures = new Map<string, DataTexture>()
  private readonly posedParts = new Set<string>()

  private readonly hiddenOrigins = new Set<PartOrigin>()
  private debugHidden: ReadonlySet<string> = new Set()
  private solo: ReadonlySet<string> = new Set()
  private readonly poseHidden = new Set<string>()
  private readonly poseShown = new Set<string>()

  private highlightObjects: Object3D[] = []
  private pivotHelpers: Object3D[] = []
  private readonly highlightMaterial = new LineBasicMaterial({ color: HIGHLIGHT_COLOR, depthTest: false, transparent: true })
  private readonly faceHighlightMaterial = new LineBasicMaterial({ color: FACE_HIGHLIGHT_COLOR, depthTest: false, transparent: true })

  constructor(private readonly model: AvatarModel) {
    for (const def of model.textures.values()) {
      this.textures.set(def.id, createPixelTexture(def.image))
      if (def.emissive) this.emissiveTextures.set(def.id, createPixelTexture(premultiplied(def.emissive)))
    }
    this.root.name = 'avatar'
    this.root.add(this.buildPart(model.root, null))
  }

  getPartObject(id: string): Group | undefined {
    return this.parts.get(id)?.group
  }

  // -------------------------------------------------------------------------
  // Pose

  /**
   * Wendet eine Pose an (Rotation/Position addiert, Skalierung multipliziert).
   * Teile, die nicht mehr in der Pose vorkommen, gehen in die Ruhelage zurück.
   */
  applyPose(pose: Pose): void {
    for (const id of this.posedParts) if (!pose.has(id)) this.resetPart(id)
    this.posedParts.clear()
    let visibilityChanged = false

    for (const [id, partPose] of pose) {
      const record = this.parts.get(id)
      if (!record) continue
      const { group, restPosition, restRotation } = record
      group.rotation.set(
        restRotation.x + MathUtils.degToRad(partPose.rotation[0]),
        restRotation.y + MathUtils.degToRad(partPose.rotation[1]),
        restRotation.z + MathUtils.degToRad(partPose.rotation[2]),
        'ZYX'
      )
      group.position.set(restPosition.x + partPose.position[0], restPosition.y + partPose.position[1], restPosition.z + partPose.position[2])
      group.scale.set(partPose.scale[0], partPose.scale[1], partPose.scale[2])
      if (toggle(this.poseHidden, id, !partPose.visible)) visibilityChanged = true
      if (toggle(this.poseShown, id, partPose.shown)) visibilityChanged = true
      for (const mesh of record.meshes) this.setUvOffset(mesh, partPose.uvOffset)
      this.posedParts.add(id)
    }
    if (visibilityChanged) this.refreshVisibility()
  }

  private resetPart(id: string): void {
    const record = this.parts.get(id)
    if (!record) return
    record.group.rotation.copy(record.restRotation)
    record.group.position.copy(record.restPosition)
    record.group.scale.set(1, 1, 1)
    for (const mesh of record.meshes) this.setUvOffset(mesh, [0, 0])
    const hiddenChanged = this.poseHidden.delete(id)
    if (this.poseShown.delete(id) || hiddenChanged) this.refreshVisibility()
  }

  private setUvOffset(record: MeshRecord, offset: readonly [number, number]): void {
    if (record.uvOffset[0] === offset[0] && record.uvOffset[1] === offset[1]) return
    record.uvOffset = [offset[0], offset[1]]
    const attribute = record.mesh.geometry.getAttribute('uv') as BufferAttribute
    const du = offset[0] / record.uvWidth
    const dv = offset[1] / record.uvHeight
    for (let i = 0; i < record.baseUvs.length; i += 2) {
      attribute.array[i] = record.baseUvs[i]! + du
      attribute.array[i + 1] = record.baseUvs[i + 1]! + dv
    }
    attribute.needsUpdate = true
  }

  // -------------------------------------------------------------------------
  // Sichtbarkeit

  /** Blendet alle Teile einer Herkunft ein/aus (z. B. die gesamte Außenschicht). */
  setOriginVisible(origin: PartOrigin, visible: boolean): void {
    if (visible) this.hiddenOrigins.delete(origin)
    else this.hiddenOrigins.add(origin)
    this.refreshVisibility()
  }

  /** Debug-Modus: einzelne Teile ausblenden bzw. nur bestimmte Teile zeigen („Solo“). */
  setDebugVisibility(hidden: ReadonlySet<string>, solo: ReadonlySet<string>): void {
    this.debugHidden = hidden
    this.solo = solo
    this.refreshVisibility()
  }

  private ownVisible(record: PartRecord): boolean {
    const { node } = record
    return (node.visible || this.poseShown.has(node.id)) && !this.hiddenOrigins.has(node.origin) && !this.debugHidden.has(node.id) && !this.poseHidden.has(node.id)
  }

  private refreshVisibility(): void {
    for (const record of this.parts.values()) {
      let visible = true
      let inSolo = this.solo.size === 0
      for (let r: PartRecord | null = record; r; r = r.parent) {
        if (!this.ownVisible(r)) visible = false
        if (this.solo.has(r.node.id)) inSolo = true
      }
      for (const mesh of record.meshes) mesh.mesh.visible = visible && inSolo && mesh.elementVisible
    }
  }

  // -------------------------------------------------------------------------
  // Texturen

  /** Ersetzt den Inhalt einer Textur (z. B. das jeden Frame neu zusammengesetzte Gesicht). */
  updateTexture(id: string, image: RgbaImage): void {
    const texture = this.textures.get(id)
    if (!texture) return
    const current = texture.image as { data: Uint8ClampedArray; width: number; height: number }
    if (current.width === image.width && current.height === image.height) {
      current.data.set(image.data)
      texture.needsUpdate = true
      return
    }
    // Andere Größe: neue Textur anlegen und in allen Materialien austauschen.
    const replacement = createPixelTexture(image)
    for (const [key, material] of this.materials) {
      if (key.startsWith(`${id}|`)) {
        material.map = replacement
        material.needsUpdate = true
      }
    }
    texture.dispose()
    this.textures.set(id, replacement)
  }

  // -------------------------------------------------------------------------
  // Auswahl (Debug-Modus)

  /** Ermittelt das sichtbare Teil unter dem Mauszeiger. */
  pick(raycaster: Raycaster): PickResult | null {
    const visible = this.meshes.filter((m) => m.mesh.visible)
    const hits = raycaster.intersectObjects(
      visible.map((m) => m.mesh),
      false
    )
    for (const hit of hits) {
      const record = visible.find((m) => m.mesh === hit.object)
      if (!record) continue
      // Beim Cutout-Material zählen nur deckende Pixel – ein Klick durch ein Hut-Loch trifft den Kopf.
      if (record.layer === 'cutout' && hit.uv && this.alphaAt(record.textureId, hit.uv.x, hit.uv.y) < 26) continue
      return { partId: record.part.node.id, cubeId: record.elementId, uv: hit.uv ? [hit.uv.x, hit.uv.y] : null }
    }
    return null
  }

  private alphaAt(textureId: string, u: number, v: number): number {
    const image = this.textures.get(textureId)?.image as { data: Uint8ClampedArray; width: number; height: number } | undefined
    if (!image) return 255
    const x = Math.min(image.width - 1, Math.max(0, Math.floor(u * image.width)))
    const y = Math.min(image.height - 1, Math.max(0, Math.floor(v * image.height)))
    return image.data[(y * image.width + x) * 4 + 3] ?? 255
  }

  /** Umrandet ausgewählte Teile/Würfel und markiert Gesichtsmerkmale auf dem Overlay. */
  setHighlight(partIds: ReadonlySet<string>, cubeIds: ReadonlySet<string>, faceRects: readonly CellRect[]): void {
    this.clearHighlight()
    for (const record of this.meshes) {
      const selectedPart = this.isInSelectedPart(record.part, partIds)
      if (!selectedPart && !cubeIds.has(record.elementId)) continue
      const lines = new LineSegments(new EdgesGeometry(record.mesh.geometry), this.highlightMaterial)
      lines.renderOrder = 999
      record.mesh.add(lines)
      this.highlightObjects.push(lines)
    }
    const overlay = this.parts.get(FACE_PART_IDS.overlay)
    const plane = overlay?.meshes[0]?.cube
    if (overlay && plane && faceRects.length > 0) {
      const { from, to } = plane
      const pivot = overlay.node.pivot
      const cellW = (to[0] - from[0]) / 8
      const cellH = (to[1] - from[1]) / 8
      const left = from[0] - pivot[0]
      const top = to[1] - pivot[1]
      const z = from[2] - pivot[2] + 0.6
      for (const rect of faceRects) {
        const x0 = left + rect.x * cellW
        const x1 = x0 + rect.w * cellW
        const y0 = top - rect.y * cellH
        const y1 = y0 - rect.h * cellH
        const geometry = new BufferGeometry().setFromPoints([new Vector3(x0, y0, z), new Vector3(x1, y0, z), new Vector3(x1, y1, z), new Vector3(x0, y1, z)])
        const loop = new LineLoop(geometry, this.faceHighlightMaterial)
        loop.renderOrder = 1000
        overlay.group.add(loop)
        this.highlightObjects.push(loop)
      }
    }
  }

  private isInSelectedPart(record: PartRecord, partIds: ReadonlySet<string>): boolean {
    for (let r: PartRecord | null = record; r; r = r.parent) if (partIds.has(r.node.id)) return true
    return false
  }

  private clearHighlight(): void {
    for (const object of this.highlightObjects) {
      object.removeFromParent()
      if (object instanceof LineSegments || object instanceof LineLoop) object.geometry.dispose()
    }
    this.highlightObjects = []
  }

  setDebugOptions(options: DebugDisplayOptions): void {
    for (const material of this.materials.values()) material.wireframe = options.wireframe
    for (const helper of this.pivotHelpers) {
      helper.removeFromParent()
      if (helper instanceof AxesHelper) helper.dispose()
    }
    this.pivotHelpers = []
    if (!options.pivots) return
    for (const record of this.parts.values()) {
      if (record.node.origin === 'root') continue
      const axes = new AxesHelper(3)
      const material = axes.material as LineBasicMaterial
      material.depthTest = false
      axes.renderOrder = 998
      record.group.add(axes)
      this.pivotHelpers.push(axes)
    }
  }

  // -------------------------------------------------------------------------

  dispose(): void {
    this.clearHighlight()
    this.setDebugOptions({ wireframe: false, pivots: false })
    this.root.removeFromParent()
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials.values()) material.dispose()
    for (const texture of this.textures.values()) texture.dispose()
    for (const texture of this.emissiveTextures.values()) texture.dispose()
    this.highlightMaterial.dispose()
    this.faceHighlightMaterial.dispose()
    this.parts.clear()
  }

  private buildPart(node: PartNode, parent: PartRecord | null): Group {
    const group = new Group()
    group.name = node.name
    group.userData['partId'] = node.id
    const offset: Vec3 = sub3(node.pivot, parent?.node.pivot ?? [0, 0, 0])
    group.position.set(offset[0], offset[1], offset[2])
    group.rotation.set(MathUtils.degToRad(node.rotation[0]), MathUtils.degToRad(node.rotation[1]), MathUtils.degToRad(node.rotation[2]), 'ZYX')

    const record: PartRecord = { node, parent, group, restPosition: group.position.clone(), restRotation: group.rotation.clone(), meshes: [] }
    this.parts.set(node.id, record)

    const addElement = (element: { id: string; name: string; textureId: string; visible?: boolean }, layer: RenderLayer, cube: CubeDef | null, build: (uvW: number, uvH: number) => GeometryData): void => {
      const texture = this.model.textures.get(element.textureId)
      if (!texture) {
        console.warn(`[Modell] Element „${element.name}“ verweist auf unbekannte Textur „${element.textureId}“ – übersprungen.`)
        return
      }
      const data = build(texture.uvWidth, texture.uvHeight)
      if (data.positions.length === 0) return
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
      geometry.setAttribute('normal', new BufferAttribute(data.normals, 3))
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(data.uvs), 2))
      geometry.setIndex(new BufferAttribute(data.indices, 1))
      this.geometries.push(geometry)

      const mesh = new Mesh(geometry, this.material(element.textureId, layer))
      mesh.name = element.name
      mesh.userData['cubeId'] = element.id
      mesh.userData['partId'] = node.id
      group.add(mesh)
      const meshRecord: MeshRecord = {
        mesh,
        part: record,
        cube,
        elementId: element.id,
        textureId: element.textureId,
        layer,
        elementVisible: element.visible !== false,
        baseUvs: data.uvs,
        uvWidth: texture.uvWidth,
        uvHeight: texture.uvHeight,
        uvOffset: [0, 0]
      }
      record.meshes.push(meshRecord)
      this.meshes.push(meshRecord)
    }
    for (const cube of node.cubes) addElement(cube, cube.layer, cube, (w, h) => buildCubeGeometry(cube, node.pivot, w, h))
    // Polygonnetze können offen sein und nach innen zeigen – daher wie Cutout beidseitig.
    for (const mesh of node.meshes ?? []) addElement(mesh, 'cutout', null, (w, h) => buildMeshGeometry(mesh, node.pivot, w, h))

    for (const child of node.children) group.add(this.buildPart(child, record))
    return group
  }

  private material(textureId: string, layer: RenderLayer): MeshLambertMaterial {
    const key = `${textureId}|${layer}`
    let material = this.materials.get(key)
    if (!material) {
      const cutout = layer === 'cutout'
      const emissive = this.emissiveTextures.get(textureId) ?? null
      material = new MeshLambertMaterial({
        map: this.textures.get(textureId) ?? null,
        // Figuras „_e“-Textur: diese Pixel leuchten unabhängig vom Licht.
        ...(emissive ? { emissiveMap: emissive, emissive: 0xffffff } : {}),
        // Cutout wie Minecrafts Außenschicht: Pixel sind ganz sichtbar oder ganz weg, beidseitig.
        alphaTest: cutout ? 0.1 : 0,
        side: cutout ? DoubleSide : FrontSide
      })
      this.materials.set(key, material)
    }
    return material
  }
}
