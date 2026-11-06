import { describe, it, expect } from 'vitest'
import { widgetFor, labelFor, menuFor } from './widget'
import type { Control } from '../../shared/types'

const int: Control = { name: 'brightness', kind: 'int', value: 50, min: 0, max: 100, step: 1, inactive: false }
const bool: Control = { name: 'wb_auto', kind: 'bool', value: 1, inactive: false }
const menu: Control = { name: 'plf', kind: 'menu', value: 2, menu: { 0: 'Off', 1: '50', 2: '60' }, inactive: false }

describe('widgetFor', () => {
  it('maps int to slider', () => expect(widgetFor(int)).toBe('slider'))
  it('maps bool to switch', () => expect(widgetFor(bool)).toBe('switch'))
  it('maps menu to select', () => expect(widgetFor(menu)).toBe('select'))
  it('maps an on/off int (0..1) to switch', () =>
    expect(widgetFor({ ...int, name: 'backlight_compensation', min: 0, max: 1 })).toBe('switch'))
})

describe('menuFor', () => {
  it('names exposure modes the way Camera Hub does', () => {
    const ae: Control = { name: 'auto_exposure', kind: 'menu', value: 3, menu: { 1: 'Manual Mode', 3: 'Aperture Priority Mode' }, inactive: false }
    expect(menuFor(ae)).toEqual({ 1: 'Manual', 3: 'Auto' })
  })
  it('leaves other menus alone', () => expect(menuFor(menu)).toEqual(menu.menu))
})

describe('labelFor', () => {
  it('gives v4l2 auto controls friendly names', () => {
    expect(labelFor('focus_automatic_continuous')).toBe('Auto focus')
    expect(labelFor('focus_absolute')).toBe('Manual focus')
    expect(labelFor('white_balance_automatic')).toBe('Auto white balance')
    expect(labelFor('white_balance_temperature')).toBe('White balance')
  })
  it('prettifies unknown control names', () => {
    expect(labelFor('backlight_compensation')).toBe('Backlight compensation')
  })
})
