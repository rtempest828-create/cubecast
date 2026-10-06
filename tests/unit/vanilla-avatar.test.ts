import { describe, expect, it } from 'vitest'
import { findPart, walkParts, type PartNode } from '@core/model/avatar-model'
import { buildVanillaAvatar } from '@core/model/vanilla-avatar'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { normalizeSkin } from '@core/skin/skin'

const skin = normalizeSkin(createPlaceholderSkin())

function part(root: PartNode, id: string): PartNode {
  const found = findPart(root, id)
  if (!found) throw new Error(`Teil ${id} fehlt`)
  return found
}

describe('buildVanillaAvatar', () => {
  it('enthält sechs Körperteile mit je einer Außenschicht', () => {
    const { root } = buildVanillaAvatar(skin, 'classic')
    expect(root.children.map((p) => p.name)).toEqual(['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'])
    const layers: string[] = []
    walkParts(root, (p) => {
      if (p.origin === 'vanilla-layer') layers.push(p.name)
    })
    expect(layers).toEqual(['hat', 'jacket', 'rightSleeve', 'leftSleeve', 'rightPants', 'leftPants'])
  })

  it('Classic-Arme sind 4 px, Slim-Arme 3 px breit und sitzen 0,5 px tiefer', () => {
    const classic = buildVanillaAvatar(skin, 'classic').root
    const slim = buildVanillaAvatar(skin, 'slim').root
    const width = (p: PartNode): number => p.cubes[0]!.to[0] - p.cubes[0]!.from[0]
    expect(width(part(classic, 'vanilla.rightArm'))).toBe(4)
    expect(width(part(slim, 'vanilla.rightArm'))).toBe(3)
    expect(width(part(slim, 'vanilla.leftArm'))).toBe(3)
    expect(part(classic, 'vanilla.rightArm').pivot[1]).toBe(22)
    expect(part(slim, 'vanilla.rightArm').pivot[1]).toBe(21.5)
    // Arme liegen außen am Körper an (Körper reicht von −4 bis 4).
    expect(part(slim, 'vanilla.rightArm').cubes[0]!.to[0]).toBe(-4)
    expect(part(slim, 'vanilla.leftArm').cubes[0]!.from[0]).toBe(4)
  })

  it('Slim-Arme nutzen das 3-px-UV-Layout', () => {
    const slim = buildVanillaAvatar(skin, 'slim').root
    const faces = part(slim, 'vanilla.rightArm').cubes[0]!.faces
    expect(faces['+z']).toEqual({ u0: 44, v0: 20, u1: 47, v1: 32 })
    expect(faces['-z']).toEqual({ u0: 51, v0: 20, u1: 54, v1: 32 })
  })

  it('Außenschicht ist vergrößert (Hut 0,5, Rest 0,25) und im Cutout-Modus', () => {
    const { root } = buildVanillaAvatar(skin, 'classic')
    expect(part(root, 'vanilla.hat').cubes[0]!.inflate).toBe(0.5)
    expect(part(root, 'vanilla.jacket').cubes[0]!.inflate).toBe(0.25)
    expect(part(root, 'vanilla.hat').cubes[0]!.layer).toBe('cutout')
    expect(part(root, 'vanilla.head').cubes[0]!.layer).toBe('opaque')
  })

  it('Gesamthöhe ist 32 px, Füße bei y = 0', () => {
    const { root } = buildVanillaAvatar(skin, 'classic')
    let minY = Infinity
    let maxY = -Infinity
    walkParts(root, (p) => {
      if (p.origin !== 'vanilla') return
      for (const c of p.cubes) {
        minY = Math.min(minY, c.from[1])
        maxY = Math.max(maxY, c.to[1])
      }
    })
    expect(minY).toBe(0)
    expect(maxY).toBe(32)
  })
})
