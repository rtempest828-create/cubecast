import { parseAnimations, type AnimationClip } from '../animation/clip'
import { parseBbmodel, type ParsedBbmodel } from '../bbmodel/parse-bbmodel'
import { walkParts } from '../model/avatar-model'
import { scanHiddenVanilla, type VanillaId } from './vanilla-scan'

/** Eine Datei aus einem Figura-Avatar-Ordner (Pfad relativ zum Ordner, mit „/“). */
export interface FiguraFile {
  readonly path: string
  readonly data: Uint8Array
}

export interface FiguraScript {
  readonly path: string
  readonly source: string
}

export interface FiguraAvatar {
  readonly name: string
  readonly description: string
  readonly authors: readonly string[]
  /** Akzentfarbe aus `avatar.json` (z. B. „#EEC652“) oder null. */
  readonly color: string | null
  readonly models: readonly ParsedBbmodel[]
  /** Blockbench-Animationen aller Modelle (IDs wie Figuras `animations.<modell>.<name>`). */
  readonly animations: readonly AnimationClip[]
  /** Lua-Skripte (werden ab M5c ausgeführt). */
  readonly scripts: readonly FiguraScript[]
  /** Vanilla-Teile, die die Skripte ausblenden (vorläufige Erkennung bis M5c). */
  readonly hiddenVanilla: ReadonlySet<VanillaId>
  readonly warnings: readonly string[]
}

export const MAX_MODELS = 32

const decoder = new TextDecoder('utf-8')
const text = (data: Uint8Array): string => decoder.decode(data)

function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

/** Verbindet Pfade mit „/“ und löst „.“/„..“ auf; null, wenn der Pfad den Ordner verlässt. */
export function joinPath(base: string, relative: string): string | null {
  const parts = base ? base.split('/') : []
  for (const segment of relative.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (parts.length === 0) return null
      parts.pop()
    } else parts.push(segment)
  }
  return parts.join('/')
}

/**
 * Externe Textur eines Modells suchen: erst relativ zur Modelldatei, dann irgendwo im
 * Avatar mit gleichem Dateinamen (Blockbench speichert teils absolute Pfade).
 */
function findTexture(reference: string, base: string, files: readonly FiguraFile[], byPath: ReadonlyMap<string, FiguraFile>): Uint8Array | null {
  const name = (reference.replace(/\\/g, '/').split('/').pop() ?? reference).toLowerCase()
  const withExtension = name.endsWith('.png') ? name : `${name}.png`
  const relative = /^[a-z]:|^\//i.test(reference) ? null : joinPath(base, reference)
  for (const candidate of [relative, joinPath(base, withExtension)]) {
    const file = candidate ? byPath.get(candidate.toLowerCase()) : undefined
    if (file) return file.data
  }
  return files.find((f) => (f.path.split('/').pop() ?? '').toLowerCase() === withExtension)?.data ?? null
}

/** Figura spricht Modelle als `models.<Pfad>` an: Unterordner mit Punkt, ohne Endung. */
export function modelPathOf(path: string): string {
  return path.replace(/\.bbmodel$/i, '').split('/').join('.')
}

/**
 * Baut einen Avatar aus den Dateien eines Figura-Ordners. Kaputte Modelle werden
 * übersprungen (mit Warnung), damit der Rest trotzdem geladen wird.
 */
export async function loadFiguraAvatar(folderName: string, files: readonly FiguraFile[]): Promise<FiguraAvatar> {
  const warnings: string[] = []
  const byPath = new Map(files.map((f) => [f.path.toLowerCase(), f]))

  // avatar.json ist optional
  let meta: Record<string, unknown> = {}
  const metaFile = byPath.get('avatar.json')
  if (metaFile) {
    try {
      const parsed: unknown = JSON.parse(text(metaFile.data))
      if (typeof parsed === 'object' && parsed !== null) meta = parsed as Record<string, unknown>
    } catch {
      warnings.push('avatar.json ist kein gültiges JSON und wird ignoriert.')
    }
  } else {
    warnings.push('Keine avatar.json gefunden – Ordnername wird als Name verwendet.')
  }

  const modelFiles = files.filter((f) => /\.bbmodel$/i.test(f.path)).sort((a, b) => a.path.localeCompare(b.path))
  if (modelFiles.length === 0) warnings.push('Der Ordner enthält keine .bbmodel-Datei.')
  if (modelFiles.length > MAX_MODELS) warnings.push(`Nur die ersten ${MAX_MODELS} Modelle werden geladen.`)

  const models: ParsedBbmodel[] = []
  const animations: AnimationClip[] = []
  for (const file of modelFiles.slice(0, MAX_MODELS)) {
    const modelPath = modelPathOf(file.path)
    const base = dirname(file.path)
    try {
      const json: unknown = JSON.parse(text(file.data))
      const model = await parseBbmodel(json, {
        idPrefix: `figura.${modelPath}`,
        rootName: modelPath,
        loadExternal: (reference) => findTexture(reference, base, files, byPath)
      })
      models.push(model)
      for (const warning of model.warnings) warnings.push(`${file.path}: ${warning}`)
      const partIdByName = new Map<string, string>()
      walkParts(model.root, (part) => {
        if (!partIdByName.has(part.name)) partIdByName.set(part.name, part.id)
      })
      // Figura wertet Keyframe-Ausdrücke als Lua aus.
      const parsed = parseAnimations(model.animations, { modelPath, partIdByUuid: model.partIdByUuid, partIdByName, dialect: 'lua' })
      animations.push(...parsed.clips)
      for (const warning of parsed.warnings) warnings.push(`${file.path}: ${warning}`)
    } catch (error) {
      warnings.push(`${file.path} konnte nicht gelesen werden: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const scripts = files.filter((f) => /\.lua$/i.test(f.path)).map((f) => ({ path: f.path, source: text(f.data) }))
  if (scripts.length > 0) warnings.push(`${scripts.length} Lua-Skript(e) gefunden – sie werden ab Meilenstein M5c ausgeführt. Bis dahin steuern Rollen und Tracking den Avatar.`)
  const effects = animations.reduce((sum, clip) => sum + clip.effectCount, 0)
  if (effects > 0) warnings.push(`${effects} Timeline-/Sound-/Partikel-Keyframes in Animationen – Timeline-Skripte laufen ab Meilenstein M5c, Sounds und Partikel werden nicht abgespielt.`)

  const str = (key: string): string => (typeof meta[key] === 'string' ? (meta[key] as string) : '')
  return {
    name: str('name') || folderName,
    description: str('description'),
    authors: Array.isArray(meta['authors']) ? meta['authors'].filter((a): a is string => typeof a === 'string') : str('author') ? [str('author')] : [],
    color: /^#[0-9a-f]{6}$/i.test(str('color')) ? str('color') : null,
    models,
    animations,
    scripts,
    hiddenVanilla: scanHiddenVanilla(scripts.map((s) => s.source)),
    warnings
  }
}
