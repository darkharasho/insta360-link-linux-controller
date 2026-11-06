import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Device, Control, VideoMode } from '../../shared/types.js'
import { parseFormats, parseCurrentMode } from './formats.js'
import { parseControls } from './v4l2-parse.js'
import { listControlsArgv, setControlsArgv } from './v4l2-argv.js'
import { listCameraDevices, type SysfsIo } from './sysfs.js'

const pExecFile = promisify(execFile)
export type Runner = (bin: string, argv: string[]) => Promise<string>
const defaultRunner: Runner = async (bin, argv) => (await pExecFile(bin, argv)).stdout

export class V4l2Adapter {
  constructor(private run: Runner = defaultRunner, private sysfs?: SysfsIo) {}
  /** Discovery reads sysfs only — it must never open a /dev/video* node. */
  listDevices(): Promise<Device[]> {
    return listCameraDevices(this.sysfs)
  }
  async getControls(dev: string): Promise<Control[]> {
    return parseControls(await this.run('v4l2-ctl', listControlsArgv(dev)))
  }
  async setControl(dev: string, name: string, value: number): Promise<void> {
    await this.setControls(dev, [[name, value]])
  }
  /** Write several controls atomically, in one VIDIOC_S_EXT_CTRLS. */
  async setControls(dev: string, entries: Array<[string, number]>): Promise<void> {
    await this.run('v4l2-ctl', setControlsArgv(dev, entries))
  }
  /** MJPG capture modes the camera offers. Opens the node (fine for the Facecam). */
  async listModes(dev: string): Promise<VideoMode[]> {
    return parseFormats(await this.run('v4l2-ctl', ['-d', dev, '--list-formats-ext']))
  }
  /** The format last set on the node — meaningful only while someone holds it. */
  async currentMode(dev: string): Promise<VideoMode | null> {
    return parseCurrentMode(await this.run('v4l2-ctl', ['-d', dev, '--get-fmt-video', '--get-parm']))
  }
}
