import type { IpcMain } from 'electron'
import { CH } from '../shared/ipc'
import type { CameraService } from './camera/service'
import type { AiFraming, Scene } from '../shared/types'

export function registerIpc(ipcMain: IpcMain, s: CameraService) {
  ipcMain.handle(CH.listDevices, () => s.listDevices())
  ipcMain.handle(CH.getSnapshot, (_e, dev: string) => s.getSnapshot(dev))
  ipcMain.handle(CH.setControl, (_e, dev: string, name: string, value: number) => s.setControl(dev, name, value))
  ipcMain.handle(CH.setAi, (_e, dev: string, on: boolean) => s.setAi(dev, on))
  ipcMain.handle(CH.setFraming, (_e, dev: string, mode: AiFraming) => s.setFraming(dev, mode))
  ipcMain.handle(CH.setScene, (_e, dev: string, scene: Scene) => s.setScene(dev, scene))
  ipcMain.handle(CH.reset, (_e, dev: string) => s.reset(dev))
  ipcMain.handle(CH.listAppPresets, (_e, id: string) => s.listAppPresets(id))
  ipcMain.handle(CH.saveAppPreset, (_e, id: string, name: string, values: Record<string, number>) => s.saveAppPreset(id, name, values))
  ipcMain.handle(CH.applyAppPreset, (_e, dev: string, id: string, name: string) => s.applyAppPreset(dev, id, name))
  ipcMain.handle(CH.removeAppPreset, (_e, id: string, name: string) => s.removeAppPreset(id, name))
}
