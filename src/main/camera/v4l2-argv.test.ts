import { describe, it, expect } from 'vitest'
import { listDevicesArgv, listControlsArgv, setControlArgv, getControlArgv } from './v4l2-argv'

describe('v4l2 argv', () => {
  it('lists devices', () => expect(listDevicesArgv()).toEqual(['--list-devices']))
  it('lists controls for a device', () =>
    expect(listControlsArgv('/dev/video1')).toEqual(['-d', '/dev/video1', '--list-ctrls-menus']))
  it('sets a control', () =>
    expect(setControlArgv('/dev/video1', 'zoom_absolute', 200))
      .toEqual(['-d', '/dev/video1', '--set-ctrl', 'zoom_absolute=200']))
  it('gets a control', () =>
    expect(getControlArgv('/dev/video1', 'pan_absolute'))
      .toEqual(['-d', '/dev/video1', '--get-ctrl', 'pan_absolute']))
})
