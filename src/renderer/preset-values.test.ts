import { describe, it, expect } from 'vitest'
import { presetValuesFor } from './preset-values'
import type { Control } from '../shared/types'

const c = (name: string, value: number, inactive = false): Control => ({ name, kind: 'int', value, inactive })
const controls = [c('pan_absolute', 3600), c('tilt_absolute', 0), c('zoom_absolute', 200), c('contrast', 120), c('white_balance_temperature', 4500, true)]

describe('presetValuesFor', () => {
  it('keeps framing only for the Facecam', () => {
    expect(presetValuesFor('elgato-facecam-4k', controls)).toEqual({ pan_absolute: 3600, tilt_absolute: 0, zoom_absolute: 200 })
  })
  it('keeps every active control for a Link, as before', () => {
    expect(presetValuesFor('insta360-link', controls)).toEqual({ pan_absolute: 3600, tilt_absolute: 0, zoom_absolute: 200, contrast: 120 })
  })
})

import { framingHome } from './preset-values'
describe('framingHome', () => {
  it('returns pan, tilt and zoom defaults', () => {
    const cs: Control[] = [
      { name: 'pan_absolute', kind: 'int', value: 3600, default: 0, inactive: false },
      { name: 'zoom_absolute', kind: 'int', value: 250, default: 100, inactive: false },
      { name: 'contrast', kind: 'int', value: 1, default: 2, inactive: false },
    ]
    expect(framingHome(cs)).toEqual([['pan_absolute', 0], ['zoom_absolute', 100]])
  })
})
