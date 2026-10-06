/**
 * One-Euro-Filter (Casiez et al., 2012): glättet ruhige Bewegungen stark und
 * lässt schnelle Bewegungen fast verzögerungsfrei durch.
 *
 * - `minCutoff` (Hz): Grenzfrequenz im Ruhezustand. Kleiner = glatter, aber träger.
 * - `beta`: Wie stark die Grenzfrequenz mit der Geschwindigkeit steigt. Größer = weniger Verzögerung bei schnellen Bewegungen.
 * - `dCutoff` (Hz): Glättung der Geschwindigkeitsschätzung.
 */
export interface OneEuroParams {
  readonly minCutoff: number
  readonly beta: number
  readonly dCutoff: number
}

function smoothingFactor(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

export class OneEuroFilter {
  private value: number | null = null
  private derivative = 0
  private lastTime: number | null = null

  constructor(private params: OneEuroParams) {}

  setParams(params: OneEuroParams): void {
    this.params = params
  }

  /** Setzt den Zustand, ohne zu springen (z. B. nach verlorenem Tracking). */
  setState(value: number, timeSec: number): void {
    this.value = value
    this.derivative = 0
    this.lastTime = timeSec
  }

  reset(): void {
    this.value = null
    this.derivative = 0
    this.lastTime = null
  }

  filter(input: number, timeSec: number): number {
    if (this.value === null || this.lastTime === null) {
      this.setState(input, timeSec)
      return input
    }
    const dt = timeSec - this.lastTime
    if (dt <= 0) return this.value
    this.lastTime = timeSec

    const rawDerivative = (input - this.value) / dt
    this.derivative += smoothingFactor(this.params.dCutoff, dt) * (rawDerivative - this.derivative)
    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(this.derivative)
    this.value += smoothingFactor(cutoff, dt) * (input - this.value)
    return this.value
  }
}

/**
 * Übersetzt die zwei UI-Regler (je 0…1) in Filterparameter:
 * - `smoothing`: 0 = kaum Glättung (4 Hz), 1 = sehr glatt (0,2 Hz), logarithmisch
 * - `reaction`: 0 = keine Beschleunigung, 1 = schnelle Bewegungen kommen sofort durch
 * Ausgelegt für Winkel in Grad (Geschwindigkeiten um 100 °/s).
 */
export function oneEuroParamsFromSliders(smoothing: number, reaction: number): OneEuroParams {
  const s = Math.max(0, Math.min(1, smoothing))
  const r = Math.max(0, Math.min(1, reaction))
  return {
    minCutoff: 4 * Math.pow(0.05, s),
    beta: r === 0 ? 0 : 0.0005 * Math.pow(100, r),
    dCutoff: 1
  }
}
