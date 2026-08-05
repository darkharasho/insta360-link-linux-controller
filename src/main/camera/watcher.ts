import type { Device } from '../../shared/types.js'

/**
 * Polls camera discovery and emits whenever the set of connected cameras
 * changes (plug, unplug, node renumbering). Discovery is sysfs-only, so a
 * poll never opens /dev/video* and can never wake a sleeping camera — which
 * is why polling is safe here where a naive v4l2 enumeration loop would not
 * be.
 */
export class DeviceWatcher {
  private timer: ReturnType<typeof setInterval> | null = null
  private lastSig: string | null = null
  private polling = false

  constructor(
    private list: () => Promise<Device[]>,
    private onChange: (devices: Device[]) => void,
    private intervalMs = 2000,
  ) {}

  start() {
    if (this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), this.intervalMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** One poll cycle; emits only when the device set actually changed. */
  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const devices = await this.list()
      const sig = JSON.stringify(devices.map((d) => [d.id, d.captureNode, d.name, d.nodes]))
      if (sig !== this.lastSig) {
        this.lastSig = sig
        this.onChange(devices)
      }
    } catch {
      // Transient sysfs read failure — keep the last known state and let the
      // next tick retry rather than flapping the device list.
    } finally {
      this.polling = false
    }
  }
}
