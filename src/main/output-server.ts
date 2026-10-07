import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { OutputMessage } from '../core/output/protocol'
import { mimeTypeFor, resolveInside } from './safe-path'

/**
 * Lokaler Ausgabe-Server für OBS (Browserquelle) und das Ausgabefenster.
 *
 * - lauscht nur auf 127.0.0.1 (nicht im Netzwerk erreichbar)
 * - prüft den Host-Header (gegen DNS-Rebinding) und die Herkunft (Origin)
 * - liefert die Ausgabeseite und einen Server-Sent-Events-Strom mit Modell, Pose und Einstellungen
 * - nimmt keine Daten von außen an
 */

export const DEFAULT_OUTPUT_PORT = 47800

export interface OutputServerOptions {
  /** Ordner der gebauten Oberfläche (enthält viewer.html) oder null im Entwicklungsmodus. */
  readonly rendererDir: string | null
  /** Vite-Dev-Server (nur Entwicklung). */
  readonly devServerUrl: string | null
  /** Weitere erlaubte Origins (z. B. „app://bundle“). */
  readonly allowedOrigins: readonly string[]
}

const HEARTBEAT_MS = 15_000

export class OutputServer {
  private server: Server | null = null
  private readonly clients = new Set<ServerResponse>()
  private readonly cache = new Map<string, string>()
  private heartbeat: ReturnType<typeof setInterval> | null = null
  port = 0
  /** Wird bei jeder Änderung der Zahl verbundener Ausgaben aufgerufen. */
  onClientsChanged: (count: number) => void = () => undefined

  constructor(private readonly options: OutputServerOptions) {}

  get clientCount(): number {
    return this.clients.size
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/`
  }

  /** Startet auf `port`; ist er belegt, werden die nächsten zehn Ports probiert. */
  async start(port = DEFAULT_OUTPUT_PORT): Promise<number> {
    for (let candidate = port; candidate < port + 10; candidate++) {
      try {
        await this.listen(candidate)
        this.port = candidate
        this.heartbeat = setInterval(() => this.broadcast(': ping\n\n'), HEARTBEAT_MS)
        return candidate
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      }
    }
    throw new Error('Kein freier Port für die Ausgabe gefunden')
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => void this.handle(req, res))
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject)
        this.server = server
        resolve()
      })
    })
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    for (const client of this.clients) client.end()
    this.clients.clear()
    this.server?.close()
    this.server = null
  }

  /** Nachricht an alle Ausgaben senden; Modell, Einstellungen, Texturen und letzte Pose werden für neue Ausgaben gemerkt. */
  publish(message: OutputMessage): void {
    const frame = `data: ${JSON.stringify(message)}\n\n`
    const key = message.type === 'texture' ? `texture:${message.id}` : message.type
    if (message.type === 'model') {
      // Neues Modell: alte Texturen und Pose gehören nicht mehr dazu.
      for (const k of [...this.cache.keys()]) if (k.startsWith('texture:') || k === 'pose') this.cache.delete(k)
    }
    this.cache.set(key, frame)
    this.broadcast(frame)
  }

  private broadcast(frame: string): void {
    for (const client of this.clients) {
      // Langsame Ausgaben überspringen Posen, statt Speicher anzuhäufen.
      if (client.writableLength > 4 * 1024 * 1024 && frame.includes('"type":"pose"')) continue
      client.write(frame)
    }
  }

  private allowedHost(host: string | undefined): boolean {
    return host === `127.0.0.1:${this.port}` || host === `localhost:${this.port}`
  }

  private allowedOrigin(origin: string | undefined): boolean {
    if (!origin) return true
    if (origin === `http://127.0.0.1:${this.port}` || origin === `http://localhost:${this.port}`) return true
    if (this.options.devServerUrl && origin === new URL(this.options.devServerUrl).origin) return true
    return this.options.allowedOrigins.includes(origin)
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
    if (!this.allowedHost(req.headers.host) || !this.allowedOrigin(origin)) {
      res.writeHead(403).end()
      return
    }
    if (req.method !== 'GET') {
      res.writeHead(405).end()
      return
    }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    const common = { 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}) }

    if (path === '/events') {
      res.writeHead(200, { ...common, 'content-type': 'text/event-stream; charset=utf-8', connection: 'keep-alive' })
      res.write('retry: 1000\n\n')
      for (const key of ['settings', 'model', ...[...this.cache.keys()].filter((k) => k.startsWith('texture:')), 'pose']) {
        const frame = this.cache.get(key)
        if (frame) res.write(frame)
      }
      this.clients.add(res)
      this.onClientsChanged(this.clients.size)
      req.on('close', () => {
        this.clients.delete(res)
        this.onClientsChanged(this.clients.size)
      })
      return
    }

    if (path === '/' || path === '/index.html') {
      const query = new URL(req.url ?? '/', 'http://localhost').search
      if (this.options.devServerUrl) {
        const params = new URLSearchParams(query)
        params.set('source', `http://127.0.0.1:${this.port}`)
        res.writeHead(302, { ...common, location: `${this.options.devServerUrl.replace(/\/$/, '')}/viewer.html?${params}` }).end()
        return
      }
      await this.serveFile('/viewer.html', res, common)
      return
    }
    await this.serveFile(path, res, common)
  }

  private async serveFile(path: string, res: ServerResponse, headers: Record<string, string>): Promise<void> {
    const dir = this.options.rendererDir
    const file = dir ? resolveInside(dir, path) : null
    // Nur die Ausgabeseite und ihre Dateien, nicht die ganze App.
    if (!file || !(path === '/viewer.html' || path.startsWith('/assets/'))) {
      res.writeHead(404, headers).end()
      return
    }
    try {
      const data = await readFile(file)
      res.writeHead(200, { ...headers, 'content-type': mimeTypeFor(file) }).end(data)
    } catch {
      res.writeHead(404, headers).end()
    }
  }
}
