import { contextBridge, ipcRenderer } from 'electron'
import { CH, type CameraApi } from '../shared/ipc.js'

const api: CameraApi = {
  listDevices: () => ipcRenderer.invoke(CH.listDevices),
  getSnapshot: (dev) => ipcRenderer.invoke(CH.getSnapshot, dev),
  setControl: (dev, name, value) => ipcRenderer.invoke(CH.setControl, dev, name, value),
  setAi: (dev, on) => ipcRenderer.invoke(CH.setAi, dev, on),
  setFraming: (dev, mode) => ipcRenderer.invoke(CH.setFraming, dev, mode),
  setScene: (dev, scene) => ipcRenderer.invoke(CH.setScene, dev, scene),
  reset: (dev) => ipcRenderer.invoke(CH.reset, dev),
  listAppPresets: (id) => ipcRenderer.invoke(CH.listAppPresets, id),
  saveAppPreset: (id, name, values) => ipcRenderer.invoke(CH.saveAppPreset, id, name, values),
  applyAppPreset: (dev, id, name) => ipcRenderer.invoke(CH.applyAppPreset, dev, id, name),
  removeAppPreset: (id, name) => ipcRenderer.invoke(CH.removeAppPreset, id, name),
}
contextBridge.exposeInMainWorld('cameraApi', api)

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
})
