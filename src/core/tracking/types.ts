/** Ergebnis eines Tracking-Frames, wie es der Worker an die App liefert. */
export interface FaceTrackingResult {
  /** Fortlaufende Nummer; ändert sich nur bei neuen Ergebnissen. */
  readonly frameId: number
  /** Aufnahmezeitpunkt des Kamerabilds (ms, `performance.now()` des Hauptthreads). */
  readonly captureTime: number
  readonly faceFound: boolean
  /** Werte in der Reihenfolge von `BLENDSHAPE_NAMES` oder null ohne Gesicht. */
  readonly blendshapes: Float32Array | null
  /** Gesichtsmatrix (4×4, spaltenweise, Verschiebung in cm) oder null ohne Gesicht. */
  readonly matrix: Float32Array | null
  /** Reine Rechenzeit im Worker (ms). */
  readonly processingMs: number
  /** Arm-relevante Körperpunkte (siehe `POSE_POINTS`) oder null (aus / nicht erkannt). */
  readonly pose?: Float32Array | null
}

/** Kopfrotation in Grad (Euler ZYX): Nicken (x), Drehen (y), Neigen (z). */
export interface HeadRotation {
  readonly pitch: number
  readonly yaw: number
  readonly roll: number
}

export const ZERO_HEAD_ROTATION: HeadRotation = { pitch: 0, yaw: 0, roll: 0 }
