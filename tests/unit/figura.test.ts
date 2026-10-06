import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadFiguraAvatar, type FiguraFile } from '@core/figura/figura-avatar'
import { walkParts, type AvatarModel, type PartNode } from '@core/model/avatar-model'
import { buildAvatarModel } from '@core/model/build-avatar'
import { buildCubeGeometry } from '@core/model/cube-geometry'
import { NO_COSMETICS } from '@core/model/cosmetics'
import { partsWithRole } from '@core/pipeline/body'
import { DriverSmoother } from '@core/roles/drivers'
import { suggestExpression } from '@core/roles/expressions'
import { assignmentOf, createDefaultRig, evaluateRig } from '@core/roles/rig'
import { suggestRole } from '@core/roles/roles'
import { buildSignals } from '@core/tracking/signals'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { normalizeSkin } from '@core/skin/skin'

const skin = normalizeSkin(createPlaceholderSkin())
const head = { yaw: 0, pitch: 0, roll: 0 }

function bbPart(name: string, children: PartNode[] = [], extra: Partial<PartNode> = {}): PartNode {
  return { id: `bb.${name}`, name, origin: 'bbmodel', pivot: [0, 24, 0], rotation: [0, 0, 0], visible: true, cubes: [], children, ...extra }
}

function modelWith(parts: PartNode[]): AvatarModel {
  const base = buildAvatarModel({ skin, modelType: 'classic', cosmetics: NO_COSMETICS, figura: null, vanillaHidden: new Set() })
  return { ...base, root: { ...base.root, children: [...base.root.children, ...parts] } }
}

describe('Ausdrucks-Gruppen', () => {
  it.each([
    ['AugenZu', 'blink.both'],
    ['EyesClosed', 'blink.both'],
    ['AugenZwinker', 'wink'],
    ['AugenFroh', 'mouth.smile'],
    ['MundOffen', 'mouth.open'],
    ['MouthHappy', 'mouth.smile'],
    ['MundSchmoll', 'mouth.frown']
  ])('%s → Sichtbarkeit über %s', (name, source) => {
    const suggestion = suggestExpression(name)
    expect(suggestion?.role).toBe(`custom:Ausdruck ${name}`)
    expect(suggestion?.drivers[0]).toMatchObject({ mode: 'visibility', source })
  })

  it('ignoriert normale Teile', () => {
    expect(suggestExpression('Augen')).toBeNull()
    expect(suggestExpression('MundZunge')).toBeNull()
    expect(suggestExpression('OhrL')).toBeNull()
  })

  it('Zöpfe sind Haare', () => {
    expect(suggestRole('Zopf')).toBe('hair')
    expect(suggestRole('ZopfUnten')).toBe('hair')
  })
})

