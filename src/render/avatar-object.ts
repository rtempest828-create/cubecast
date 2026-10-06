import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Group,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  type DataTexture
} from 'three'
import { walkParts, type AvatarModel, type PartNode, type PartOrigin, type RenderLayer } from '../core/model/avatar-model'
import { buildCubeGeometry } from '../core/model/cube-geometry'
import { sub3, type Vec3 } from '../core/math/vec'
import { createPixelTexture } from './pixel-texture'

/**
 * Three.js-Abbild eines `AvatarModel`. Jedes Teil wird eine `Group` am Drehpunkt,
 * damit sich später Rotationen aus Tracking, Animationen und Lua direkt anwenden lassen.
 */
export class AvatarObject {
  readonly root = new Group()
  private readonly partGroups = new Map<string, Group>()
  private readonly geometries: BufferGeometry[] = []
  private readonly materials = new Map<string, MeshLambertMaterial>()
  private readonly textures = new Map<string, DataTexture>()

  constructor(private readonly model: AvatarModel) {
    for (const def of model.textures.values()) this.textures.set(def.id, createPixelTexture(def.image))
    this.root.name = 'avatar'
    this.root.add(this.buildPart(model.root, [0, 0, 0]))
  }

  /** Three.js-Gruppe eines Teils (für Transformationen). */
  getPartObject(id: string): Group | undefined {
    return this.partGroups.get(id)
  }

  /** Blendet alle Teile einer Herkunft ein/aus (z. B. die gesamte Außenschicht). */
  setOriginVisible(origin: PartOrigin, visible: boolean): void {
    walkParts(this.model.root, (part) => {
      if (part.origin !== origin) return
      const group = this.partGroups.get(part.id)
      if (group) group.visible = visible && part.visible
    })
  }

  dispose(): void {
    this.root.removeFromParent()
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials.values()) material.dispose()
    for (const texture of this.textures.values()) texture.dispose()
    this.partGroups.clear()
  }

  private buildPart(part: PartNode, parentPivot: Vec3): Group {
    const group = new Group()
    group.name = part.name
    group.userData['partId'] = part.id
    const offset = sub3(part.pivot, parentPivot)
    group.position.set(offset[0], offset[1], offset[2])
    group.rotation.set(
      MathUtils.degToRad(part.rotation[0]),
      MathUtils.degToRad(part.rotation[1]),
      MathUtils.degToRad(part.rotation[2]),
      'ZYX'
    )
    group.visible = part.visible

    for (const cube of part.cubes) {
      const texture = this.model.textures.get(cube.textureId)
      if (!texture) {
        console.warn(`[Modell] Würfel „${cube.name}“ verweist auf unbekannte Textur „${cube.textureId}“ – übersprungen.`)
        continue
      }
      const data = buildCubeGeometry(cube, part.pivot, texture.uvWidth, texture.uvHeight)
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
      geometry.setAttribute('normal', new BufferAttribute(data.normals, 3))
      geometry.setAttribute('uv', new BufferAttribute(data.uvs, 2))
      geometry.setIndex(new BufferAttribute(data.indices, 1))
      this.geometries.push(geometry)

      const mesh = new Mesh(geometry, this.material(cube.textureId, cube.layer))
      mesh.name = cube.name
      mesh.userData['cubeId'] = cube.id
      mesh.userData['partId'] = part.id
      group.add(mesh)
    }

    for (const child of part.children) group.add(this.buildPart(child, part.pivot))
    this.partGroups.set(part.id, group)
    return group
  }

  private material(textureId: string, layer: RenderLayer): MeshLambertMaterial {
    const key = `${textureId}|${layer}`
    let material = this.materials.get(key)
    if (!material) {
      const cutout = layer === 'cutout'
      material = new MeshLambertMaterial({
        map: this.textures.get(textureId) ?? null,
        // Cutout wie Minecrafts Außenschicht: Pixel sind ganz sichtbar oder ganz weg, beidseitig.
        alphaTest: cutout ? 0.1 : 0,
        side: cutout ? DoubleSide : FrontSide
      })
      this.materials.set(key, material)
    }
    return material
  }
}
