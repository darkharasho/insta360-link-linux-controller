import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Store from 'electron-store'
import electronUpdater from 'electron-updater'
import { V4l2Adapter } from './camera/v4l2.js'
import { XuAdapter } from './camera/xu.js'
import { PresetStore, type AppPreset } from './camera/presets.js'
import { CameraService } from './camera/service.js'
import { registerIpc } from './ipc.js'
import { VcamService } from './vcam/service.js'
import { registerVcamIpc } from './vcam/ipc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveLinkXu(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'link-xu')
    : path.join(__dirname, '../../native/link-xu/link-xu')
}

function resolveIcon(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../icons/icon.png')
}

function registerWindowControls() {
  ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window:toggle-maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
}

function buildService(): CameraService {
  const store = new Store<{ presets: Record<string, AppPreset[]> }>({ defaults: { presets: {} }})
  const backend = new Map<string, AppPreset[]>(Object.entries(store.get('presets')))
  const presets = new PresetStore(backend)
  // persist on every mutation by re-serializing the map
  const persist = () => store.set('presets', Object.fromEntries(backend))
  const wrapped = new Proxy(presets, {
    get(target, prop, recv) {
      const val = Reflect.get(target, prop, recv)
      if (typeof val === 'function' && (prop === 'save' || prop === 'remove')) {
        return (...args: unknown[]) => { const r = (val as Function).apply(target, args); persist(); return r }
      }
      return typeof val === 'function' ? val.bind(target) : val
    },
  }) as PresetStore
  return new CameraService(new V4l2Adapter(), new XuAdapter(resolveLinkXu()), wrapped)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 960, minHeight: 640,
    backgroundColor: '#121212',
    frame: false,
    icon: resolveIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false,
    },
  })
  if (app.isPackaged) win.loadFile(path.join(__dirname, '../renderer/index.html'))
  else win.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173')
}

const vcam = new VcamService()

app.whenReady().then(() => {
  registerIpc(ipcMain, buildService())
  registerVcamIpc(ipcMain, vcam)
  registerWindowControls()
  createWindow()
  if (app.isPackaged) electronUpdater.autoUpdater.checkForUpdatesAndNotify()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => vcam.stop())
