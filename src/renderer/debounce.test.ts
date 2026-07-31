import { describe, it, expect, vi } from 'vitest'
import { makeDebouncer } from './debounce'

describe('makeDebouncer', () => {
  it('coalesces rapid calls per key', async () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = makeDebouncer(fn, 60)
    d('zoom_absolute', 100); d('zoom_absolute', 200); d('zoom_absolute', 300)
    vi.advanceTimersByTime(60)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('zoom_absolute', 300)
    vi.useRealTimers()
  })
  it('keeps different keys independent', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = makeDebouncer(fn, 60)
    d('zoom_absolute', 100); d('pan_absolute', 5)
    vi.advanceTimersByTime(60)
    expect(fn).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
