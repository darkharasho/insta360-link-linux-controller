import { describe, it, expect } from 'vitest'
import { PresetStore } from './presets'

describe('PresetStore', () => {
  it('saves and lists presets per device', () => {
    const s = new PresetStore()
    s.save('cam1', { name: 'Desk', values: { zoom_absolute: 200 } })
    expect(s.list('cam1')).toEqual([{ name: 'Desk', values: { zoom_absolute: 200 } }])
    expect(s.list('cam2')).toEqual([])
  })
  it('overwrites a preset with the same name', () => {
    const s = new PresetStore()
    s.save('cam1', { name: 'Desk', values: { zoom_absolute: 100 } })
    s.save('cam1', { name: 'Desk', values: { zoom_absolute: 400 } })
    expect(s.list('cam1')).toHaveLength(1)
    expect(s.list('cam1')[0].values.zoom_absolute).toBe(400)
  })
  it('removes a preset', () => {
    const s = new PresetStore()
    s.save('cam1', { name: 'Desk', values: {} })
    s.remove('cam1', 'Desk')
    expect(s.list('cam1')).toEqual([])
  })
})
