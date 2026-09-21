export function listControlsArgv(dev: string): string[] {
  return ['-d', dev, '--list-ctrls-menus']
}

/**
 * Write several controls in one ioctl. v4l2-ctl turns a single comma-separated
 * --set-ctrl into one VIDIOC_S_EXT_CTRLS, which is what pan/tilt need: they are
 * two halves of one UVC control. See CameraService.setPosition.
 */
export function setControlsArgv(dev: string, entries: Array<[string, number]>): string[] {
  return ['-d', dev, '--set-ctrl', entries.map(([n, v]) => `${n}=${v}`).join(',')]
}

export function setControlArgv(dev: string, name: string, value: number): string[] {
  return setControlsArgv(dev, [[name, value]])
}

export function getControlArgv(dev: string, name: string): string[] {
  return ['-d', dev, '--get-ctrl', name]
}
