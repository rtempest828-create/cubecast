import { BrowserWindow } from 'electron'
import type { OutputWindowOptions } from '../shared/ipc'

/**
 * Rahmenloses, transparentes Ausgabefenster (für Fensteraufnahme in OBS oder
 * Bildschirmübertragung in Discord). Zeigt dieselbe Seite wie die OBS-Browserquelle.
 */
export class OutputWindow {
  private window: BrowserWindow | null = null
  onChanged: () => void = () => undefined

  get isOpen(): boolean {
    return this.window !== null && !this.window.isDestroyed()
  }

  open(url: string, options: OutputWindowOptions): void {
    const width = Math.round(Math.min(3840, Math.max(160, options.width)))
    const height = Math.round(Math.min(3840, Math.max(160, options.height)))
    if (this.isOpen) {
      this.window!.setContentSize(width, height)
      this.window!.setAlwaysOnTop(options.alwaysOnTop)
      this.window!.focus()
      return
    }
    const window = new BrowserWindow({
      width,
      height,
      useContentSize: true,
      title: 'CubeCast – Ausgabe',
      transparent: true,
      frame: false,
      resizable: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      alwaysOnTop: options.alwaysOnTop,
      skipTaskbar: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
    })
    window.on('closed', () => {
      this.window = null
      this.onChanged()
    })
    this.window = window
    void window.loadURL(`${url}?window=1`)
    this.onChanged()
  }

  close(): void {
    if (this.isOpen) this.window!.close()
  }
}
