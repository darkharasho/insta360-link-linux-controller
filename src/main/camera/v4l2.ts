import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Device, Control } from '../../shared/types.js'
import { parseListDevices, parseControls } from './v4l2-parse.js'
import { listDevicesArgv, listControlsArgv, setControlArgv } from './v4l2-argv.js'

const pExecFile = promisify(execFile)
export type Runner = (bin: string, argv: string[]) => Promise<string>
const defaultRunner: Runner = async (bin, argv) => (await pExecFile(bin, argv)).stdout

export class V4l2Adapter {
  constructor(private run: Runner = defaultRunner) {}
  async listDevices(): Promise<Device[]> {
    const devices = parseListDevices(await this.run('v4l2-ctl', listDevicesArgv()))
    // Best-effort: attach USB VID:PID so the renderer can match each camera to
    // its getUserMedia stream reliably (mediaDevices labels include "vid:pid").
    await Promise.all(devices.map((d) => this.attachUsbIds(d)))
    return devices
  }
  private async attachUsbIds(d: Device): Promise<void> {
    try {
      const out = await this.run('udevadm', ['info', '--query=property', `--name=${d.captureNode}`])
      d.vendorId = out.match(/^ID_VENDOR_ID=([0-9a-fA-F]+)/m)?.[1]?.toLowerCase()
      d.productId = out.match(/^ID_MODEL_ID=([0-9a-fA-F]+)/m)?.[1]?.toLowerCase()
    } catch {
      // udevadm unavailable or failed — matching falls back to the name.
    }
  }
  async getControls(dev: string): Promise<Control[]> {
    return parseControls(await this.run('v4l2-ctl', listControlsArgv(dev)))
  }
  async setControl(dev: string, name: string, value: number): Promise<void> {
    await this.run('v4l2-ctl', setControlArgv(dev, name, value))
  }
}
