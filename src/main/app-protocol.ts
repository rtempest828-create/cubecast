import { readFile } from 'node:fs/promises'
import { protocol } from 'electron'
import { mimeTypeFor, resolveInside } from './safe-path'

/**
 * Eigenes Protokoll `app://bundle/…` für die gebaute Oberfläche.
 *
 * Unter `file://` dürften Worker und `fetch()` keine Dateien laden – MediaPipe braucht
 * beides (WASM-Laufzeit und Modell). Ein privilegiertes Protokoll verhält sich wie
 * eine normale, sichere Web-Herkunft, bleibt aber komplett lokal.
 */
export const APP_SCHEME = 'app'
export const APP_HOST = 'bundle'
export const APP_ENTRY_URL = `${APP_SCHEME}://${APP_HOST}/index.html`

/** Muss vor `app.whenReady()` aufgerufen werden. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
  ])
}

/** Liefert Dateien aus `rootDir` aus (nur innerhalb dieses Ordners). */
export function serveAppProtocol(rootDir: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST) return new Response('Nicht gefunden', { status: 404 })
    const target = resolveInside(rootDir, url.pathname)
    if (!target) return new Response('Verboten', { status: 403 })
    try {
      const data = await readFile(target)
      // no-cache: nach einem Update nie veraltete Dateien aus dem Zwischenspeicher zeigen.
      return new Response(new Uint8Array(data), { headers: { 'content-type': mimeTypeFor(target), 'cache-control': 'no-cache' } })
    } catch {
      return new Response('Nicht gefunden', { status: 404 })
    }
  })
}
