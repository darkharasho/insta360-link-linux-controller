import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { xuArgv, type XuCommand } from './xu-argv'

const pExecFile = promisify(execFile)
export type Runner = (bin: string, argv: string[]) => Promise<string>
const defaultRunner: Runner = async (bin, argv) => (await pExecFile(bin, argv)).stdout

export class XuAdapter {
  constructor(private binPath: string, private run: Runner = defaultRunner) {}
  async send(dev: string, cmd: XuCommand): Promise<void> {
    const argv = xuArgv(dev, cmd) // throws before spawn on invalid input
    await this.run(this.binPath, argv)
  }
}
