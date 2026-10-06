import type { LipSyncValues } from './signals'

/**
 * Lip-Sync aus dem Mikrofon (reine Rechenlogik, die Audio-Aufnahme liegt im Renderer).
 *
 * - Lautstärke: RMS des Signals in dB, über eine Rauschsperre auf 0…1 abgebildet.
 * - „Rund“ (O/U): Bei dunklen Vokalen liegt viel Energie im tiefen Bereich (≈150–700 Hz)
 *   im Verhältnis zum mittleren Bereich (≈700–2500 Hz). Das ist eine grobe, aber
 *   robuste Schätzung ohne Spracherkennung.
 */
export interface LipSyncSettings {
  /** Verstärkung (1 = unverändert). */
  readonly gain: number
  /** Rauschsperre in dBFS: leiser gilt als Stille. */
  readonly gateDb: number
}

export const DEFAULT_LIPSYNC_SETTINGS: LipSyncSettings = { gain: 1.5, gateDb: -50 }

/** Dynamikbereich über der Rauschsperre, der auf 0…1 abgebildet wird (dB). */
const RANGE_DB = 30

export function rmsDb(samples: Float32Array): number {
  let sum = 0
  for (const s of samples) sum += s * s
  const rms = Math.sqrt(sum / Math.max(1, samples.length))
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity
}

/** Lautstärke 0…1 aus dem Pegel in dB. */
export function levelFromDb(db: number, settings: LipSyncSettings): number {
  if (!Number.isFinite(db)) return 0
  const boosted = db + 20 * Math.log10(Math.max(0.01, settings.gain))
  return Math.max(0, Math.min(1, (boosted - settings.gateDb) / RANGE_DB))
}

/**
 * Rundheit 0…1 aus einem Betragsspektrum in dB (wie `AnalyserNode.getFloatFrequencyData`).
 * `binHz` = Frequenzbreite eines Eintrags.
 */
export function roundnessFromSpectrum(spectrumDb: Float32Array, binHz: number): number {
  const energy = (from: number, to: number): number => {
    let sum = 0
    const start = Math.max(0, Math.floor(from / binHz))
    const end = Math.min(spectrumDb.length - 1, Math.ceil(to / binHz))
    for (let i = start; i <= end; i++) {
      const v = spectrumDb[i]!
      if (Number.isFinite(v)) sum += 10 ** (v / 10)
    }
    return sum
  }
  const low = energy(150, 700)
  const mid = energy(700, 2500)
  if (low + mid <= 0) return 0
  const ratio = low / Math.max(1e-12, mid)
  // Ratio ≈ 1,5 → offener Vokal (A/E), ≥ 4 → dunkel (O/U)
  return Math.max(0, Math.min(1, (ratio - 1.5) / 2.5))
}

/** Hüllkurve: schnell öffnen, langsamer schließen – wirkt natürlicher beim Sprechen. */
export class LipSyncEnvelope {
  private level = 0
  private round = 0

  update(target: LipSyncValues, dtSec: number): LipSyncValues {
    const attack = 1 - Math.exp(-dtSec / 0.03)
    const release = 1 - Math.exp(-dtSec / 0.12)
    this.level += (target.level - this.level) * (target.level > this.level ? attack : release)
    this.round += (target.round - this.round) * release
    return { level: this.level, round: this.round }
  }
}
