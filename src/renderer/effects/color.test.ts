import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  NEUTRAL_COLOR,
  isNeutral,
  sanitizeColor,
  colorMatrixValues,
  colorFilterMarkup,
  loadColor,
  saveColor,
  type ColorCorrection,
} from './color.js'

const cc = (over: Partial<ColorCorrection>): ColorCorrection => ({ ...NEUTRAL_COLOR, ...over })

const matrix = (c: ColorCorrection): number[] => colorMatrixValues(c).split(' ').map(Number)

describe('color correction math', () => {
  it('neutral settings are neutral and map to the identity matrix', () => {
    expect(isNeutral(NEUTRAL_COLOR)).toBe(true)
    const m = matrix(NEUTRAL_COLOR)
    expect(m).toHaveLength(20)
    // prettier-ignore
    expect(m).toEqual([
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0,
    ])
  })

  it('any moved slider is non-neutral', () => {
    expect(isNeutral(cc({ temperature: 5 }))).toBe(false)
    expect(isNeutral(cc({ tint: -5 }))).toBe(false)
    expect(isNeutral(cc({ saturation: 10 }))).toBe(false)
    expect(isNeutral(cc({ gamma: 1.1 }))).toBe(false)
  })

  it('warm temperature boosts red and cuts blue; cool does the opposite', () => {
    const warm = matrix(cc({ temperature: 100 }))
    expect(warm[0]).toBeGreaterThan(1)
    expect(warm[12]).toBeLessThan(1)
    const cool = matrix(cc({ temperature: -100 }))
    expect(cool[0]).toBeLessThan(1)
    expect(cool[12]).toBeGreaterThan(1)
  })

  it('magenta tint cuts green; green tint boosts it', () => {
    expect(matrix(cc({ tint: 100 }))[6]).toBeLessThan(1)
    expect(matrix(cc({ tint: -100 }))[6]).toBeGreaterThan(1)
  })

  it('saturation -100 collapses every row to the Rec.709 luma weights', () => {
    const m = matrix(cc({ saturation: -100 }))
    for (const row of [0, 5, 10]) {
      expect(m[row + 0]).toBeCloseTo(0.2126, 4)
      expect(m[row + 1]).toBeCloseTo(0.7152, 4)
      expect(m[row + 2]).toBeCloseTo(0.0722, 4)
    }
  })

  it('saturation alone preserves white (rows sum to 1)', () => {
    for (const saturation of [-60, 40, 100]) {
      const m = matrix(cc({ saturation }))
      for (const row of [0, 5, 10]) {
        expect(m[row] + m[row + 1] + m[row + 2]).toBeCloseTo(1, 6)
      }
    }
  })

  it('temperature and saturation compose (gain scales the saturated row)', () => {
    const m = matrix(cc({ temperature: 100, saturation: -100 }))
    expect(m[0]).toBeCloseTo(1.3 * 0.2126, 4)
    expect(m[1]).toBeCloseTo(1.3 * 0.7152, 4)
    expect(m[2]).toBeCloseTo(1.3 * 0.0722, 4)
  })
})

describe('colorFilterMarkup', () => {
  it('emits an sRGB filter with the matrix and the given id', () => {
    const svg = colorFilterMarkup('cc-1', cc({ temperature: 50 }))
    expect(svg).toContain('id="cc-1"')
    expect(svg).toContain('color-interpolation-filters="sRGB"')
    expect(svg).toContain(`values="${colorMatrixValues(cc({ temperature: 50 }))}"`)
  })

  it('omits the gamma stage when gamma is 1 and includes it otherwise', () => {
    expect(colorFilterMarkup('x', NEUTRAL_COLOR)).not.toContain('feComponentTransfer')
    const withGamma = colorFilterMarkup('x', cc({ gamma: 1.3 }))
    expect(withGamma).toContain('feComponentTransfer')
    for (const fn of ['feFuncR', 'feFuncG', 'feFuncB']) {
      expect(withGamma).toContain(`<${fn} type="gamma" exponent="1.3" amplitude="1" offset="0"/>`)
    }
  })
})

describe('sanitizeColor', () => {
  it('clamps out-of-range values into the supported ranges', () => {
    expect(sanitizeColor({ temperature: 500, tint: -500, saturation: 101, gamma: 9 })).toEqual({
      temperature: 100, tint: -100, saturation: 100, gamma: 2,
    })
  })
  it('replaces garbage with neutral values', () => {
    expect(sanitizeColor(undefined)).toEqual(NEUTRAL_COLOR)
    expect(sanitizeColor({ temperature: NaN, tint: 'x', gamma: null })).toEqual(NEUTRAL_COLOR)
  })
})

describe('per-device persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns neutral when no storage is available', () => {
    expect(loadColor('usb-a')).toEqual(NEUTRAL_COLOR)
  })

  it('round-trips a saved correction per device id', () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
    })
    const c = cc({ temperature: -30, gamma: 1.2 })
    saveColor('usb-a', c)
    expect(loadColor('usb-a')).toEqual(c)
    expect(loadColor('usb-other')).toEqual(NEUTRAL_COLOR)
  })

  it('sanitizes corrupt stored json', () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
    })
    saveColor('usb-a', cc({ temperature: 10 }))
    backing.set([...backing.keys()][0], '{"temperature":9999,"gamma":"zzz"}')
    expect(loadColor('usb-a')).toEqual(cc({ temperature: 100 }))
  })
})
