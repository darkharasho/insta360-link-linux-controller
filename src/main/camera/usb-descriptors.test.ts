import { describe, it, expect } from 'vitest'
import { parseExtensionUnits, readExtensionUnits } from './usb-descriptors'

const hex = (...parts: string[]) => Uint8Array.from(parts.join('').match(/../g)!, (b) => parseInt(b, 16))

// Real descriptors from a Facecam 4K (fw 2.49), trimmed to what matters.
const VC_IFACE = '09040000010e010000'
const XU6 = '1d240606d09ee4237811314fae52d2fb8a8d30010e010404e707970000'
const XU7 = '1d2406076ad1492cb83285443ea8643a1523600216010404ff1df81f00'
const VS_IFACE = '09040100000e020000'
// VS_FORMAT_MJPEG shares subtype 0x06 with VC_EXTENSION_UNIT.
const VS_MJPEG = '0b24060107000100000001'

describe('parseExtensionUnits', () => {
  it('finds extension units by GUID inside the VideoControl interface only', () => {
    expect(parseExtensionUnits(hex(VC_IFACE, XU6, XU7, VS_IFACE, VS_MJPEG))).toEqual([
      { unit: 6, guid: '23e49ed0-1178-4f31-ae52-d2fb8a8d3001' },
      { unit: 7, guid: '2c49d16a-32b8-4485-3ea8-643a15236002' },
    ])
  })
  it('stops at a zero-length descriptor without throwing', () => {
    expect(parseExtensionUnits(hex(VC_IFACE, XU6, '0000', XU7))).toEqual([
      { unit: 6, guid: '23e49ed0-1178-4f31-ae52-d2fb8a8d3001' },
    ])
  })
  it('ignores a truncated trailing descriptor', () => {
    expect(parseExtensionUnits(hex(VC_IFACE, XU6.slice(0, 20)))).toEqual([])
  })
})

describe('readExtensionUnits', () => {
  it('reads the descriptors file under the USB device dir', async () => {
    const seen: string[] = []
    const units = await readExtensionUnits('/sys/devices/x/8-1.4', async (p) => {
      seen.push(p)
      return hex(VC_IFACE, XU6)
    })
    expect(seen).toEqual(['/sys/devices/x/8-1.4/descriptors'])
    expect(units).toEqual([{ unit: 6, guid: '23e49ed0-1178-4f31-ae52-d2fb8a8d3001' }])
  })
})
