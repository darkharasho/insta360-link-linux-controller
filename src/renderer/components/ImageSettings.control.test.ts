import { describe, it, expect } from 'vitest'
import { widgetFor } from './widget'
import type { Control } from '../../shared/types'

const int: Control = { name: 'brightness', kind: 'int', value: 50, min: 0, max: 100, step: 1, inactive: false }
const bool: Control = { name: 'wb_auto', kind: 'bool', value: 1, inactive: false }
const menu: Control = { name: 'plf', kind: 'menu', value: 2, menu: { 0: 'Off', 1: '50', 2: '60' }, inactive: false }

describe('widgetFor', () => {
  it('maps int to slider', () => expect(widgetFor(int)).toBe('slider'))
  it('maps bool to switch', () => expect(widgetFor(bool)).toBe('switch'))
  it('maps menu to select', () => expect(widgetFor(menu)).toBe('select'))
})
