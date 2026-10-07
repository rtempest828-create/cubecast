import type { Session } from 'electron'

/**
 * Sperrt jeden Netzwerkzugriff aus Fenstern der App (Renderer, später auch Worker).
 * Erlaubt sind nur lokale Ressourcen, der eigene Ausgabe-Server auf 127.0.0.1 und – während
 * der Entwicklung – der Vite-Dev-Server.
 *
 * Der einzige externe Zugriff (Skin-Download per Spielername) läuft im Main-Prozess
 * über `skin-download.ts` und ist dort auf feste Mojang-Hosts beschränkt.
 */
export function installNetworkGuard(session: Session, devServerUrl: string | undefined, outputPort = 0): void {
  const devHost = devServerUrl ? new URL(devServerUrl).host : null

  session.webRequest.onBeforeRequest((details, callback) => {
    if (isAllowedUrl(details.url, devHost, outputPort)) {
      callback({})
      return
    }
    console.warn(`[Netzwerk-Sperre] blockiert: ${details.url}`)
    callback({ cancel: true })
  })

  // Nur Kamera/Mikrofon dürfen angefragt werden (ab M2), alles andere wird abgelehnt.
  session.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'media'))
  session.setPermissionCheckHandler((_contents, permission) => permission === 'media')
}

/** `app:` ist das eigene, lokale Protokoll der gebauten App (siehe `app-protocol.ts`). */
const LOCAL_PROTOCOLS = new Set(['app:', 'file:', 'data:', 'blob:', 'devtools:', 'chrome-extension:'])

export function isAllowedUrl(url: string, devHost: string | null, outputPort = 0): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (LOCAL_PROTOCOLS.has(parsed.protocol)) return true
  // Eigener Ausgabe-Server (nur 127.0.0.1, für das Ausgabefenster)
  if (outputPort > 0 && parsed.protocol === 'http:' && parsed.host === `127.0.0.1:${outputPort}`) return true
  // Vite-Dev-Server inkl. Hot-Reload-WebSocket
  return devHost !== null && parsed.host === devHost && (parsed.protocol === 'http:' || parsed.protocol === 'ws:')
}
