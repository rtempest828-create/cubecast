import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type OutputStatus, type VtuberApi } from '../shared/ipc'

/** Einzige Brücke zwischen Renderer und Main-Prozess (siehe `shared/ipc.ts`). */
const api: VtuberApi = {
  skin: {
    downloadByName: (name) => ipcRenderer.invoke(IPC.skinDownloadByName, name),
    openFile: () => ipcRenderer.invoke(IPC.skinOpenFile)
  },
  avatarConfig: {
    load: (key) => ipcRenderer.invoke(IPC.avatarConfigLoad, key),
    save: (key, data) => ipcRenderer.invoke(IPC.avatarConfigSave, key, data)
  },
  figura: {
    list: () => ipcRenderer.invoke(IPC.figuraList),
    load: (key) => ipcRenderer.invoke(IPC.figuraLoad, key),
    openFolder: () => ipcRenderer.invoke(IPC.figuraOpenFolder)
  },
  output: {
    publish: (message) => ipcRenderer.send(IPC.outputPublish, message),
    status: () => ipcRenderer.invoke(IPC.outputStatus),
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: OutputStatus): void => listener(status)
      ipcRenderer.on(IPC.outputStatusChanged, handler)
      return () => ipcRenderer.removeListener(IPC.outputStatusChanged, handler)
    },
    openWindow: (options) => ipcRenderer.invoke(IPC.outputOpenWindow, options),
    closeWindow: () => ipcRenderer.invoke(IPC.outputCloseWindow),
    copyUrl: () => ipcRenderer.invoke(IPC.outputCopyUrl)
  },
  profiles: {
    list: () => ipcRenderer.invoke(IPC.profileList),
    save: (name, data) => ipcRenderer.invoke(IPC.profileSave, name, data),
    load: (name) => ipcRenderer.invoke(IPC.profileLoad, name),
    remove: (name) => ipcRenderer.invoke(IPC.profileRemove, name)
  },
  hotkeys: {
    set: (bindings) => ipcRenderer.invoke(IPC.hotkeysSet, bindings),
    onTriggered: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, id: string): void => listener(id)
      ipcRenderer.on(IPC.hotkeyTriggered, handler)
      return () => ipcRenderer.removeListener(IPC.hotkeyTriggered, handler)
    }
  },
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    openDataFolder: () => ipcRenderer.invoke(IPC.appOpenDataFolder)
  }
}

contextBridge.exposeInMainWorld('vtuber', api)
