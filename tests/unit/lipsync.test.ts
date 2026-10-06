import { describe, expect, it } from 'vitest'
import { DEFAULT_LIPSYNC_SETTINGS, levelFromDb, LipSyncEnvelope, rmsDb, roundnessFromSpectrum } from '@core/tracking/lipsync'
import { buildSignals } from '@core/tracking/signals'
import { composeSignals } from '@core/tracking/simulator'

const settings = { gain: 1, gateDb: -50 }

function sine(amplitude: number, length = 1024): Float32Array {
  return Float32Array.from({ length }, (_, i) => amplitude * Math.sin((2 * Math.PI * i) / 32))
}

/** Spektrum in dB mit Energie an den angegebenen Frequenzen. */
function spectrum(peaks: Record<number, number>, binHz = 23.4, bins = 512): Float32Array {
  const data = new Float32Array(bins).fill(-120)
  for (const [hz, db] of Object.entries(peaks)) data[Math.round(Number(hz) / binHz)] = db
  return data
}

describe('Lip-Sync', () => {
  it('misst den Pegel in dB', () => {
    expect(rmsDb(sine(1))).toBeCloseTo(-3.01, 1)
    expect(rmsDb(new Float32Array(16))).toBe(-Infinity)
  })

  it('Rauschsperre und Verstärkung', () => {
    expect(levelFromDb(-60, settings)).toBe(0)
    expect(levelFromDb(-35, settings)).toBeCloseTo(0.5)
    expect(levelFromDb(-10, settings)).toBe(1)
    expect(levelFromDb(-41, { gain: 2, gateDb: -50 })).toBeGreaterThan(levelFromDb(-41, settings))
    expect(levelFromDb(-Infinity, DEFAULT_LIPSYNC_SETTINGS)).toBe(0)
  })

  it('dunkle Vokale (viel Tiefe) gelten als rund, helle nicht', () => {
    expect(roundnessFromSpectrum(spectrum({ 400: -20, 1200: -45 }), 23.4)).toBeGreaterThan(0.8)
    expect(roundnessFromSpectrum(spectrum({ 400: -30, 1200: -25, 1800: -25 }), 23.4)).toBe(0)
    expect(roundnessFromSpectrum(spectrum({}), 23.4)).toBeLessThan(0.1)
  })

  it('Hüllkurve öffnet schnell und schließt langsamer', () => {
    const envelope = new LipSyncEnvelope()
    const up = envelope.update({ level: 1, round: 0 }, 0.03)
    expect(up.level).toBeGreaterThan(0.5)
    const down = envelope.update({ level: 0, round: 0 }, 0.03)
    expect(down.level).toBeGreaterThan(0.4)
  })

  it('öffnet den Mund über die Lautstärke, auch ohne Kamera', () => {
    const signals = composeSignals({ blendshapes: null, head: { pitch: 0, yaw: 0, roll: 0 }, audio: { level: 0.75, round: 1 } }, {}, new Set(), 'webcam')
    expect(signals['mouth.open']).toBeCloseTo(0.6)
    expect(signals['mouth.round']).toBeCloseTo(0.75)
    expect(signals['audio.level']).toBeCloseTo(0.75)
    // Ohne Mikrofon unverändert
    const silent = composeSignals({ blendshapes: { jawOpen: 0.3 }, head: { pitch: 0, yaw: 0, roll: 0 } }, {}, new Set(), 'webcam')
    expect(silent['mouth.open']).toBeCloseTo(0.3)
    expect(buildSignals(null, { pitch: 0, yaw: 0, roll: 0 })['audio.level']).toBe(0)
  })
})
