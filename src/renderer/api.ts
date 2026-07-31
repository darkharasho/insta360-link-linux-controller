import type { CameraApi } from '../shared/ipc'
import type { VcamApi } from '../shared/vcam-ipc'

export interface WindowControls {
  minimize(): void
  toggleMaximize(): void
  close(): void
}

declare global {
  interface Window {
    cameraApi: CameraApi
    windowControls: WindowControls
    vcamApi: VcamApi
  }
}

export const cameraApi: CameraApi = window.cameraApi
export const windowControls: WindowControls = window.windowControls
export const vcamApi: VcamApi = window.vcamApi
