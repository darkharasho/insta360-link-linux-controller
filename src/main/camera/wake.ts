import { open as fsOpen } from 'node:fs/promises'

/** Releases a previously opened device handle. */
export type CloseHandle = () => Promise<void>

/** Injectable device-handle IO so tests never touch a real /dev/video* node. */
export interface WakeIo {
  open(dev: string): Promise<CloseHandle>
}

export interface WakeOpts {
  /** How long a cold handle is held before the camera accepts commands. */
  wakeMs?: number
  /** Release the handle this long after the most recent command. */
  idleMs?: number
}

/**
 * Opening a /dev/video* node for reading wakes an Insta360 Link without
 * streaming from it, which does not prevent other apps from capturing.
 */
const defaultIo: WakeIo = {
  async open(dev) {
    const handle = await fsOpen(dev, 'r')
    return () => handle.close()
  },
}

/**
 * Keeps a sleeping Link awake long enough for control writes to land.
 *
 * A `v4l2-ctl --set-ctrl` opens the device for only ~25ms, which is not long
 * enough for a sleeping camera to wake, so the command is silently dropped:
 * the write still succeeds and the target register still updates, and because
 * pan/tilt are write-only registers with no position feedback there is no way
 * to detect the loss afterwards. Holding a handle open across the write — and
 * for a wake delay before the first one — makes PTZ land reliably even when
 * the preview is off and nothing else has the camera open.
 *
 * The handle is released after an idle period so the camera's activity LED
 * does not stay lit while the app merely sits open.
 */
export class DeviceWaker {
  private wakeMs: number
  private idleMs: number
  /** Per-device wake state; presence of an entry means a handle is held. */
  private held = new Map<string, { close: CloseHandle; timer: ReturnType<typeof setTimeout> }>()
  /** In-flight cold opens, so concurrent commands share one wake delay. */
  private pending = new Map<string, Promise<void>>()
  /** Set by releaseAll(): a cold open still in its wake delay must not be kept. */
  private disposed = false

  constructor(private io: WakeIo = defaultIo, opts: WakeOpts = {}) {
    this.wakeMs = opts.wakeMs ?? 600
    this.idleMs = opts.idleMs ?? 10_000
  }

  /**
   * Resolve once `dev` is awake and will accept a control write. Best-effort:
   * if the node cannot be opened this resolves anyway so the caller still
   * attempts the command rather than failing outright.
   */
  async ensureAwake(dev: string): Promise<void> {
    const existing = this.held.get(dev)
    if (existing) {
      this.postpone(dev, existing)
      return
    }
    const inFlight = this.pending.get(dev)
    if (inFlight) return inFlight

    const wake = this.coldOpen(dev).finally(() => this.pending.delete(dev))
    this.pending.set(dev, wake)
    return wake
  }

  /** Drop every held handle — used on shutdown. */
  async releaseAll(): Promise<void> {
    this.disposed = true
    const entries = [...this.held.entries()]
    this.held.clear()
    for (const [, e] of entries) {
      clearTimeout(e.timer)
      await e.close().catch(() => {})
    }
  }

  private async coldOpen(dev: string): Promise<void> {
    let close: CloseHandle
    try {
      close = await this.io.open(dev)
    } catch {
      // Busy or missing node: let the caller try the write regardless.
      return
    }
    await new Promise((r) => setTimeout(r, this.wakeMs))
    // releaseAll() may have run while we were waiting out the wake delay.
    if (!this.disposed) {
      const entry = { close, timer: undefined as unknown as ReturnType<typeof setTimeout> }
      this.held.set(dev, entry)
      this.postpone(dev, entry)
    } else {
      await close().catch(() => {})
    }
  }

  private postpone(dev: string, entry: { close: CloseHandle; timer: ReturnType<typeof setTimeout> }) {
    clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      this.held.delete(dev)
      void entry.close().catch(() => {})
    }, this.idleMs)
  }
}
