import type { CameraApi } from '../shared/ipc'
declare global { interface Window { cameraApi: CameraApi } }
export const cameraApi: CameraApi = window.cameraApi
