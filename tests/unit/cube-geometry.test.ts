import { describe, expect, it } from 'vitest'
import type { CubeDef, FaceDir } from '@core/model/avatar-model'
import { boxUv } from '@core/model/box-uv'
import { buildCubeGeometry, FACE_NORMALS, UV_INSET_TEXELS, type GeometryData } from '@core/model/cube-geometry'
import { cross3, dot3, sub3, type Vec3 } from '@core/math/vec'

/** Kopf wie im Vanilla-Modell: 8×8×8, Drehpunkt am Hals. */
const HEAD: CubeDef = {
  id: 'head',
  name: 'head',
  from: [-4, 24, -4],
  to: [4, 32, 4],
  inflate: 0,
  textureId: 'skin',
  layer: 'opaque',
  faces: boxUv(0, 0, [8, 8, 8])
}
const PIVOT: Vec3 = [0, 24, 0]

function vertex(data: GeometryData, i: number): { pos: Vec3; normal: Vec3; uv: [number, number] } {
  return {
    pos: [data.positions[i * 3]!, data.positions[i * 3 + 1]!, data.positions[i * 3 + 2]!],
    normal: [data.normals[i * 3]!, data.normals[i * 3 + 1]!, data.normals[i * 3 + 2]!],
    uv: [data.uvs[i * 2]! * 64, data.uvs[i * 2 + 1]! * 64]
  }
}

/** UV (in Texeln) des Eckpunkts einer Seite an Position `pos`. */
function uvAt(data: GeometryData, dir: FaceDir, pos: Vec3): [number, number] {
  const count = data.positions.length / 3
  for (let i = 0; i < count; i++) {
    const v = vertex(data, i)
    if (v.normal.every((n, k) => n === FACE_NORMALS[dir][k]) && v.pos.every((p, k) => Math.abs(p - pos[k]!) < 1e-6)) {
      return [Math.round(v.uv[0] * 100) / 100, Math.round(v.uv[1] * 100) / 100]
    }
  }
  throw new Error(`Kein Eckpunkt für ${dir} bei ${pos.join(',')}`)
}

describe('buildCubeGeometry (Minecraft-UV-Layout)', () => {
  const data = buildCubeGeometry(HEAD, PIVOT, 64, 64)

  it('erzeugt 6 Seiten mit je 4 Ecken und 2 Dreiecken', () => {
    expect(data.positions.length / 3).toBe(24)
    expect(data.indices.length).toBe(36)
  })

  it('legt das Gesicht (8,8)–(16,16) richtig herum auf die Vorderseite (+Z)', () => {
    // Von vorne gesehen: oben links = (−X, oben). Kleiner Inset (0,01 Texel) wird gerundet.
    expect(uvAt(data, '+z', [-4, 8, 4])).toEqual([8.01, 8.01])
    expect(uvAt(data, '+z', [4, 8, 4])).toEqual([15.99, 8.01])
    expect(uvAt(data, '+z', [-4, 0, 4])).toEqual([8.01, 15.99])
  })

  it('rechte Kopfseite (−X) grenzt an die Vorderseite', () => {
    // Rechte Seite (0..8): ihr rechter Texturrand liegt vorne (+Z).
    expect(uvAt(data, '-x', [-4, 8, 4])).toEqual([7.99, 8.01])
    expect(uvAt(data, '-x', [-4, 8, -4])).toEqual([0.01, 8.01])
  })

  it('linke Seite (+X) und Rückseite (−Z) liegen in der richtigen Reihenfolge', () => {
    expect(uvAt(data, '+x', [4, 8, 4])).toEqual([16.01, 8.01]) // links: linker Rand vorne
    expect(uvAt(data, '-z', [4, 8, -4])).toEqual([24.01, 8.01]) // hinten: linker Rand bei +X
  })

  it('Ober- und Unterseite haben die Minecraft-Ausrichtung (oberer Texturrand hinten)', () => {
    expect(uvAt(data, '+y', [-4, 8, -4])).toEqual([8.01, 0.01])
    expect(uvAt(data, '+y', [-4, 8, 4])).toEqual([8.01, 7.99])
    expect(uvAt(data, '-y', [-4, 0, -4])).toEqual([16.01, 0.01])
    expect(uvAt(data, '-y', [4, 0, 4])).toEqual([23.99, 7.99])
  })

  it('alle Dreiecke zeigen nach außen (gegen den Uhrzeigersinn von außen)', () => {
    for (let t = 0; t < data.indices.length; t += 3) {
      const a = vertex(data, data.indices[t]!)
      const b = vertex(data, data.indices[t + 1]!)
      const c = vertex(data, data.indices[t + 2]!)
      const faceNormal = cross3(sub3(b.pos, a.pos), sub3(c.pos, a.pos))
      expect(dot3(faceNormal, a.normal)).toBeGreaterThan(0)
    }
  })

  it('Vergrößerung (inflate) ändert die Größe, nicht die UVs', () => {
    const inflated = buildCubeGeometry({ ...HEAD, inflate: 0.5 }, PIVOT, 64, 64)
    expect(uvAt(inflated, '+z', [-4.5, 8.5, 4.5])).toEqual([8.01, 8.01])
  })

  it('lässt fehlende Seiten weg', () => {
    const { faces } = HEAD
    const partial = buildCubeGeometry({ ...HEAD, faces: { '+z': faces['+z'], '-z': faces['-z'] } }, PIVOT, 64, 64)
    expect(partial.positions.length / 3).toBe(8)
  })

  it('verschiebt UVs bei gespiegelten Seiten trotzdem nach innen', () => {
    const mirrored = buildCubeGeometry({ ...HEAD, faces: { '+z': { u0: 16, v0: 8, u1: 8, v1: 16 } } }, PIVOT, 64, 64)
    const us = Array.from({ length: 4 }, (_, i) => mirrored.uvs[i * 2]! * 64)
    expect(Math.max(...us)).toBeCloseTo(16 - UV_INSET_TEXELS)
    expect(Math.min(...us)).toBeCloseTo(8 + UV_INSET_TEXELS)
  })
})
