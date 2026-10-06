import { describe, expect, it } from 'vitest'
import { blendshapeIndex, BLENDSHAPE_COUNT, type BlendshapeName } from '@core/tracking/blendshapes'
import { avatarBlendshapes, buildSignals, swapSideName } from '@core/tracking/signals'
import { composeSignals } from '@core/tracking/simulator'
import { ZERO_HEAD_ROTATION } from '@core/tracking/types'

function raw(values: Partial<Record<BlendshapeName, number>>): Float32Array {
  const array = new Float32Array(BLENDSHAPE_COUNT)
  for (const [name, value] of Object.entries(values)) array[blendshapeIndex(name as BlendshapeName)] = value
  return array
}

const noMirror = { mirror: false, swapSides: false, baseline: null }

describe('Signale aus Sicht der Figur', () => {
  it('vertauscht Left/Right in Namen', () => {
    expect(swapSideName('eyeBlinkLeft')).toBe('eyeBlinkRight')
    expect(swapSideName('mouthSmileRight')).toBe('mouthSmileLeft')
    expect(swapSideName('jawOpen')).toBe('jawOpen')
  })

  it('spiegelt Links/Rechts, wenn die Figur ein Spiegelbild ist', () => {
    const input = raw({ eyeBlinkLeft: 1 })
    expect(avatarBlendshapes(input, noMirror)['eyeBlinkLeft']).toBe(1)
    expect(avatarBlendshapes(input, { ...noMirror, mirror: true })['eyeBlinkRight']).toBe(1)
    // Spiegeln + Korrektur heben sich auf
    expect(avatarBlendshapes(input, { ...noMirror, mirror: true, swapSides: true })['eyeBlinkLeft']).toBe(1)
  })

  it('rechnet Ruhewerte heraus (z. B. Mikrofon vor dem Mund)', () => {
    const baseline = raw({ jawOpen: 0.2, mouthSmileLeft: 0.95 })
    const result = avatarBlendshapes(raw({ jawOpen: 0.6, mouthSmileLeft: 0.95 }), { ...noMirror, baseline })
    expect(result['jawOpen']).toBeCloseTo(0.5)
    // Fast volle Ruhewerte werden nicht normiert (sonst springen sie)
    expect(result['mouthSmileLeft']).toBeCloseTo(0.95)
    expect(avatarBlendshapes(raw({ jawOpen: 0.1 }), { ...noMirror, baseline })['jawOpen']).toBe(0)
  })

  it('leitet Blick, Brauen und Mund ab', () => {
    const signals = buildSignals(
      { eyeLookOutLeft: 1, eyeLookInRight: 1, eyeLookUpLeft: 0.4, eyeLookUpRight: 0.4, browInnerUp: 1, browOuterUpLeft: 1, browDownRight: 1, jawOpen: 0.7, mouthFunnel: 0.3, mouthPucker: 0.5 },
      { pitch: 5, yaw: -10, roll: 2 }
    )
    expect(signals['gaze.x']).toBeCloseTo(1)
    expect(signals['gaze.y']).toBeCloseTo(0.4)
    expect(signals['brow.left']).toBeCloseTo(1)
    expect(signals['brow.right']).toBeCloseTo(-0.5)
    expect(signals['mouth.open']).toBeCloseTo(0.7)
    expect(signals['mouth.round']).toBeCloseTo(0.5)
    expect(signals['head.yaw']).toBe(-10)
  })
})

describe('Tracking-Simulator', () => {
  const live = { blendshapes: { jawOpen: 0.8, eyeBlinkLeft: 0.5 }, head: { pitch: 0, yaw: 20, roll: 0 } }

  it('Webcam: nur echte Werte', () => {
    const s = composeSignals(live, { jawOpen: 0.1 }, new Set(['jawOpen']), 'webcam')
    expect(s['jawOpen']).toBeCloseTo(0.8)
    expect(s['head.yaw']).toBe(20)
  })

  it('Manuell: nur Regler, alles andere 0', () => {
    const s = composeSignals(live, { jawOpen: 0.1 }, new Set(), 'manual')
    expect(s['jawOpen']).toBeCloseTo(0.1)
    expect(s['eyeBlinkLeft']).toBe(0)
    expect(s['head.yaw']).toBe(0)
    expect(s['mouth.open']).toBeCloseTo(0.1)
  })

  it('Gemischt: überschriebene Kanäle vom Regler, Rest von der Webcam; abgeleitete Signale folgen', () => {
    const s = composeSignals(live, { jawOpen: 0.1, 'gaze.x': -0.5 }, new Set(['jawOpen', 'gaze.x']), 'mixed')
    expect(s['jawOpen']).toBeCloseTo(0.1)
    expect(s['mouth.open']).toBeCloseTo(0.1)
    expect(s['eyeBlinkLeft']).toBeCloseTo(0.5)
    expect(s['gaze.x']).toBeCloseTo(-0.5)
    expect(s['head.yaw']).toBe(20)
  })

  it('ohne Gesicht liefert die Webcam neutrale Werte', () => {
    const s = composeSignals({ blendshapes: null, head: ZERO_HEAD_ROTATION }, {}, new Set(), 'webcam')
    expect(s['jawOpen']).toBe(0)
    expect(s['blink.left']).toBe(0)
  })
})
