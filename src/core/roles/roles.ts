import { createDriver, type DriverConfig } from './drivers'

/** Eingebaute Rollen; eigene Rollen haben die Form `custom:<Name>`. */
export const BUILTIN_ROLES = [
  'head',
  'body',
  'leftArm',
  'rightArm',
  'leftLeg',
  'rightLeg',
  'leftEye',
  'rightEye',
  'leftPupil',
  'rightPupil',
  'leftBrow',
  'rightBrow',
  'mouth',
  'upperLip',
  'lowerLip',
  'nose',
  'leftEar',
  'rightEar',
  'tail',
  'hair',
  'wings',
  'accessory'
] as const

export type BuiltinRole = (typeof BUILTIN_ROLES)[number]
export type RoleId = BuiltinRole | `custom:${string}`

const BUILTIN_SET = new Set<string>(BUILTIN_ROLES)

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === 'string' && (BUILTIN_SET.has(value) || /^custom:.{1,60}$/.test(value))
}

export function customRole(name: string): RoleId {
  return `custom:${name.trim().slice(0, 60)}`
}

/** Sinnvolle Start-Treiber für eine Rolle an einem normalen Modellteil. */
export function defaultDriversForRole(role: RoleId): DriverConfig[] {
  switch (role) {
    case 'head':
      return [createDriver('headRotation', { id: 'head' })]
    case 'leftEye':
    case 'rightEye': {
      const side = role === 'leftEye' ? 'left' : 'right'
      return [createDriver('scale', { id: 'blink', source: `blink.${side}`, axis: 'y', outputMin: 1, outputMax: 0.1 })]
    }
    case 'leftPupil':
    case 'rightPupil':
      return [
        createDriver('position', { id: 'gaze-x', source: 'gaze.x', axis: 'x', inputMin: -1, inputMax: 1, outputMin: -0.5, outputMax: 0.5 }),
        createDriver('position', { id: 'gaze-y', source: 'gaze.y', axis: 'y', inputMin: -1, inputMax: 1, outputMin: -0.5, outputMax: 0.5 })
      ]
    case 'leftBrow':
    case 'rightBrow': {
      const side = role === 'leftBrow' ? 'left' : 'right'
      return [createDriver('position', { id: 'brow', source: `brow.${side}`, axis: 'y', inputMin: -1, inputMax: 1, outputMin: -0.5, outputMax: 0.5 })]
    }
    case 'mouth':
      return [createDriver('scale', { id: 'open', source: 'mouth.open', axis: 'y', outputMin: 1, outputMax: 2.5 })]
    case 'lowerLip':
      return [createDriver('position', { id: 'open', source: 'mouth.open', axis: 'y', outputMin: 0, outputMax: -1 })]
    case 'upperLip':
      return [createDriver('position', { id: 'smile', source: 'mouth.smile', axis: 'y', outputMin: 0, outputMax: 0.3 })]
    // Physik: Achsen passend zur typischen Form (Ohren stehen hoch, Schwänze zeigen nach hinten).
    case 'leftEar':
    case 'rightEar':
      return [createDriver('physics', { id: 'physics', physics: { strength: 0.4, damping: 0.35, axes: ['x', 'z'] } })]
    case 'tail':
      return [createDriver('physics', { id: 'physics', physics: { strength: 0.6, damping: 0.3, axes: ['x', 'y'] } })]
    case 'hair':
      return [createDriver('physics', { id: 'physics', physics: { strength: 0.5, damping: 0.4, axes: ['x', 'z'] } })]
    case 'wings':
      return [createDriver('physics', { id: 'physics', physics: { strength: 0.4, damping: 0.4, axes: ['y', 'z'] } })]
    default:
      return []
  }
}

/** Zerlegt einen Teilnamen in Wörter: „LeftEar_01“ → [left, ear, 01], „eyeL“ → [eye, l]. */
export function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

const LEFT_TOKENS = new Set(['left', 'l', 'links', 'lft'])
const RIGHT_TOKENS = new Set(['right', 'r', 'rechts', 'rgt'])

/** Wortanfänge → Rolle. Seitenabhängige Rollen ohne Seite werden nicht vorgeschlagen. */
const KEYWORDS: readonly (readonly [readonly string[], BuiltinRole | 'eye' | 'pupil' | 'brow' | 'ear' | 'arm' | 'leg' | 'lip'])[] = [
  [['pupil', 'pupille', 'iris'], 'pupil'],
  [['brow', 'eyebrow', 'braue', 'augenbraue'], 'brow'],
  [['eye', 'auge', 'augen'], 'eye'],
  [['mouth', 'mund', 'jaw', 'kiefer'], 'mouth'],
  [['lip', 'lippe'], 'lip'],
  [['nose', 'nase', 'snout', 'schnauze'], 'nose'],
  [['ear', 'ohr', 'ohren'], 'ear'],
  [['tail', 'schwanz', 'schweif'], 'tail'],
  [['hair', 'haar', 'haare', 'bangs', 'ponytail', 'fringe'], 'hair'],
  [['wing', 'fluegel'], 'wings'],
  [['head', 'kopf'], 'head'],
  [['body', 'torso', 'koerper', 'chest'], 'body'],
  [['arm'], 'arm'],
  [['leg', 'bein'], 'leg'],
  [['hat', 'hut', 'horn', 'hoerner', 'glasses', 'brille', 'crown', 'krone', 'accessory', 'headset', 'headphones'], 'accessory']
]

function matchesKeyword(token: string, keyword: string): boolean {
  // „ears“, „eyes“, „wings“ (Plural) zulassen; kurze Wörter nur exakt.
  return token === keyword || (keyword.length >= 3 && token === `${keyword}s`)
}

/**
 * Schlägt anhand des Namens eine Rolle vor (z. B. „LeftEar“ → leftEar, „tail2“ → tail).
 * Liefert null, wenn nichts eindeutig passt. Die Vorschläge muss der Nutzer bestätigen.
 */
export function suggestRole(name: string): RoleId | null {
  const tokens = nameTokens(name)
  const side = tokens.some((t) => LEFT_TOKENS.has(t)) ? 'left' : tokens.some((t) => RIGHT_TOKENS.has(t)) ? 'right' : null
  for (const [keywords, kind] of KEYWORDS) {
    if (!tokens.some((token) => keywords.some((keyword) => matchesKeyword(token, keyword)))) continue
    switch (kind) {
      case 'eye':
        return side ? (`${side}Eye` as RoleId) : null
      case 'pupil':
        return side ? (`${side}Pupil` as RoleId) : null
      case 'brow':
        return side ? (`${side}Brow` as RoleId) : null
      case 'ear':
        return side ? (`${side}Ear` as RoleId) : null
      case 'arm':
        return side ? (`${side}Arm` as RoleId) : null
      case 'leg':
        return side ? (`${side}Leg` as RoleId) : null
      case 'lip':
        return tokens.some((t) => ['upper', 'top', 'ober'].includes(t)) ? 'upperLip' : tokens.some((t) => ['lower', 'bottom', 'unter'].includes(t)) ? 'lowerLip' : 'mouth'
      default:
        return kind
    }
  }
  return null
}
