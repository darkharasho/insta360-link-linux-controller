import { describe, it, expect } from 'vitest'
import { listCameraDevices, findLoopbackDevice, type SysfsIo } from './sysfs'

const PCI = '/sys/devices/pci0000:00/0000:00:08.1/0000:11:00.4'
const PRO_DEV = `${PCI}/usb7/7-1/7-1.4/7-1.4.1/7-1.4.1.1`
const LINK_DEV = `${PCI}/usb7/7-1/7-1.4/7-1.4.3/7-1.4.3.4`
const ELGATO_DEV = `${PCI}/usb8/8-1/8-1.4/8-1.4.3/8-1.4.3.3`

interface NodeSpec { name: string; index: number; real: string }

// Models the machine's real layout: sysfs card names are truncated to 31
// chars and metadata nodes share the capture node's USB interface.
const NODES: Record<string, NodeSpec> = {
  video0: { name: 'OBS Virtual Camera', index: 0, real: '/sys/devices/virtual/video4linux/video0' },
  video1: { name: 'Insta360 Link 2 Pro: Insta360 L', index: 0, real: `${PRO_DEV}/7-1.4.1.1:1.0/video4linux/video1` },
  video2: { name: 'Insta360 Link 2 Pro: Insta360 L', index: 1, real: `${PRO_DEV}/7-1.4.1.1:1.0/video4linux/video2` },
  video3: { name: 'Elgato Game Capture Neo: Elgato', index: 0, real: `${ELGATO_DEV}/8-1.4.3.3:1.0/video4linux/video3` },
  video4: { name: 'Elgato Game Capture Neo: Elgato', index: 1, real: `${ELGATO_DEV}/8-1.4.3.3:1.0/video4linux/video4` },
  video5: { name: 'Insta360 Link 2: Insta360 Link ', index: 0, real: `${LINK_DEV}/7-1.4.3.4:1.0/video4linux/video5` },
  video6: { name: 'Insta360 Link 2: Insta360 Link ', index: 1, real: `${LINK_DEV}/7-1.4.3.4:1.0/video4linux/video6` },
  video7: { name: 'Insta360 Link Filtered', index: 0, real: '/sys/devices/virtual/video4linux/video7' },
}

const USB_IDS: Record<string, string> = {
  [`${PRO_DEV}/idVendor`]: '2e1a\n',
  [`${PRO_DEV}/idProduct`]: '4c06\n',
  [`${LINK_DEV}/idVendor`]: '2e1a\n',
  [`${LINK_DEV}/idProduct`]: '4c04\n',
}

function fakeIo(nodes: Record<string, NodeSpec> = NODES, files: Record<string, string> = USB_IDS): SysfsIo {
  return {
    async readdir(p) {
      if (p !== '/sys/class/video4linux') throw new Error(`ENOENT: ${p}`)
      return Object.keys(nodes)
    },
    async readFile(p) {
      const m = p.match(/^\/sys\/class\/video4linux\/(video\d+)\/(name|index)$/)
      if (m) {
        const spec = nodes[m[1]]
        if (!spec) throw new Error(`ENOENT: ${p}`)
        return m[2] === 'name' ? `${spec.name}\n` : `${spec.index}\n`
      }
      if (p in files) return files[p]
      throw new Error(`ENOENT: ${p}`)
    },
    async realpath(p) {
      const spec = nodes[p.match(/^\/sys\/class\/video4linux\/(video\d+)$/)?.[1] ?? '']
      if (!spec) throw new Error(`ENOENT: ${p}`)
      return spec.real
    },
  }
}

describe('listCameraDevices', () => {
  it('lists only Insta360 cameras, capture node first by index', async () => {
    const d = await listCameraDevices(fakeIo())
    expect(d.map((x) => x.label)).toEqual(['Insta360 Link 2 Pro', 'Insta360 Link 2'])
    expect(d.map((x) => x.name)).toEqual([
      'Insta360 Link 2 Pro: Insta360 L',
      'Insta360 Link 2: Insta360 Link',
    ])
    expect(d[0].captureNode).toBe('/dev/video1')
    expect(d[1].captureNode).toBe('/dev/video5')
    expect(d[0].nodes).toEqual(['/dev/video1', '/dev/video2'])
  })
  it('reconstructs the v4l2 bus_info id so preset keys stay stable', async () => {
    const d = await listCameraDevices(fakeIo())
    expect(d.map((x) => x.id)).toEqual([
      'usb-0000:11:00.4-1.4.1.1',
      'usb-0000:11:00.4-1.4.3.4',
    ])
  })
  it('attaches USB vid:pid read from sysfs', async () => {
    const d = await listCameraDevices(fakeIo())
    expect(d[0]).toMatchObject({ vendorId: '2e1a', productId: '4c06' })
    expect(d[1]).toMatchObject({ vendorId: '2e1a', productId: '4c04' })
  })
  it('excludes virtual devices even when named like an Insta360', async () => {
    const d = await listCameraDevices(fakeIo())
    expect(d.map((x) => x.label)).not.toContain('Insta360 Link Filtered')
    expect(d).toHaveLength(2)
  })
  it('still lists a camera when USB ids are unreadable', async () => {
    const d = await listCameraDevices(fakeIo(NODES, {}))
    expect(d).toHaveLength(2)
    expect(d[0].vendorId).toBeUndefined()
  })
  it('returns [] when the video4linux class is absent', async () => {
    const io = fakeIo()
    io.readdir = async () => { throw new Error('ENOENT') }
    expect(await listCameraDevices(io)).toEqual([])
  })
  it('skips nodes whose attributes vanish mid-scan', async () => {
    const io = fakeIo()
    const inner = io.readFile.bind(io)
    io.readFile = async (p) => {
      if (p.includes('/video5/')) throw new Error('ENOENT')
      return inner(p)
    }
    const d = await listCameraDevices(io)
    expect(d.map((x) => x.label)).toEqual(['Insta360 Link 2 Pro'])
  })
})

describe('findLoopbackDevice', () => {
  it('finds the loopback node by card label', async () => {
    expect(await findLoopbackDevice('Insta360 Link Filtered', fakeIo())).toBe('/dev/video7')
  })
  it('never matches a real camera, even with a matching name', async () => {
    const real: Record<string, NodeSpec> = {
      video1: { name: 'Insta360 Link Filtered', index: 0, real: `${PRO_DEV}/7-1.4.1.1:1.0/video4linux/video1` },
    }
    expect(await findLoopbackDevice('Insta360 Link Filtered', fakeIo(real, {}))).toBeNull()
  })
  it('returns null when no loopback exists', async () => {
    expect(await findLoopbackDevice('Some Other Vcam', fakeIo())).toBeNull()
  })
})
