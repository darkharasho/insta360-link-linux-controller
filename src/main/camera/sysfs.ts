import { readdir, readFile, realpath } from 'node:fs/promises'
import type { Device } from '../../shared/types.js'

/**
 * Camera discovery via sysfs only. Enumerating with `v4l2-ctl --list-devices`
 * opens every /dev/video* node (QUERYCAP), which wakes each camera — the
 * Insta360 Link lights its LED ring and raises the gimbal on any open. sysfs
 * exposes the same card name, node index, and USB ids without touching the
 * device nodes at all.
 */

export interface SysfsIo {
  readdir(path: string): Promise<string[]>
  readFile(path: string): Promise<string>
  realpath(path: string): Promise<string>
}

const defaultIo: SysfsIo = {
  readdir: (p) => readdir(p),
  readFile: (p) => readFile(p, 'utf8'),
  realpath: (p) => realpath(p),
}

const SYS_V4L = '/sys/class/video4linux'

interface VideoNode {
  dev: string
  num: number
  name: string
  /** Node index within its device: 0 = capture, 1+ = metadata. */
  index: number
  real: string
  virtual: boolean
}

async function scanNodes(io: SysfsIo): Promise<VideoNode[]> {
  let entries: string[]
  try {
    entries = await io.readdir(SYS_V4L)
  } catch {
    return [] // videodev not loaded — no video devices exist
  }
  const nodes: VideoNode[] = []
  for (const entry of entries) {
    const m = entry.match(/^video(\d+)$/)
    if (!m) continue
    try {
      const dir = `${SYS_V4L}/${entry}`
      const [name, index, real] = await Promise.all([
        io.readFile(`${dir}/name`),
        io.readFile(`${dir}/index`),
        io.realpath(dir),
      ])
      nodes.push({
        dev: `/dev/${entry}`,
        num: Number(m[1]),
        name: name.trim(),
        index: Number(index.trim()),
        real,
        virtual: real.includes('/devices/virtual/'),
      })
    } catch {
      // node vanished mid-scan or attributes unreadable — skip it
    }
  }
  return nodes.sort((a, b) => a.num - b.num)
}

/**
 * Rebuild the v4l2 bus_info ("usb-0000:11:00.4-1.4.1.1") from the node's
 * resolved sysfs path. Presets are keyed by this id, so it must match what
 * `v4l2-ctl --list-devices` used to report for the same camera.
 */
function usbBusInfo(real: string): string | null {
  const parts = real.split('/')
  const usbIdx = parts.findIndex((p) => /^usb\d+$/.test(p))
  if (usbIdx < 1 || parts.length < usbIdx + 3) return null
  const controller = parts[usbIdx - 1]
  const iface = parts[parts.length - 3]
  const devpath = iface.split(':')[0].replace(/^\d+-/, '')
  if (!devpath) return null
  return `usb-${controller}-${devpath}`
}

export async function listCameraDevices(io: SysfsIo = defaultIo): Promise<Device[]> {
  const nodes = await scanNodes(io)
  // Group capture + metadata nodes of one camera by their USB interface dir.
  const groups = new Map<string, VideoNode[]>()
  for (const n of nodes) {
    // Never list virtual outputs (v4l2loopback, OBS) as controllable cameras —
    // our own filtered virtual camera is deliberately named "Insta360 Link
    // Filtered" and would otherwise match the brand filter.
    if (n.virtual) continue
    if (!/Insta360 Link/i.test(n.name)) continue
    const key = n.real.split('/').slice(0, -2).join('/')
    const group = groups.get(key) ?? []
    group.push(n)
    groups.set(key, group)
  }
  const devices: Device[] = []
  for (const [ifaceDir, group] of groups) {
    // Without an index-0 node there is no capture node to control — a
    // metadata node must never be promoted to captureNode.
    const capture = group.find((n) => n.index === 0)
    if (!capture) continue
    const deviceDir = ifaceDir.split('/').slice(0, -1).join('/')
    const readId = (attr: string) =>
      io.readFile(`${deviceDir}/${attr}`).then((s) => s.trim().toLowerCase()).catch(() => undefined)
    const [vendorId, productId] = await Promise.all([readId('idVendor'), readId('idProduct')])
    devices.push({
      id: usbBusInfo(capture.real) ?? ifaceDir,
      name: capture.name,
      label: capture.name.split(':')[0].trim() || capture.name,
      captureNode: capture.dev,
      nodes: group.map((n) => n.dev),
      ...(vendorId ? { vendorId } : {}),
      ...(productId ? { productId } : {}),
    })
  }
  return devices.sort((a, b) => a.captureNode.localeCompare(b.captureNode, undefined, { numeric: true }))
}

/**
 * Find the capture node of a v4l2loopback device by its card label. Only
 * virtual devices match, so a real camera with a similar name can never be
 * picked as the virtual output.
 */
export async function findLoopbackDevice(name: string, io: SysfsIo = defaultIo): Promise<string | null> {
  const nodes = await scanNodes(io)
  return nodes.find((n) => n.virtual && n.name.startsWith(name))?.dev ?? null
}
