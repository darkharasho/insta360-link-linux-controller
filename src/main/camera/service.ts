import type { Device, Control, AiFraming, Scene, CameraMode } from '../../shared/types.js'
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

  saveAppPreset(
    deviceId: string,
    name: string,
    values: Record<string, number>,
    mode: CameraMode = 'normal',
    framing?: AiFraming,
  ): void {
    this.presets.save(deviceId, { name, values, mode, ...(framing ? { framing } : {}) })
  }

  removeAppPreset(deviceId: string, name: string): void {
    this.presets.remove(deviceId, name)
  }

  async applyAppPreset(
    dev: string,
    deviceId: string,
    name: string,
  ): Promise<{ failed: string[]; mode: CameraMode; framing?: AiFraming }> {
    const preset = this.presets.list(deviceId).find((p) => p.name === name)
    if (!preset) throw new Error(`unknown preset: ${name}`)
    const mode: CameraMode = preset.mode ?? 'normal'

    // Silence AI tracking / scene modes first: they drive the gimbal outside
    // the v4l2 state and would immediately re-aim the camera mid-recall. For
    // scene presets the scene command itself is sent at the end instead.
    if (mode === 'normal' || mode === 'ai') {
      try {
        await this.xu.send(dev, { kind: 'scene', scene: 'normal' })
      } catch (err) {
        console.error('applyAppPreset: failed to reset scene mode', err)
      }
    }

    // The kernel's v4l2 control framework caches control values and silently
    // drops a SET whose value equals the cache — but XU commands (AI tracking,
    // scene modes, gimbal reset) move the camera without updating that cache.
    // For position controls, write target∓step first, then the target: the
    // pair always differs from the cache, so both writes reach the hardware
    // and the gimbal really ends up at the saved position.
    //
    // Scene-mode presets skip the position replay entirely: the scene command
    // aims the gimbal itself, and the cached pan/tilt/zoom captured while a
    // scene was active are stale by definition.
    const POSITION = new Set(['pan_absolute', 'tilt_absolute', 'zoom_absolute'])
    const isScenePreset = mode !== 'normal' && mode !== 'ai'
    const ranges = new Map<string, Control>()
    if (!isScenePreset) {
      try {
        for (const c of await this.v4l2.getControls(dev)) ranges.set(c.name, c)
      } catch (err) {
        console.error('applyAppPreset: failed to read control ranges', err)
      }
    }

    const failed: string[] = []
    const entries = Object.entries(preset.values).filter(([k]) => !(isScenePreset && POSITION.has(k)))
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

    // Restore the saved mode: scene presets enter their scene now; AI presets
    // start tracking from the recalled position, with the saved framing.
    try {
      if (isScenePreset) {
        await this.xu.send(dev, { kind: 'scene', scene: mode })
      } else if (mode === 'ai') {
        await this.xu.send(dev, { kind: 'ai', on: true })
        if (preset.framing) await this.xu.send(dev, { kind: 'framing', mode: preset.framing })
      }
    } catch (err) {
      console.error('applyAppPreset: failed to restore mode', err)
      failed.push('mode')
    }

    return { failed, mode, ...(preset.framing ? { framing: preset.framing } : {}) }
  }
}
