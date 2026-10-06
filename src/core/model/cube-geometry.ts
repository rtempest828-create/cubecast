import { quatFromEulerZYX, quatRotate } from '../math/quat'
import { add3, cross3, dot3, sub3, type Vec3 } from '../math/vec'
import { FACE_DIRS, type CubeDef, type FaceDir, type MeshDef } from './avatar-model'

/** Rohdaten für eine Dreiecksgeometrie (unabhängig von Three.js). */
export interface GeometryData {
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly uvs: Float32Array
  readonly indices: Uint16Array
}

/** Ecken einer Seite: oben links, oben rechts, unten links, unten rechts (in Textur-Ausrichtung). */
export type FaceCorners = readonly [Vec3, Vec3, Vec3, Vec3]

export const FACE_NORMALS: Readonly<Record<FaceDir, Vec3>> = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1]
}

/**
 * Welche Würfelecke zu welcher Textur-Ecke gehört (Minecraft-Konvention):
 * - Seitenflächen: Textur steht aufrecht, von außen betrachtet.
 * - Ober- und Unterseite: oberer Texturrand liegt hinten (−Z), linker Rand bei −X.
 *   Die Unterseite erscheint von unten betrachtet dadurch gespiegelt – genau wie im Spiel.
 */
export function faceCorners(dir: FaceDir, min: Vec3, max: Vec3): FaceCorners {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  switch (dir) {
    case '+z': return [[x0, y1, z1], [x1, y1, z1], [x0, y0, z1], [x1, y0, z1]]
    case '-z': return [[x1, y1, z0], [x0, y1, z0], [x1, y0, z0], [x0, y0, z0]]
    case '-x': return [[x0, y1, z0], [x0, y1, z1], [x0, y0, z0], [x0, y0, z1]]
    case '+x': return [[x1, y1, z1], [x1, y1, z0], [x1, y0, z1], [x1, y0, z0]]
    case '+y': return [[x0, y1, z0], [x1, y1, z0], [x0, y1, z1], [x1, y1, z1]]
    case '-y': return [[x0, y0, z0], [x1, y0, z0], [x0, y0, z1], [x1, y0, z1]]
  }
}

/**
 * UVs werden minimal zur Mitte der Seite hin verschoben, damit beim Multisampling an
 * Kanten nie das Nachbar-Texel gelesen wird (sonst entstehen feine Linien).
 * 0,01 Texel ist optisch unsichtbar.
 */
export const UV_INSET_TEXELS = 0.01

type Corner = readonly [number, number]

/** Verschiebt die vier UV-Ecken minimal zur Mitte (gegen Überbluten benachbarter Texel). */
function insetCorners(corners: readonly [Corner, Corner, Corner, Corner]): Corner[] {
  const cu = corners.reduce((s, c) => s + c[0], 0) / 4
  const cv = corners.reduce((s, c) => s + c[1], 0) / 4
  return corners.map(([u, v]) => [u + Math.sign(cu - u) * UV_INSET_TEXELS, v + Math.sign(cv - v) * UV_INSET_TEXELS] as const)
}

/** Geometrie eines freien Polygonnetzes relativ zu `origin`; Normalen pro Dreieck. */
export function buildMeshGeometry(mesh: MeshDef, origin: Vec3, uvWidth: number, uvHeight: number): GeometryData {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const triangle of mesh.triangles) {
    const [a, b, c] = triangle.positions.map((p) => sub3(p, origin)) as [Vec3, Vec3, Vec3]
    const n = cross3(sub3(b, a), sub3(c, a))
    const length = Math.hypot(n[0], n[1], n[2]) || 1
    const base = positions.length / 3
    ;[a, b, c].forEach((p, i) => {
      positions.push(p[0], p[1], p[2])
      normals.push(n[0] / length, n[1] / length, n[2] / length)
      uvs.push(triangle.uvs[i]![0] / uvWidth, triangle.uvs[i]![1] / uvHeight)
    })
    indices.push(base, base + 1, base + 2)
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint16Array(indices) }
}

/**
 * Erzeugt die Geometrie eines Würfels relativ zu `origin` (dem Drehpunkt seines Teils).
 * `uvWidth`/`uvHeight` ist die Größe des UV-Raums der Textur.
 */
export function buildCubeGeometry(cube: CubeDef, origin: Vec3, uvWidth: number, uvHeight: number): GeometryData {
  const min: Vec3 = [
    Math.min(cube.from[0], cube.to[0]) - cube.inflate - origin[0],
    Math.min(cube.from[1], cube.to[1]) - cube.inflate - origin[1],
    Math.min(cube.from[2], cube.to[2]) - cube.inflate - origin[2]
  ]
  const max: Vec3 = [
    Math.max(cube.from[0], cube.to[0]) + cube.inflate - origin[0],
    Math.max(cube.from[1], cube.to[1]) + cube.inflate - origin[1],
    Math.max(cube.from[2], cube.to[2]) + cube.inflate - origin[2]
  ]

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  // Eigene Würfeldrehung (Blockbench) um den Würfel-Drehpunkt, relativ zum Teil.
  const rotate = cube.rotation && cube.rotation.some((r) => r !== 0) ? quatFromEulerZYX(cube.rotation[0], cube.rotation[1], cube.rotation[2]) : null
  const pivot: Vec3 = cube.origin ? sub3(cube.origin, origin) : [0, 0, 0]

  for (const dir of FACE_DIRS) {
    const uv = cube.faces[dir]
    if (!uv) continue
    const corners = faceCorners(dir, min, max)
    const normal = FACE_NORMALS[dir]

    const cornerUvs = insetCorners(
      uv.corners ?? [
        [uv.u0, uv.v0],
        [uv.u1, uv.v0],
        [uv.u0, uv.v1],
        [uv.u1, uv.v1]
      ]
    ).map(([u, v]) => [u / uvWidth, v / uvHeight] as const)

    const base = positions.length / 3
    corners.forEach((corner, i) => {
      const p = rotate ? add3(quatRotate(rotate, sub3(corner, pivot)), pivot) : corner
      const n = rotate ? quatRotate(rotate, normal) : normal
      positions.push(p[0], p[1], p[2])
      normals.push(n[0], n[1], n[2])
      uvs.push(cornerUvs[i]![0], cornerUvs[i]![1])
    })

    // Dreiecke so anordnen, dass sie von außen gegen den Uhrzeigersinn laufen (sichtbare Seite).
    const [tl, tr, bl] = corners
    const facing = dot3(cross3(sub3(bl, tl), sub3(tr, tl)), normal)
    if (facing >= 0) {
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
    } else {
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices)
  }
}
