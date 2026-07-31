import { contextBridge, ipcRenderer } from 'electron'
import { CH, type CameraApi } from '../shared/ipc.js'
import { VCAM_CH, type VcamApi } from '../shared/vcam-ipc.js'

const api: CameraApi = {
  listDevices: () => ipcRenderer.invoke(CH.listDevices),
  getSnapshot: (dev) => ipcRenderer.invoke(CH.getSnapshot, dev),
  setControl: (dev, name, value) => ipcRenderer.invoke(CH.setControl, dev, name, value),
  setAi: (dev, on) => ipcRenderer.invoke(CH.setAi, dev, on),
  setFraming: (dev, mode) => ipcRenderer.invoke(CH.setFraming, dev, mode),
  setScene: (dev, scene) => ipcRenderer.invoke(CH.setScene, dev, scene),
  reset: (dev) => ipcRenderer.invoke(CH.reset, dev),
  listAppPresets: (id) => ipcRenderer.invoke(CH.listAppPresets, id),
  saveAppPreset: (id, name, values, mode, framing) => ipcRenderer.invoke(CH.saveAppPreset, id, name, values, mode, framing),
  applyAppPreset: (dev, id, name) => ipcRenderer.invoke(CH.applyAppPreset, dev, id, name),
  removeAppPreset: (id, name) => ipcRenderer.invoke(CH.removeAppPreset, id, name),
}
contextBridge.exposeInMainWorld('cameraApi', api)

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
})

const vcamApi: VcamApi = {
  status: () => ipcRenderer.invoke(VCAM_CH.status),
  start: (w, h, fps) => ipcRenderer.invoke(VCAM_CH.start, w, h, fps),
  stop: () => ipcRenderer.invoke(VCAM_CH.stop),
  sendFrame: (data) => ipcRenderer.send(VCAM_CH.frame, data),
}
contextBridge.exposeInMainWorld('vcamApi', vcamApi)
