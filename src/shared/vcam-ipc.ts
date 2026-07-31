export const VCAM_CH = {
  status: 'vcam:status',
  start: 'vcam:start',
  stop: 'vcam:stop',
  /** Fire-and-forget RGBA frame push (ipcRenderer.send, not invoke). */
  frame: 'vcam:frame',
} as const

export interface VcamStatus {
  deviceFound: boolean
  devicePath: string | null
  ffmpegFound: boolean
  running: boolean
}

export interface VcamApi {
  status(): Promise<VcamStatus>
  start(width: number, height: number, fps: number): Promise<VcamStatus>
  stop(): Promise<void>
  sendFrame(data: Uint8Array): void
}
