import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type VtuberApi } from '../shared/ipc'

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
  }
}

contextBridge.exposeInMainWorld('vtuber', api)
