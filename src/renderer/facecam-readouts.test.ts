import { describe, it, expect } from 'vitest'
import { mergeReadouts, formatShutter } from './facecam-readouts'

describe('mergeReadouts', () => {
  it('keeps the previous value where the new read is unavailable', () => {
    expect(
      mergeReadouts({ iso: 5, exposure: 1, wbKelvin: 4500, tint: 0 }, { iso: null, exposure: 2, wbKelvin: null, tint: 3 }),
    ).toEqual({ iso: 5, exposure: 2, wbKelvin: 4500, tint: 3 })
  })
  it('starts from nothing', () => {
    expect(mergeReadouts(null, { iso: 100, exposure: null, wbKelvin: null, tint: null })).toEqual({
      iso: 100, exposure: null, wbKelvin: null, tint: null,
    })
  })
})

describe('formatShutter', () => {
  it('shows 100 µs units as a shutter fraction', () => {
    expect(formatShutter(333)).toBe('1/30 s')
    expect(formatShutter(50)).toBe('1/200 s')
    expect(formatShutter(10000)).toBe('1 s')
  })
  it('shows a dash when unknown', () => expect(formatShutter(null)).toBe('—'))
})
