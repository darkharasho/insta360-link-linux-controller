import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { V4l2Adapter } from './v4l2'

const ctrlsOut = readFileSync('tests/fixtures/list-ctrls.txt', 'utf8')

const sysfsIo = {
  readdir: async () => ['video1'],
  readFile: async (p: string) => {
    if (p.endsWith('/name')) return 'Insta360 Link 2: Insta360 Link \n'
    if (p.endsWith('/index')) return '0\n'
    throw new Error(`ENOENT: ${p}`)
  },
  realpath: async () =>
    '/sys/devices/pci0000:00/0000:00:08.1/0000:11:00.4/usb7/7-1/7-1.4.3.4/7-1.4.3.4:1.0/video4linux/video1',
}

describe('V4l2Adapter', () => {
  it('lists devices from sysfs without executing anything', async () => {
    const run = vi.fn()
    const d = await new V4l2Adapter(run, sysfsIo).listDevices()
    expect(d.map((x) => x.label)).toEqual(['Insta360 Link 2'])
    expect(run).not.toHaveBeenCalled()
  })
  it('gets controls for a device', async () => {
    const run = vi.fn().mockResolvedValue(ctrlsOut)
    const a = new V4l2Adapter(run)
    const c = await a.getControls('/dev/video1')
    expect(run).toHaveBeenCalledWith('v4l2-ctl', ['-d', '/dev/video1', '--list-ctrls-menus'])
    expect(c.find((x) => x.name === 'zoom_absolute')).toBeTruthy()
  })
  it('sets a control', async () => {
    const run = vi.fn().mockResolvedValue('')
    await new V4l2Adapter(run).setControl('/dev/video1', 'zoom_absolute', 300)
    expect(run).toHaveBeenCalledWith('v4l2-ctl', ['-d', '/dev/video1', '--set-ctrl', 'zoom_absolute=300'])
  })
})
