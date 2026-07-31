import type { CameraApi } from '../shared/ipc'

export interface WindowControls {
  minimize(): void
  toggleMaximize(): void
  close(): void
}

declare global {
  interface Window {
    cameraApi: CameraApi
    windowControls: WindowControls
  }
}

export const cameraApi: CameraApi = window.cameraApi
export const windowControls: WindowControls = window.windowControls
