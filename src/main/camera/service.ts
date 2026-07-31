import type { Device, Control, AiFraming, Scene } from '../../shared/types'
import type { V4l2Adapter } from './v4l2'
import type { XuAdapter } from './xu'
import { PresetStore, type AppPreset } from './presets'

export class CameraService {
  constructor(private v4l2: V4l2Adapter, private xu: XuAdapter, private presets: PresetStore) {}

  listDevices(): Promise<Device[]> {
    return this.v4l2.listDevices()
  }

  getSnapshot(dev: string): Promise<Control[]> {
    return this.v4l2.getControls(dev)
  }

  setControl(dev: string, name: string, value: number): Promise<void> {
    return this.v4l2.setControl(dev, name, value)
  }

  setAi(dev: string, on: boolean): Promise<void> {
    return this.xu.send(dev, { kind: 'ai', on })
  }

  setFraming(dev: string, mode: AiFraming): Promise<void> {
    return this.xu.send(dev, { kind: 'framing', mode })
  }

  setScene(dev: string, scene: Scene): Promise<void> {
    return this.xu.send(dev, { kind: 'scene', scene })
  }

  recallHwPreset(dev: string, slot: number): Promise<void> {
    return this.xu.send(dev, { kind: 'preset-recall', slot })
  }

  saveHwPreset(dev: string, slot: number): Promise<void> {
    return this.xu.send(dev, { kind: 'preset-save', slot })
  }

  reset(dev: string): Promise<void> {
    return this.xu.send(dev, { kind: 'reset' })
  }

  listAppPresets(deviceId: string): AppPreset[] {
    return this.presets.list(deviceId)
  }

  saveAppPreset(deviceId: string, name: string, values: Record<string, number>): void {
    this.presets.save(deviceId, { name, values })
  }

  removeAppPreset(deviceId: string, name: string): void {
    this.presets.remove(deviceId, name)
  }

  async applyAppPreset(dev: string, deviceId: string, name: string): Promise<void> {
    const preset = this.presets.list(deviceId).find((p) => p.name === name)
    if (!preset) throw new Error(`unknown preset: ${name}`)
    for (const [k, v] of Object.entries(preset.values)) {
      await this.v4l2.setControl(dev, k, v)
    }
  }
}
