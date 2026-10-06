import { join } from 'node:path'
import { app, BrowserWindow, session } from 'electron'
import { t } from '../shared/i18n'
import { APP_ENTRY_URL, registerAppScheme, serveAppProtocol } from './app-protocol'
import { AvatarStore } from './avatar-store'
import { registerIpcHandlers } from './ipc'
import { installNetworkGuard } from './network-guard'

/** Von electron-vite im Entwicklungsmodus gesetzt (Vite-Dev-Server). */
const devServerUrl = process.env['ELECTRON_RENDERER_URL']
const appUrl = devServerUrl ?? APP_ENTRY_URL

registerAppScheme()

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: t('app.title'),
    backgroundColor: '#0f1115',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  })
  window.once('ready-to-show', () => window.show())
  void window.loadURL(appUrl)
  return window
}

// Keine Navigation weg von der App und keine neuen Fenster aus Webinhalten
// (z. B. wenn eine Datei neben die Drop-Zone gezogen wird).
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event) => event.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})

app.whenReady().then(() => {
  if (!devServerUrl) serveAppProtocol(join(__dirname, '../renderer'))
  installNetworkGuard(session.defaultSession, devServerUrl)
  registerIpcHandlers(appUrl, new AvatarStore(join(app.getPath('userData'), 'avatars')))
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => app.quit())
