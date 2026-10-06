import type { Signals } from '../tracking/signals'
import type { FaceState } from './face-compose'

export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised'

export const EMOTIONS: readonly Emotion[] = ['neutral', 'happy', 'sad', 'angry', 'surprised']

/**
 * Erkennt eine Grund-Emotion aus den Signalen. Reihenfolge: überrascht, wütend,
 * fröhlich, traurig – so gewinnt ein offener „Wow“-Mund nicht gegen hochgezogene Brauen.
 */
export function detectEmotion(signals: Signals): Emotion {
  const s = (name: string): number => signals[name] ?? 0
  const eyesWide = (s('eyeWideLeft') + s('eyeWideRight')) / 2
  const browsDown = (s('browDownLeft') + s('browDownRight')) / 2
  if (s('browInnerUp') >= 0.5 && (eyesWide >= 0.3 || s('mouth.open') >= 0.4)) return 'surprised'
  if (browsDown >= 0.45) return 'angry'
  if (s('mouth.smile') >= 0.5) return 'happy'
  if (s('mouth.frown') >= 0.4 || (s('browInnerUp') >= 0.4 && s('mouth.frown') >= 0.2 && s('mouth.smile') < 0.1)) return 'sad'
  return 'neutral'
}

/** Verstärkt den Gesichtsausdruck passend zur Emotion. */
export function applyEmotion(state: FaceState, emotion: Emotion): FaceState {
  const mouthIdle = state.mouth === 'closed'
  switch (emotion) {
    case 'happy':
      return mouthIdle ? { ...state, mouth: 'smile' } : state
    case 'sad':
      return { ...state, browTilt: -1, mouth: mouthIdle || state.mouth === 'smile' ? 'frown' : state.mouth }
    case 'angry':
      return { ...state, browTilt: 1, mouth: mouthIdle ? 'frown' : state.mouth }
    case 'surprised':
      // Augen bleiben wie getrackt – bewusstes Blinzeln/Zwinkern soll immer sichtbar sein.
      return {
        ...state,
        brows: { right: Math.max(1, state.brows.right), left: Math.max(1, state.brows.left) },
        mouth: mouthIdle || state.mouth === 'half' ? 'round' : state.mouth
      }
    default:
      return state
  }
}
