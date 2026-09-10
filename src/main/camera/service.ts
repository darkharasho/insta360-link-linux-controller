import type { Device, Control, AiFraming, Scene, CameraMode } from '../../shared/types.js'
import type { V4l2Adapter } from './v4l2.js'
import type { XuAdapter } from './xu.js'
import { PresetStore, type AppPreset } from './presets.js'

/** Keeps the camera awake so control writes are not silently dropped. */
export interface Waker {
  ensureAwake(dev: string): Promise<void>
}

/** Used when no waker is supplied (tests): assume the camera is already awake. */
const noopWaker: Waker = { ensureAwake: async () => {} }

export class CameraService {
  /** Time to let a scene transition (DeskView etc.) finish before replaying zoom. */
  private sceneSettleMs: number

  constructor(
    private v4l2: V4l2Adapter,
    private xu: XuAdapter,
    private presets: PresetStore,
    opts: { sceneSettleMs?: number } = {},
    private waker: Waker = noopWaker,
  ) {
    this.sceneSettleMs = opts.sceneSettleMs ?? 1500
  }

  async listDevices(): Promise<Device[]> {
    const devices = await this.v4l2.listDevices()
    // Pre-v0.3 presets were keyed by the port-path busId; move them under the
    // stable camera id. migrate() is a guarded no-op afterwards, so the
    // discovery watcher re-running this every poll costs nothing.
    for (const d of devices) {
      if (d.busId && d.busId !== d.id) this.presets.migrate(d.busId, d.id)
    }
    return devices
  }

  getSnapshot(dev: string): Promise<Control[]> {
    return this.v4l2.getControls(dev)
  }

  // Every command below physically drives the camera, and a v4l2/XU write only
  // holds the device open for ~25ms — too short to wake a sleeping Link, which
  // drops the command without reporting any error. Wake first, then write.

  async setControl(dev: string, name: string, value: number): Promise<void> {
    await this.waker.ensureAwake(dev)
    return this.v4l2.setControl(dev, name, value)
  }

  async setAi(dev: string, on: boolean): Promise<void> {
    await this.waker.ensureAwake(dev)
    return this.xu.send(dev, { kind: 'ai', on })
  }

  async setFraming(dev: string, mode: AiFraming): Promise<void> {
    await this.waker.ensureAwake(dev)
    return this.xu.send(dev, { kind: 'framing', mode })
  }

  async setScene(dev: string, scene: Scene): Promise<void> {
    await this.waker.ensureAwake(dev)
    return this.xu.send(dev, { kind: 'scene', scene })
  }

  /**
   * Recenter the gimbal.
   *
   * The XU gimbal-reset trigger alone does not do this. On a Link 2 Pro the
   * control is well-formed and accepted -- unit 9 selector 14 reports GET_LEN=1
   * and GET_INFO=SET-only, and the ioctl returns success -- but with the camera
   * parked 50 deg off-center nothing moved for the following 10s. A scene mode
   * additionally makes the camera ignore pan/tilt writes altogether. So home
   * means: clear the scene, then drive pan/tilt home ourselves. The trigger is
   * still sent first; it is harmless and may be honoured by other firmware.
   */
  async reset(dev: string): Promise<void> {
    await this.waker.ensureAwake(dev)
    await this.xu.send(dev, { kind: 'reset' })
    await this.xu.send(dev, { kind: 'scene', scene: 'normal' })
    // Leaving a scene is a gimbal move of its own, and pan/tilt written while
    // it is still in progress is discarded -- measured: a reset() that issued
    // its writes 128ms after the scene command left the camera exactly where
    // it was parked. Let the transition finish first, as preset recall does.
    if (this.sceneSettleMs > 0) await new Promise((r) => setTimeout(r, this.sceneSettleMs))
    const ranges = await this.readRanges(dev)
    for (const name of ['pan_absolute', 'tilt_absolute']) {
      try {
        await this.setNudged(dev, ranges, name, ranges.get(name)?.default ?? 0)
      } catch (err) {
        console.error(`reset: failed to center ${name}`, err)
      }
    }
  }

  /**
   * Control descriptors keyed by name, for step/min/default lookups. Best
   * effort: an unreadable device yields an empty map so callers still write.
   */
  private async readRanges(dev: string): Promise<Map<string, Control>> {
    const ranges = new Map<string, Control>()
    try {
      for (const c of await this.v4l2.getControls(dev)) ranges.set(c.name, c)
    } catch (err) {
      console.error('readRanges: failed to read control ranges', err)
    }
    return ranges
  }

  /**
   * Write a position control so the value definitely reaches the hardware.
   * The v4l2 control framework does not pass a SET to the driver when the new
   * value equals its cached one, and pan/tilt/zoom carry no EXECUTE_ON_WRITE
   * flag -- while XU commands (AI tracking, scene modes) move the gimbal
   * without updating that cache. Writing target-∓step first guarantees the pair
   * differs from whatever was cached, so the target write always lands.
   */
  private async setNudged(dev: string, ranges: Map<string, Control>, k: string, v: number): Promise<void> {
    const c = ranges.get(k)
    const step = Math.max(1, c?.step ?? 1)
    const nudge = c?.min !== undefined && v - step < c.min ? v + step : v - step
    await this.v4l2.setControl(dev, k, nudge)
    await this.v4l2.setControl(dev, k, v)
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
    await this.waker.ensureAwake(dev)
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

    // Position controls go through setNudged so a value matching the stale
    // cache still reaches the hardware.
    //
    // Scene-mode presets skip the pan/tilt replay: the scene command aims the
    // gimbal itself, and pan/tilt cached while a scene was active are stale by
    // definition. Zoom is different — the user can zoom manually on top of a
    // scene, so the saved zoom is replayed after the scene settles (the scene
    // transition resets zoom to its own default).
    const POSITION = new Set(['pan_absolute', 'tilt_absolute', 'zoom_absolute'])
    const isScenePreset = mode !== 'normal' && mode !== 'ai'
    const ranges = await this.readRanges(dev)
    const failed: string[] = []
    const setNudged = (k: string, v: number) => this.setNudged(dev, ranges, k, v)

    const entries = Object.entries(preset.values).filter(([k]) => !(isScenePreset && POSITION.has(k)))
    // Image controls first, then pan/tilt, then zoom last (zoom belongs to the
    // final framing, after the gimbal has been repositioned).
    const rank = (k: string) => (k === 'zoom_absolute' ? 2 : POSITION.has(k) ? 1 : 0)
    entries.sort(([a], [b]) => rank(a) - rank(b))
    for (const [k, v] of entries) {
      try {
        if (POSITION.has(k)) await setNudged(k, v)
        else await this.v4l2.setControl(dev, k, v)
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
        // Re-apply the saved zoom on top of the scene once its transition has
        // settled (the transition drives zoom internally, outside the cache).
        if (typeof preset.values.zoom_absolute === 'number') {
          if (this.sceneSettleMs > 0) await new Promise((r) => setTimeout(r, this.sceneSettleMs))
          try {
            await setNudged('zoom_absolute', preset.values.zoom_absolute)
          } catch (err) {
            failed.push('zoom_absolute')
            console.error('applyAppPreset: failed to re-apply zoom after scene', err)
          }
        }
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
