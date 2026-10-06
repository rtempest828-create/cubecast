import { describe, expect, it } from 'vitest'
import { createDriver, driverInput, driverOutput, DriverSmoother, frameIndex, mouthFrame } from '@core/roles/drivers'
import { nameTokens, suggestRole } from '@core/roles/roles'

describe('Treiber', () => {
  it('normiert das Signal auf den Eingangsbereich und bildet auf den Ausgang ab', () => {
    const driver = createDriver('rotation', { source: 'mouth.open', inputMin: 0.2, inputMax: 0.8, outputMin: 0, outputMax: 30 })
    expect(driverInput(driver, { 'mouth.open': 0.5 })).toBeCloseTo(0.5)
    expect(driverOutput(driver, 0.5)).toBeCloseTo(15)
    expect(driverInput(driver, { 'mouth.open': 1 })).toBe(1)
    expect(driverInput(driver, { 'mouth.open': 0 })).toBe(0)
    expect(driverInput(driver, {})).toBe(0)
  })

  it('Empfindlichkeit wirkt vor dem Normieren, Invertieren danach', () => {
    const driver = createDriver('scale', { source: 'blink.left', sensitivity: 2, invert: true })
    expect(driverInput(driver, { 'blink.left': 0.25 })).toBeCloseTo(0.5)
    expect(driverInput({ ...driver, invert: false }, { 'blink.left': 0.4 })).toBeCloseTo(0.8)
  })

  it('übernimmt den Wertebereich des Signals (Kopfwinkel ±90°)', () => {
    const driver = createDriver('rotation', { source: 'head.yaw' })
    expect(driver.inputMin).toBe(-90)
    expect(driverInput(driver, { 'head.yaw': 0 })).toBeCloseTo(0.5)
  })

  it('Bildwechsel: Anzahl erreichter Schwellwerte', () => {
    expect(frameIndex(0.1, [0.35, 0.65])).toBe(0)
    expect(frameIndex(0.5, [0.35, 0.65])).toBe(1)
    expect(frameIndex(0.65, [0.35, 0.65])).toBe(2)
  })

  it('Mund-Logik wählt das passende Bild', () => {
    const t = [0.12, 0.35, 0.35, 0.35, 0.35]
    expect(mouthFrame({}, t)).toBe('closed')
    expect(mouthFrame({ 'mouth.open': 0.2 }, t)).toBe('half')
    expect(mouthFrame({ 'mouth.open': 0.6 }, t)).toBe('open')
    expect(mouthFrame({ 'mouth.open': 0.2, 'mouth.round': 0.6 }, t)).toBe('round')
    expect(mouthFrame({ 'mouth.smile': 0.7 }, t)).toBe('smile')
    expect(mouthFrame({ 'mouth.frown': 0.7 }, t)).toBe('frown')
    // Weit offener Mund gewinnt gegen „O“
    expect(mouthFrame({ 'mouth.open': 0.9, 'mouth.round': 0.6 }, t)).toBe('open')
  })

  it('Glättung nähert sich dem Ziel exponentiell an', () => {
    const smoother = new DriverSmoother()
    expect(smoother.smooth('a', 0, 0.5, 0.016)).toBe(0)
    const step = smoother.smooth('a', 1, 0.5, 0.016)
    expect(step).toBeGreaterThan(0)
    expect(step).toBeLessThan(0.3)
    let value = step
    for (let i = 0; i < 120; i++) value = smoother.smooth('a', 1, 0.5, 0.016)
    expect(value).toBeCloseTo(1, 3)
    expect(smoother.smooth('b', 1, 0, 0.016)).toBe(1)
  })
})

describe('Rollen-Vorschläge anhand des Namens', () => {
  it('zerlegt Namen in Wörter', () => {
    expect(nameTokens('LeftEar_01')).toEqual(['left', 'ear', '01'])
    expect(nameTokens('eyeL')).toEqual(['eye', 'l'])
    expect(nameTokens('HEADPiece')).toEqual(['head', 'piece'])
  })

  it.each([
    ['LeftEar', 'leftEar'],
    ['ear_right', 'rightEar'],
    ['Ohr_links', 'leftEar'],
    ['tail', 'tail'],
    ['Tail2', 'tail'],
    ['Schwanz', 'tail'],
    ['eyeL', 'leftEye'],
    ['RightPupil', 'rightPupil'],
    ['leftEyebrow', 'leftBrow'],
    ['Mouth', 'mouth'],
    ['lowerLip', 'lowerLip'],
    ['Hair_back', 'hair'],
    ['wings', 'wings'],
    ['Headset', 'accessory'],
    ['Head', 'head']
  ])('„%s“ → %s', (name, role) => {
    expect(suggestRole(name)).toBe(role)
  })

  it('schlägt nichts vor, wenn die Seite fehlt oder nichts passt', () => {
    expect(suggestRole('ear')).toBeNull()
    expect(suggestRole('eye')).toBeNull()
    expect(suggestRole('cube')).toBeNull()
    // „head“ enthält „ea“, aber kein Wort „ear“
    expect(suggestRole('heard')).toBeNull()
  })
})
