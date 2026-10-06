import { describe, expect, it } from 'vitest'
import { OneEuroFilter, oneEuroParamsFromSliders } from '@core/tracking/one-euro'

/** Deterministisches Rauschen (kein Math.random, damit Tests reproduzierbar sind). */
function noise(i: number): number {
  return Math.sin(i * 12.9898) * 43758.5453 - Math.floor(Math.sin(i * 12.9898) * 43758.5453) - 0.5
}

function run(filter: OneEuroFilter, values: (i: number) => number, frames: number, fps = 30): number[] {
  const out: number[] = []
  for (let i = 0; i < frames; i++) out.push(filter.filter(values(i), i / fps))
  return out
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values)
}

describe('OneEuroFilter', () => {
  it('gibt den ersten Wert unverändert zurück und bleibt bei konstantem Signal stehen', () => {
    const filter = new OneEuroFilter(oneEuroParamsFromSliders(0.5, 0.5))
    const out = run(filter, () => 12, 30)
    expect(out[0]).toBe(12)
    expect(out.at(-1)).toBeCloseTo(12, 10)
  })

  it('dämpft Zittern um mehr als die Hälfte', () => {
    const filter = new OneEuroFilter(oneEuroParamsFromSliders(0.5, 0.5))
    const raw = (i: number): number => 2 * noise(i)
    const out = run(filter, raw, 120).slice(30)
    const rawValues = Array.from({ length: 90 }, (_, i) => raw(i + 30))
    expect(spread(out)).toBeLessThan(spread(rawValues) / 2)
  })

  it('stärkere Glättung = ruhiger', () => {
    const calm = run(new OneEuroFilter(oneEuroParamsFromSliders(0.9, 0)), (i) => noise(i), 120).slice(30)
    const nervous = run(new OneEuroFilter(oneEuroParamsFromSliders(0.1, 0)), (i) => noise(i), 120).slice(30)
    expect(spread(calm)).toBeLessThan(spread(nervous))
  })

  it('höhere Reaktion folgt einem schnellen Sprung schneller', () => {
    const step = (i: number): number => (i < 10 ? 0 : 40)
    const slow = run(new OneEuroFilter(oneEuroParamsFromSliders(0.8, 0)), step, 15)
    const fast = run(new OneEuroFilter(oneEuroParamsFromSliders(0.8, 1)), step, 15)
    expect(fast[12]!).toBeGreaterThan(slow[12]! + 5)
  })

  it('ignoriert Werte ohne Zeitfortschritt', () => {
    const filter = new OneEuroFilter(oneEuroParamsFromSliders(0.5, 0.5))
    filter.filter(1, 0)
    expect(filter.filter(100, 0)).toBe(1)
  })

  it('Regler werden auf sinnvolle Parameter abgebildet', () => {
    expect(oneEuroParamsFromSliders(0, 0).minCutoff).toBeCloseTo(4)
    expect(oneEuroParamsFromSliders(1, 0).minCutoff).toBeCloseTo(0.2)
    expect(oneEuroParamsFromSliders(0.5, 0).beta).toBe(0)
    expect(oneEuroParamsFromSliders(0.5, 1).beta).toBeCloseTo(0.05)
    expect(oneEuroParamsFromSliders(5, -1)).toEqual(oneEuroParamsFromSliders(1, 0))
  })
})
