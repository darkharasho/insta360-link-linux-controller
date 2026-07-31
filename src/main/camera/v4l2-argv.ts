export function listDevicesArgv(): string[] {
  return ['--list-devices']
}

export function listControlsArgv(dev: string): string[] {
  return ['-d', dev, '--list-ctrls-menus']
}

export function setControlArgv(dev: string, name: string, value: number): string[] {
  return ['-d', dev, '--set-ctrl', `${name}=${value}`]
}

export function getControlArgv(dev: string, name: string): string[] {
  return ['-d', dev, '--get-ctrl', name]
}
