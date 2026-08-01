import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { findLoopbackDevice } from '../camera/sysfs.js'
import { ffmpegVcamArgv } from './ffmpeg-argv.js'

export const VCAM_NAME = 'Insta360 Link Filtered'

export interface VcamStatus {
  deviceFound: boolean
  devicePath: string | null
  ffmpegFound: boolean
  running: boolean
}

/** The minimal child-process surface the service uses (keeps SpawnFn mockable). */
export interface VcamChild {
  stdin: {
    write(data: Buffer): boolean
    end(): void
    on(event: string, listener: (...args: unknown[]) => void): unknown
  }
  stderr?: { on(event: 'data', listener: (data: Buffer) => void): unknown } | null
  on(event: 'exit', listener: (code: number | null) => void): unknown
  kill(signal?: NodeJS.Signals): unknown
}

export type SpawnFn = (bin: string, argv: string[]) => VcamChild

/** Locate ffmpeg on PATH plus common fallback locations (AppImage launches may lack a shell PATH). */
export function findFfmpeg(): string | null {
  const candidates = [
    ...(process.env.PATH ?? '').split(':').map((d) => path.join(d, 'ffmpeg')),
    '/home/linuxbrew/.linuxbrew/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ]
  return candidates.find((c) => c && existsSync(c)) ?? null
}

export class VcamService {
  private child: VcamChild | null = null
  private blocked = false

  constructor(
    // sysfs lookup: finding the loopback must never open camera nodes.
    private findDevice: (name: string) => Promise<string | null> = findLoopbackDevice,
    private spawnFn: SpawnFn = (bin, argv) => spawn(bin, argv, { stdio: ['pipe', 'ignore', 'pipe'] }),
    private ffmpegPath: () => string | null = findFfmpeg,
  ) {}

  async status(): Promise<VcamStatus> {
    let devicePath: string | null = null
    try {
      devicePath = await this.findDevice(VCAM_NAME)
    } catch {
      // sysfs scan can fail transiently; report as not found.
    }
    return {
      deviceFound: devicePath !== null,
      devicePath,
      ffmpegFound: this.ffmpegPath() !== null,
      running: this.child !== null,
    }
  }

  async start(width: number, height: number, fps: number): Promise<VcamStatus> {
    this.stop()
    const status = await this.status()
    if (!status.devicePath) throw new Error(`virtual camera device "${VCAM_NAME}" not found`)
    const ffmpeg = this.ffmpegPath()
    if (!ffmpeg) throw new Error('ffmpeg not found')

    const child = this.spawnFn(ffmpeg, ffmpegVcamArgv(status.devicePath, width, height, fps))
    child.stderr?.on('data', (d: Buffer) => console.error('[vcam ffmpeg]', d.toString().trim()))
    child.on('exit', (code) => {
      if (this.child === child) {
        this.child = null
        if (code) console.error(`[vcam] ffmpeg exited with code ${code}`)
      }
    })
    child.stdin.on('drain', () => { this.blocked = false })
    child.stdin.on('error', () => { /* EPIPE after ffmpeg dies; exit handler cleans up */ })
    this.child = child
    this.blocked = false
    return this.status()
  }

  /** Write one RGBA frame; drops frames while ffmpeg's stdin is backpressured. */
  frame(data: Uint8Array): void {
    if (!this.child || this.blocked) return
    const ok = this.child.stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    if (!ok) this.blocked = true
  }

  stop(): void {
    if (!this.child) return
    const child = this.child
    this.child = null
    try {
      child.stdin.end()
      child.kill('SIGTERM')
    } catch {
      // already dead
    }
  }
}
