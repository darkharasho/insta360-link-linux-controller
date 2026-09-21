import { describe, it, expect } from 'vitest'
import { listControlsArgv, setControlArgv, setControlsArgv, getControlArgv } from './v4l2-argv'

describe('v4l2 argv', () => {
  it('lists controls for a device', () =>
    expect(listControlsArgv('/dev/video1')).toEqual(['-d', '/dev/video1', '--list-ctrls-menus']))
  it('sets a control', () =>
    expect(setControlArgv('/dev/video1', 'zoom_absolute', 200))
      .toEqual(['-d', '/dev/video1', '--set-ctrl', 'zoom_absolute=200']))
  it('sets several controls in one ioctl, comma-separated', () =>
    // pan/tilt are two halves of one UVC control: split across two --set-ctrl
    // arguments they become two ioctls, and the single-axis one fails.
    expect(setControlsArgv('/dev/video5', [['pan_absolute', 7200], ['tilt_absolute', -3600]]))
      .toEqual(['-d', '/dev/video5', '--set-ctrl', 'pan_absolute=7200,tilt_absolute=-3600']))
  it('gets a control', () =>
    expect(getControlArgv('/dev/video1', 'pan_absolute'))
      .toEqual(['-d', '/dev/video1', '--get-ctrl', 'pan_absolute']))
})
