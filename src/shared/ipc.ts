import type { Device, Control, AiFraming, Scene, AppPreset } from './types.js'

export const CH = {
  listDevices: 'camera:list',
  getSnapshot: 'camera:snapshot',
  setControl: 'camera:setControl',
  setAi: 'camera:setAi',
  setFraming: 'camera:setFraming',
  setScene: 'camera:setScene',
  reset: 'camera:reset',
  listAppPresets: 'camera:listAppPresets',
  saveAppPreset: 'camera:saveAppPreset',
  applyAppPreset: 'camera:applyAppPreset',
  removeAppPreset: 'camera:removeAppPreset',
} as const

export interface CameraApi {
  listDevices(): Promise<Device[]>
  getSnapshot(dev: string): Promise<Control[]>
  setControl(dev: string, name: string, value: number): Promise<void>
  setAi(dev: string, on: boolean): Promise<void>
  setFraming(dev: string, mode: AiFraming): Promise<void>
  setScene(dev: string, scene: Scene): Promise<void>
  reset(dev: string): Promise<void>
  listAppPresets(deviceId: string): Promise<AppPreset[]>
  saveAppPreset(deviceId: string, name: string, values: Record<string, number>): Promise<void>
  applyAppPreset(dev: string, deviceId: string, name: string): Promise<void>
  removeAppPreset(deviceId: string, name: string): Promise<void>
}
