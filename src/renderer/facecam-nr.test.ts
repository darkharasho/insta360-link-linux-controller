import { describe, it, expect } from 'vitest'
import { NR_PRESETS, nrPresetFor } from './facecam-nr'

describe('noise reduction presets', () => {
  it('recognises the preset a 2D/3D pair belongs to', () => {
    expect(nrPresetFor(0, 0)).toBe('off')
    expect(nrPresetFor(30, 30)).toBe('low')
    expect(nrPresetFor(50, 50)).toBe('medium')
    expect(nrPresetFor(80, 80)).toBe('high')
  })
  it('calls any other pair custom', () => expect(nrPresetFor(30, 50)).toBe('custom'))
  it('defines each preset as [2D, 3D]', () => expect(NR_PRESETS.low).toEqual([30, 30]))
})
