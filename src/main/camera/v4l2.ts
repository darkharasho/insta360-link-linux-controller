import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Device, Control } from '../../shared/types'
import { parseListDevices, parseControls } from './v4l2-parse'
import { listDevicesArgv, listControlsArgv, setControlArgv } from './v4l2-argv'

const pExecFile = promisify(execFile)
export type Runner = (bin: string, argv: string[]) => Promise<string>
const defaultRunner: Runner = async (bin, argv) => (await pExecFile(bin, argv)).stdout

export class V4l2Adapter {
  constructor(private run: Runner = defaultRunner) {}
  async listDevices(): Promise<Device[]> {
    return parseListDevices(await this.run('v4l2-ctl', listDevicesArgv()))
  }
  async getControls(dev: string): Promise<Control[]> {
    return parseControls(await this.run('v4l2-ctl', listControlsArgv(dev)))
  }
  async setControl(dev: string, name: string, value: number): Promise<void> {
    await this.run('v4l2-ctl', setControlArgv(dev, name, value))
  }
}
