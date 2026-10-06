import { createDriver, type DriverConfig } from './drivers'
import { customRole, nameTokens, type RoleId } from './roles'

/**
 * Ausdrucks-Gruppen: Viele Figura-Avatare haben fertige Varianten für Augen und Mund
 * („AugenZu“, „EyesHappy“, „MundOffen“ …), die ihr Lua-Skript ein- und ausblendet.
 * Bis die Lua-Laufzeit kommt (M5c) – und für Avatare ohne Skript – schlagen wir dafür
 * Sichtbarkeits-Treiber vor, die die Variante bei passender Mimik einblenden.
 */
export interface ExpressionSuggestion {
  readonly role: RoleId
  readonly drivers: readonly DriverConfig[]
}

interface Variant {
  readonly words: readonly string[]
  readonly driver: () => DriverConfig
}

const show = (source: string, threshold: number, range?: { inputMin: number; inputMax: number }): (() => DriverConfig) => () =>
  createDriver('visibility', { id: 'show', source, thresholds: [threshold], smoothing: 0.3, ...range })

const EYE_WORDS = ['eye', 'eyes', 'auge', 'augen']
const MOUTH_WORDS = ['mouth', 'mund']

const EYE_VARIANTS: readonly Variant[] = [
  { words: ['zu', 'closed', 'close', 'shut', 'blink', 'geschlossen', 'sleep', 'schlaf'], driver: show('blink.both', 0.5) },
  { words: ['zwinker', 'zwinkern', 'wink'], driver: show('wink', 0.5) },
  { words: ['froh', 'happy', 'smile', 'laecheln', 'gluecklich', 'joy'], driver: show('mouth.smile', 0.5) },
  // „Autsch“-Augen (><) bei gesenkten Brauen
  { words: ['au', 'autsch', 'hurt', 'pain', 'ouch', 'angry', 'wut', 'wuetend', 'sauer'], driver: show('brow.left', 0.5, { inputMin: 0, inputMax: -0.8 }) },
  { words: ['wide', 'shock', 'surprised', 'ueberrascht'], driver: show('brow.left', 0.6, { inputMin: 0, inputMax: 0.8 }) },
  { words: ['fokus', 'focus', 'squint', 'skeptisch', 'schmal'], driver: show('eyeSquintLeft', 0.4) }
]

const MOUTH_VARIANTS: readonly Variant[] = [
  { words: ['offen', 'open', 'auf', 'talk', 'reden', 'sprechen'], driver: show('mouth.open', 0.3) },
  { words: ['froh', 'happy', 'smile', 'laecheln', 'grins', 'grin', 'lachen', 'laugh'], driver: show('mouth.smile', 0.5) },
  { words: ['schmoll', 'pout', 'frown', 'traurig', 'sad', 'ernst', 'serious'], driver: show('mouth.frown', 0.4) },
  // Zähne zeigen (Knurren/Fauchen): Oberlippe hoch bzw. Nase rümpfen
  { words: ['knurr', 'knurren', 'fauch', 'fauchen', 'growl', 'hiss', 'snarl'], driver: show('noseSneerLeft', 0.4) },
  { words: ['o', 'rund', 'round', 'ooh', 'oh'], driver: show('mouth.round', 0.5) }
]

const has = (tokens: readonly string[], words: readonly string[]): boolean => tokens.some((t) => words.includes(t))

/** Vorschlag für eine Ausdrucks-Gruppe oder null, wenn der Name nicht danach aussieht. */
export function suggestExpression(name: string): ExpressionSuggestion | null {
  const tokens = nameTokens(name)
  const variants = has(tokens, EYE_WORDS) ? EYE_VARIANTS : has(tokens, MOUTH_WORDS) ? MOUTH_VARIANTS : null
  if (!variants) return null
  const variant = variants.find((v) => has(tokens, v.words))
  return variant ? { role: customRole(`Ausdruck ${name}`), drivers: [variant.driver()] } : null
}
