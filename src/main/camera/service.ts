import type { Device, Control, AiFraming, Scene } from '../../shared/types.js'
import type { V4l2Adapter } from './v4l2.js'
import type { XuAdapter } from './xu.js'
import { PresetStore, type AppPreset } from './presets.js'

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

  async applyAppPreset(dev: string, deviceId: string, name: string): Promise<{ failed: string[] }> {
    const preset = this.presets.list(deviceId).find((p) => p.name === name)
    if (!preset) throw new Error(`unknown preset: ${name}`)

    // Silence AI tracking / scene modes first: they drive the gimbal outside
    // the v4l2 state and would immediately re-aim the camera after a recall.
    try {
      await this.xu.send(dev, { kind: 'scene', scene: 'normal' })
    } catch (err) {
      console.error('applyAppPreset: failed to reset scene mode', err)
    }

    // The kernel's v4l2 control framework caches control values and silently
    // drops a SET whose value equals the cache — but XU commands (AI tracking,
    // scene modes, gimbal reset) move the camera without updating that cache.
    // For position controls, write target∓step first, then the target: the
    // pair always differs from the cache, so both writes reach the hardware
    // and the gimbal really ends up at the saved position.
    const POSITION = new Set(['pan_absolute', 'tilt_absolute', 'zoom_absolute'])
    const ranges = new Map<string, Control>()
    try {
      for (const c of await this.v4l2.getControls(dev)) ranges.set(c.name, c)
    } catch (err) {
      console.error('applyAppPreset: failed to read control ranges', err)
    }

    const failed: string[] = []
    const entries = Object.entries(preset.values)
    // Image controls first, then pan/tilt, then zoom last (zoom belongs to the
    // final framing, after the gimbal has been repositioned).
    const rank = (k: string) => (k === 'zoom_absolute' ? 2 : POSITION.has(k) ? 1 : 0)
    entries.sort(([a], [b]) => rank(a) - rank(b))
    for (const [k, v] of entries) {
      try {
        if (POSITION.has(k)) {
          const c = ranges.get(k)
          const step = Math.max(1, c?.step ?? 1)
          const nudge = c?.min !== undefined && v - step < c.min ? v + step : v - step
          await this.v4l2.setControl(dev, k, nudge)
        }
        await this.v4l2.setControl(dev, k, v)
      } catch (err) {
        failed.push(k)
        console.error(`applyAppPreset: failed to set ${k}=${v}`, err)
      }
    }
    return { failed }
  }
}
