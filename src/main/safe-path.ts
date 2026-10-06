import { resolve, sep } from 'node:path'

/**
 * Löst einen URL-Pfad innerhalb von `root` auf. Liefert null, wenn der Pfad
 * (z. B. über `..` oder einen absoluten Laufwerkspfad) aus `root` herausführen würde.
 */
export function resolveInside(root: string, urlPath: string): string | null {
  const base = resolve(root)
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const target = resolve(base, '.' + (decoded.startsWith('/') ? decoded : `/${decoded}`))
  return target.startsWith(base + sep) ? target : null
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
}

export function mimeTypeFor(path: string): string {
  const dot = path.lastIndexOf('.')
  const extension = dot >= 0 ? path.slice(dot).toLowerCase() : ''
  return MIME_TYPES[extension] ?? 'application/octet-stream'
}
