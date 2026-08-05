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

  describe('migrate', () => {
    it('moves presets from a legacy key to the new key', () => {
      const s = new PresetStore()
      s.save('usb-old-port', { name: 'Desk', values: { zoom_absolute: 200 } })
      expect(s.migrate('usb-old-port', 'usb:2e1a:4c06')).toBe(true)
      expect(s.list('usb:2e1a:4c06')).toEqual([{ name: 'Desk', values: { zoom_absolute: 200 } }])
      expect(s.list('usb-old-port')).toEqual([])
    })
    it('is a no-op when the legacy key has nothing', () => {
      const s = new PresetStore()
      expect(s.migrate('usb-old-port', 'usb:2e1a:4c06')).toBe(false)
      expect(s.list('usb:2e1a:4c06')).toEqual([])
    })
    it('never overwrites data already present under the new key', () => {
      const s = new PresetStore()
      s.save('usb-old-port', { name: 'Legacy', values: {} })
      s.save('usb:2e1a:4c06', { name: 'Current', values: {} })
      expect(s.migrate('usb-old-port', 'usb:2e1a:4c06')).toBe(false)
      expect(s.list('usb:2e1a:4c06')).toEqual([{ name: 'Current', values: {} }])
      expect(s.list('usb-old-port')).toEqual([{ name: 'Legacy', values: {} }])
    })
    it('is a no-op when the keys are identical', () => {
      const s = new PresetStore()
      s.save('usb-same', { name: 'Desk', values: {} })
      expect(s.migrate('usb-same', 'usb-same')).toBe(false)
      expect(s.list('usb-same')).toEqual([{ name: 'Desk', values: {} }])
    })
  })
})
