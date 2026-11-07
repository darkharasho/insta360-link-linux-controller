import { describe, expect, it } from 'vitest'
import { outputSize } from './output-size'

describe('outputSize', () => {
  it('matches the on-screen pixel size instead of a fixed 960×540', () => {
    // 1600 css px on a 1× display, 4K source: draw 1600×900, not 960×540.
    expect(outputSize(3840, 2160, 1600, 1)).toEqual({ width: 1600, height: 900 })
  })

  it('counts device pixels on HiDPI screens', () => {
    expect(outputSize(3840, 2160, 1280, 2)).toEqual({ width: 2560, height: 1440 })
  })

  it('never upscales past the source resolution', () => {
    expect(outputSize(1280, 720, 2560, 1)).toEqual({ width: 1280, height: 720 })
  })

  it('keeps the source aspect ratio and even dimensions', () => {
    const s = outputSize(1920, 1440, 1001, 1)
    expect(s.width % 2).toBe(0)
    expect(s.height % 2).toBe(0)
    expect(s.width / s.height).toBeCloseTo(4 / 3, 1)
  })

  it('falls back to the source size when the canvas has no layout size yet', () => {
    expect(outputSize(1920, 1080, 0, 1)).toEqual({ width: 1920, height: 1080 })
  })
})
