import type { IpcMain } from 'electron'
import { VCAM_CH } from '../../shared/vcam-ipc.js'
import type { VcamService } from './service.js'

export function registerVcamIpc(ipcMain: IpcMain, vcam: VcamService) {
  ipcMain.handle(VCAM_CH.status, () => vcam.status())
  ipcMain.handle(VCAM_CH.start, (_e, w: number, h: number, fps: number) => vcam.start(w, h, fps))
  ipcMain.handle(VCAM_CH.stop, () => vcam.stop())
  // Frames arrive as a high-rate one-way stream; invoke() overhead is wasted here.
  ipcMain.on(VCAM_CH.frame, (_e, data: Uint8Array) => vcam.frame(data))
}
