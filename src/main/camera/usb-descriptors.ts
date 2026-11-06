import { readFile } from 'node:fs/promises'

/**
 * UVC extension units from a USB device's raw descriptors
 * (`/sys/bus/usb/devices/<dev>/descriptors`). Reading this sysfs file never
 * opens the video node, so it is safe to do during discovery.
 *
 * Only descriptors inside a VideoControl interface (class 0x0e, subclass 0x01)
 * are considered: VideoStreaming interfaces reuse CS_INTERFACE subtype 0x06
 * for VS_FORMAT_MJPEG, which would otherwise read as a bogus unit.
 */
export interface ExtensionUnit {
  unit: number
  guid: string
}

const CS_INTERFACE = 0x24
const VC_EXTENSION_UNIT = 0x06
const INTERFACE = 0x04
const CC_VIDEO = 0x0e
const SC_VIDEOCONTROL = 0x01

const h = (b: Uint8Array, from: number, to: number) =>
  Array.from(b.subarray(from, to), (x) => x.toString(16).padStart(2, '0')).join('')
const hr = (b: Uint8Array, from: number, to: number) => h(b.slice(from, to).reverse(), 0, to - from)

/** GUIDs are stored with their first three fields little-endian. */
function guidAt(b: Uint8Array, o: number): string {
  return `${hr(b, o, o + 4)}-${hr(b, o + 4, o + 6)}-${hr(b, o + 6, o + 8)}-${h(b, o + 8, o + 10)}-${h(b, o + 10, o + 16)}`
}

export function parseExtensionUnits(buf: Uint8Array): ExtensionUnit[] {
  const units: ExtensionUnit[] = []
  let inVideoControl = false
  for (let i = 0; i + 2 <= buf.length; ) {
    const len = buf[i]
    if (len < 2 || i + len > buf.length) break
    const type = buf[i + 1]
    if (type === INTERFACE && len >= 9) {
      inVideoControl = buf[i + 5] === CC_VIDEO && buf[i + 6] === SC_VIDEOCONTROL
    } else if (inVideoControl && type === CS_INTERFACE && buf[i + 2] === VC_EXTENSION_UNIT && len >= 20) {
      units.push({ unit: buf[i + 3], guid: guidAt(buf, i + 4) })
    }
    i += len
  }
  return units
}

export type BinaryReader = (path: string) => Promise<Uint8Array>
const defaultReader: BinaryReader = (p) => readFile(p)

export async function readExtensionUnits(usbPath: string, read: BinaryReader = defaultReader): Promise<ExtensionUnit[]> {
  return parseExtensionUnits(await read(`${usbPath}/descriptors`))
}
