import { describe, it, expect, vi } from 'vitest'
import type { Device } from '../../shared/types.js'
import { DeviceWatcher } from './watcher.js'

const dev = (id: string, node: string): Device => ({
  id,
  name: 'Insta360 Link 2: Insta360 Link',
  label: 'Insta360 Link 2',
  captureNode: node,
  nodes: [node, node.replace(/\d+$/, (n) => String(Number(n) + 1))],
})

describe('DeviceWatcher', () => {
  it('emits the initial device list on the first poll', async () => {
    const onChange = vi.fn()
    const w = new DeviceWatcher(async () => [dev('usb-a', '/dev/video1')], onChange)
    await w.poll()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual([dev('usb-a', '/dev/video1')])
  })

  it('does not emit again while the device set is unchanged', async () => {
    const onChange = vi.fn()
    const w = new DeviceWatcher(async () => [dev('usb-a', '/dev/video1')], onChange)
    await w.poll()
    await w.poll()
    await w.poll()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('emits when a device is plugged in', async () => {
    const lists: Device[][] = [
      [dev('usb-a', '/dev/video1')],
      [dev('usb-a', '/dev/video1'), dev('usb-b', '/dev/video5')],
    ]
    let i = 0
    const onChange = vi.fn()
    const w = new DeviceWatcher(async () => lists[Math.min(i++, lists.length - 1)], onChange)
    await w.poll()
    await w.poll()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange.mock.calls[1][0]).toHaveLength(2)
  })

  it('emits when a device is unplugged', async () => {
    const lists: Device[][] = [
      [dev('usb-a', '/dev/video1'), dev('usb-b', '/dev/video5')],
      [dev('usb-a', '/dev/video1')],
    ]
    let i = 0
    const onChange = vi.fn()
    const w = new DeviceWatcher(async () => lists[Math.min(i++, lists.length - 1)], onChange)
    await w.poll()
    await w.poll()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange.mock.calls[1][0]).toHaveLength(1)
  })

  it('emits when a device reappears on a different node (replug renumbering)', async () => {
    const lists: Device[][] = [[dev('usb-a', '/dev/video5')], [dev('usb-a', '/dev/video7')]]
    let i = 0
    const onChange = vi.fn()
    const w = new DeviceWatcher(async () => lists[Math.min(i++, lists.length - 1)], onChange)
    await w.poll()
    await w.poll()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange.mock.calls[1][0][0].captureNode).toBe('/dev/video7')
  })

  it('swallows a failed listing and keeps the previous state', async () => {
    let fail = false
    const onChange = vi.fn()
    const w = new DeviceWatcher(async () => {
      if (fail) throw new Error('sysfs went away')
      return [dev('usb-a', '/dev/video1')]
    }, onChange)
    await w.poll()
    fail = true
    await expect(w.poll()).resolves.toBeUndefined()
    fail = false
    await w.poll()
    // recovery to the same list is not a change
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('polls on an interval after start() and stops after stop()', async () => {
    vi.useFakeTimers()
    try {
      const onChange = vi.fn()
      let i = 0
      const w = new DeviceWatcher(async () => [dev(`usb-${i++}`, '/dev/video1')], onChange, 1000)
      w.start()
      await vi.advanceTimersByTimeAsync(0) // initial poll
      await vi.advanceTimersByTimeAsync(3000)
      expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(3)
      const seen = onChange.mock.calls.length
      w.stop()
      await vi.advanceTimersByTimeAsync(5000)
      expect(onChange).toHaveBeenCalledTimes(seen)
    } finally {
      vi.useRealTimers()
    }
  })

  it('start() is idempotent', async () => {
    vi.useFakeTimers()
    try {
      const list = vi.fn(async () => [dev('usb-a', '/dev/video1')])
      const w = new DeviceWatcher(list, () => {}, 1000)
      w.start()
      w.start()
      await vi.advanceTimersByTimeAsync(1000)
      // one immediate poll per start() guard + one interval tick — not doubled
      expect(list.mock.calls.length).toBeLessThanOrEqual(2)
      w.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
