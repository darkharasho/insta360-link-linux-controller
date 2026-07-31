import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { V4l2Adapter } from './v4l2'

const devicesOut = readFileSync('tests/fixtures/list-devices.txt', 'utf8')
const ctrlsOut = readFileSync('tests/fixtures/list-ctrls.txt', 'utf8')

describe('V4l2Adapter', () => {
  it('lists devices via runner', async () => {
    const run = vi.fn().mockResolvedValue(devicesOut)
    const a = new V4l2Adapter(run)
    const d = await a.listDevices()
    expect(run).toHaveBeenCalledWith('v4l2-ctl', ['--list-devices'])
    expect(d).toHaveLength(2)
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