describe('Rollen für Figura-Teile', () => {
  const model = modelWith([
    bbPart('Head', [bbPart('OhrR'), bbPart('AugenZu', [], { visible: false }), bbPart('HeadBand', [], { figuraParent: 'Head' })], { figuraParent: 'Head' }),
    bbPart('Body', [bbPart('Schweif1')], { figuraParent: 'Body' }),
    bbPart('LeftArm', [], { figuraParent: 'LeftArm' })
  ])
  const rig = createDefaultRig(model)

  it('Parent-Types sind fest zugeordnet, der Rest sind Vorschläge', () => {
    expect(assignmentOf(rig, 'bb.Head')).toMatchObject({ role: 'head', confirmed: true })
    expect(assignmentOf(rig, 'bb.Body')).toMatchObject({ role: 'body', confirmed: true })
    expect(assignmentOf(rig, 'bb.LeftArm')).toMatchObject({ role: 'leftArm', confirmed: true })
    expect(assignmentOf(rig, 'bb.OhrR')).toMatchObject({ role: 'rightEar', confirmed: false })
    expect(assignmentOf(rig, 'bb.Schweif1')).toMatchObject({ role: 'tail', confirmed: false })
    expect(assignmentOf(rig, 'bb.AugenZu')).toMatchObject({ role: 'custom:Ausdruck AugenZu', confirmed: false })
  })

  it('mehrere Teile pro Rolle, verschachtelte zählen nur einmal', () => {
    expect(partsWithRole(rig, model, 'head').sort()).toEqual(['bb.Head', 'vanilla.head'])
    expect(partsWithRole(rig, model, 'leftArm').sort()).toEqual(['bb.LeftArm', 'vanilla.leftArm'])
  })

  it('Sichtbarkeits-Treiber blendet ausgeblendete Varianten ein', () => {
    const confirmed = { ...rig, assignments: rig.assignments.map((a) => ({ ...a, confirmed: true })) }
    const smoother = new DriverSmoother()
    const open = buildSignals({ eyeBlinkLeft: 0, eyeBlinkRight: 0 }, head)
    const closed = buildSignals({ eyeBlinkLeft: 1, eyeBlinkRight: 1 }, head)
    const wink = buildSignals({ eyeBlinkLeft: 1, eyeBlinkRight: 0 }, head)
    expect(closed['blink.both']).toBe(1)
    expect(wink['wink']).toBe(1)
    expect(wink['blink.both']).toBe(0)
    // ohne Glättung prüfen
    const noSmoothing = { ...confirmed, assignments: confirmed.assignments.map((a) => ({ ...a, drivers: a.drivers.map((d) => ({ ...d, smoothing: 0 })) })) }
    expect(evaluateRig(noSmoothing, open, 1 / 30, smoother).pose.get('bb.AugenZu')).toMatchObject({ visible: false, shown: false })
    expect(evaluateRig(noSmoothing, closed, 1 / 30, smoother).pose.get('bb.AugenZu')).toMatchObject({ visible: true, shown: true })
  })
})

// ---------------------------------------------------------------------------
// Smoke-Test mit echten Avataren (liegen nur lokal vor, nicht im Repository)

const FIXTURES = join(__dirname, '..', 'fixtures', 'user-avatars')
const avatars = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((name) => statSync(join(FIXTURES, name)).isDirectory()) : []

function readFolder(dir: string): FiguraFile[] {
  const files: FiguraFile[] = []
  const visit = (d: string): void => {
    for (const name of readdirSync(d)) {
      const full = join(d, name)
      if (statSync(full).isDirectory()) visit(full)
      else files.push({ path: relative(dir, full).split(sep).join('/'), data: new Uint8Array(readFileSync(full)) })
    }
  }
  visit(dir)
  return files
}

describe.skipIf(avatars.length === 0)('echte Figura-Avatare', () => {
  it.each(avatars)('%s lädt ohne Fehler und ergibt sinnvolle Rollen', async (name) => {
    const avatar = await loadFiguraAvatar(name, readFolder(join(FIXTURES, name)))
    expect(avatar.models.length).toBeGreaterThan(0)
    expect(avatar.warnings.filter((w) => w.includes('konnte nicht gelesen'))).toEqual([])
    expect(avatar.warnings.filter((w) => w.includes('Textur'))).toEqual([])

    const model = buildAvatarModel({ skin, modelType: 'classic', cosmetics: NO_COSMETICS, figura: avatar, vanillaHidden: avatar.hiddenVanilla })
    // Alle Würfel ergeben endliche Geometrie
    walkParts(model.root, (part) => {
      for (const cube of part.cubes) {
        const texture = model.textures.get(cube.textureId)
        expect(texture, cube.id).toBeDefined()
        const geometry = buildCubeGeometry(cube, part.pivot, texture!.uvWidth, texture!.uvHeight)
        expect(Array.from(geometry.positions).every(Number.isFinite), cube.id).toBe(true)
        expect(Array.from(geometry.uvs).every(Number.isFinite), cube.id).toBe(true)
      }
    })

    const rig = createDefaultRig(model)
    const figuraHeads = partsWithRole(rig, model, 'head').filter((id) => id.startsWith('figura.'))
    expect(figuraHeads.length).toBeGreaterThan(0)
    const roles = new Set(rig.assignments.map((a) => a.role))
    // Alle drei Test-Avatare haben Ohren
    expect(roles.has('leftEar') || roles.has('rightEar')).toBe(true)
  })
})
