import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeviceWaker } from './wake'

function makeIo() {
  const closes: string[] = []
  const opens: string[] = []
  const io = {
    open: vi.fn(async (dev: string) => {
      opens.push(dev)
      return async () => { closes.push(dev) }
    }),
  }
  return { io, opens, closes }
}

describe('DeviceWaker', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('holds the device open for the wake delay before the first command', async () => {
    const { io, opens } = makeIo()
    const w = new DeviceWaker(io, { wakeMs: 600, idleMs: 10_000 })

    let awake = false
    const p = w.ensureAwake('/dev/video1').then(() => { awake = true })

    await vi.advanceTimersByTimeAsync(0)
    expect(opens).toEqual(['/dev/video1'])
    // A ~25ms open is what silently drops PTZ commands on a sleeping Link:
    // the waker must not resolve until the camera has had time to wake.
    await vi.advanceTimersByTimeAsync(599)
    expect(awake).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await p
    expect(awake).toBe(true)
  })

  it('does not re-open or re-wait while the handle is still held', async () => {
    const { io, opens } = makeIo()
    const w = new DeviceWaker(io, { wakeMs: 600, idleMs: 10_000 })
    const first = w.ensureAwake('/dev/video1')
    await vi.advanceTimersByTimeAsync(600)
    await first

    let second = false
    const p = w.ensureAwake('/dev/video1').then(() => { second = true })
    await vi.advanceTimersByTimeAsync(0)
    await p
    expect(second).toBe(true)
    expect(opens).toHaveLength(1)
  })

  it('coalesces concurrent waits onto a single open', async () => {
    const { io, opens } = makeIo()
    const w = new DeviceWaker(io, { wakeMs: 600, idleMs: 10_000 })
    const all = Promise.all([
      w.ensureAwake('/dev/video1'),
      w.ensureAwake('/dev/video1'),
      w.ensureAwake('/dev/video1'),
    ])
    await vi.advanceTimersByTimeAsync(600)
    await all
    expect(opens).toHaveLength(1)
  })

  it('releases the handle after the idle timeout so the LED does not stay lit', async () => {
    const { io, closes } = makeIo()
    const w = new DeviceWaker(io, { wakeMs: 600, idleMs: 10_000 })
    const p = w.ensureAwake('/dev/video1')
    await vi.advanceTimersByTimeAsync(600)
    await p

    await vi.advanceTimersByTimeAsync(9_999)
    expect(closes).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(closes).toEqual(['/dev/video1'])
  })

  it('each command postpones the idle release', async () => {
    const { io, closes } = makeIo()
    const w = new DeviceWaker(io, { wakeMs: 600, idleMs: 10_000 })
    const p = w.ensureAwake('/dev/video1')
    await vi.advanceTimersByTimeAsync(600)
    await p

    await vi.advanceTimersByTimeAsync(8_000)
    await w.ensureAwake('/dev/video1')
    await vi.advanceTimersByTimeAsync(8_000)
    expect(closes).toEqual([])
    await vi.advanceTimersByTimeAsync(2_000)
    expect(closes).toEqual(['/dev/video1'])
  })

  it('waits again once the camera has been released and may have slept', async () => {
    const { io, opens } = makeIo()
    const w = new DeviceWaker(io, { wakeMs: 600, idleMs: 10_000 })
    const p = w.ensureAwake('/dev/video1')
    await vi.advanceTimersByTimeAsync(600)
    await p
    await vi.advanceTimersByTimeAsync(10_000)

    let awake = false
    const p2 = w.ensureAwake('/dev/video1').then(() => { awake = true })
    await vi.advanceTimersByTimeAsync(599)
    expect(awake).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await p2
    expect(opens).toHaveLength(2)
  })

  it('never blocks a command when the device cannot be opened', async () => {
    const io = { open: vi.fn(async () => { throw new Error('EBUSY') }) }
    const w = new DeviceWaker(io, { wakeMs: 600, idleMs: 10_000 })
    await expect(w.ensureAwake('/dev/video1')).resolves.toBeUndefined()
  })

  it('tracks devices independently', async () => {
    const { io, opens } = makeIo()
    const w = new DeviceWaker(io, { wakeMs: 600, idleMs: 10_000 })
    const all = Promise.all([w.ensureAwake('/dev/video1'), w.ensureAwake('/dev/video5')])
    await vi.advanceTimersByTimeAsync(600)
    await all
    expect(opens.sort()).toEqual(['/dev/video1', '/dev/video5'])
  })
})

describe('DeviceWaker shutdown', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not retain a handle opened while shutting down', async () => {
    const { io, closes } = makeIo()
    const w = new DeviceWaker(io, { wakeMs: 600, idleMs: 10_000 })
    const p = w.ensureAwake('/dev/video1')
    await vi.advanceTimersByTimeAsync(10)
    await w.releaseAll()
    await vi.advanceTimersByTimeAsync(600)
    await p
    expect(closes).toEqual(['/dev/video1'])
  })

  it('releases held handles on shutdown', async () => {
    const { io, closes } = makeIo()
    const w = new DeviceWaker(io, { wakeMs: 600, idleMs: 10_000 })
    const p = w.ensureAwake('/dev/video1')
    await vi.advanceTimersByTimeAsync(600)
    await p
    await w.releaseAll()
    expect(closes).toEqual(['/dev/video1'])
  })
})
