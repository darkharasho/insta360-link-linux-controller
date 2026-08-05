import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Store from 'electron-store'
import electronUpdater from 'electron-updater'
import { V4l2Adapter } from './camera/v4l2.js'
import { XuAdapter } from './camera/xu.js'
import { PresetStore, type AppPreset } from './camera/presets.js'
import { CameraService } from './camera/service.js'
import { DeviceWatcher } from './camera/watcher.js'
import { EV } from '../shared/ipc.js'
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
      if (typeof val === 'function' && (prop === 'save' || prop === 'remove' || prop === 'migrate')) {
        return (...args: unknown[]) => {
          const r = (val as Function).apply(target, args)
          // migrate() runs on every discovery poll but only moves data once —
          // persist only when it actually did, or config.json gets rewritten
          // every 2 s.
          if (prop !== 'migrate' || r === true) persist()
          return r
        }
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
  const service = buildService()
  registerIpc(ipcMain, service)
  registerVcamIpc(ipcMain, vcam)
  registerWindowControls()
  createWindow()
  // Hotplug: cameras plugged in (or unplugged) after launch must show up
  // without a restart. Polling is sysfs-only, so it never wakes a camera.
  const watcher = new DeviceWatcher(
    () => service.listDevices(),
    (devices) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(EV.devicesChanged, devices)
      }
    },
  )
  watcher.start()
  app.on('before-quit', () => watcher.stop())
  if (app.isPackaged) electronUpdater.autoUpdater.checkForUpdatesAndNotify()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => vcam.stop())
// A terminal SIGINT/SIGTERM must still run before-quit so the vcam ffmpeg
// child is stopped with the app instead of briefly outliving it.
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => app.quit())
