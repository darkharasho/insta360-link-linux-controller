import { describe, it, expect } from 'vitest'
import { decodeLE, encodeLE, decodeInfo } from './facecam-map'
import { FacecamAdapter } from './facecam'
import type { XuAdapter } from './xu'
import type { ExtensionUnit } from './usb-descriptors'

const IMAGE = '23e49ed0-1178-4f31-ae52-d2fb8a8d3001'
const DEVICE = '2c49d16a-32b8-4485-3ea8-643a15236002'
const DEV = '/dev/video8'
const USB = { path: '/sys/devices/x/8-1.4.3.4', devnum: '44' }

/** Info block: fw 2.49 in bytes 0-1, serial as ASCII at byte 32. */
function infoHex(): string {
  const b = new Uint8Array(100)
  b[0] = 0x02
  b[1] = 0x31
  new TextEncoder().encode('A9T9D62710MUGG').forEach((c, i) => (b[32 + i] = c))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

const IMAGE_READS: Record<number, string> = {
  2: 'sel=2 len=1 info=03 cur=01 min=00 max=02 def=00',
  18: 'sel=18 len=2 info=03 cur=d4fe min=d4fe max=2c01 def=0000',
  21: 'sel=21 len=1 info=03 cur=00 min=00 max=01 def=00',
  8: 'sel=8 len=4 info=03 cur=64000000 min=64000000 max=64000000 def=64000000',
  11: 'sel=11 len=4 info=03 cur=4d010000 min=4d010000 max=4d010000 def=4d010000',
  17: 'sel=17 len=4 info=03 cur=ffffffff min=ffffffff max=ffffffff def=ffffffff',
  19: 'sel=19 len=4 info=01 cur=d4feffff min=d4feffff max=2c010000 def=00000000',
}
const DEVICE_READS: Record<number, string> = {
  1: `sel=1 len=100 info=01 cur=${infoHex()}`,
  3: 'sel=3 len=1 info=03 cur=1e min=00 max=64 def=1e',
  20: 'sel=20 len=1 info=03 cur=1e min=00 max=64 def=1e',
}

function setup(opts: { units?: ExtensionUnit[]; image?: Record<number, string> } = {}) {
  const calls: string[][] = []
  const unitReads: string[] = []
  const units = opts.units ?? [{ unit: 6, guid: IMAGE }, { unit: 7, guid: DEVICE }]
  const imageUnit = units.find((u) => u.guid === IMAGE)!.unit
  const image = { ...IMAGE_READS, ...opts.image }
  const xu = {
    async query(argv: string[]) {
      calls.push(argv)
      if (argv[1] !== 'xu-get') return ''
      const table = Number(argv[2]) === imageUnit ? image : DEVICE_READS
      return argv[3].split(',').map((s) => table[Number(s)] ?? `sel=${s} err=Broken pipe`).join('\n') + '\n'
    },
  } as unknown as XuAdapter
  const adapter = new FacecamAdapter(xu, async (p) => {
    unitReads.push(p)
    return units
  })
  return { adapter, calls, unitReads, sets: () => calls.filter((c) => c[1] === 'xu-set') }
}

describe('facecam encoding', () => {
  it('decodes signed little-endian int16', () => expect(decodeLE(Uint8Array.of(0xd4, 0xfe), true)).toBe(-300))
  it('decodes unsigned uint32', () => expect(decodeLE(Uint8Array.of(0x4d, 0x01, 0, 0), false)).toBe(333))
  it('treats all-0xff as unavailable', () => {
    expect(decodeLE(Uint8Array.of(0xff, 0xff), true)).toBeNull()
    expect(decodeLE(Uint8Array.of(0xff), false)).toBeNull()
  })
  it('encodes little-endian hex', () => {
    expect(encodeLE(-300, 2, true)).toBe('d4fe')
    expect(encodeLE(100, 2, true)).toBe('6400')
    expect(encodeLE(45, 1, false)).toBe('2d')
  })
  it('decodes firmware and serial from the info block', () => {
    const b = Uint8Array.from(infoHex().match(/../g)!, (x) => parseInt(x, 16))
    expect(decodeInfo(b)).toEqual({ firmware: '2.49', serial: 'A9T9D62710MUGG' })
  })
})

describe('FacecamAdapter', () => {
  it('reports firmware, serial and every supported control', async () => {
    const { adapter } = setup()
    const s = await adapter.state(DEV, USB)
    expect(s.firmware).toBe('2.49')
    expect(s.serial).toBe('A9T9D62710MUGG')
    expect(s.controls).toContainEqual({ key: 'tint', value: -300, min: -300, max: 300, default: 0 })
    expect(s.controls).toContainEqual({ key: 'metering', value: 1, min: 0, max: 2, default: 0 })
    expect(s.controls).toContainEqual({ key: 'nr3d', value: 30, min: 0, max: 100, default: 30 })
    expect(s.controls.map((c) => c.key)).toContain('hdr')
  })
  it('omits a control whose range is fixed (firmware without it)', async () => {
    const { adapter } = setup({ image: { 21: 'sel=21 len=1 info=03 cur=00 min=00 max=00 def=00' } })
    const s = await adapter.state(DEV, USB)
    expect(s.controls.map((c) => c.key)).not.toContain('hdr')
  })
  it('omits a control the camera fails to read', async () => {
    const { adapter } = setup({ image: { 18: 'sel=18 err=Broken pipe' } })
    expect((await adapter.state(DEV, USB)).controls.map((c) => c.key)).not.toContain('tint')
  })
  it('writes tint as signed int16 to the image unit found by GUID', async () => {
    const { adapter, sets } = setup()
    await adapter.set(DEV, USB, 'tint', -300)
    expect(sets()).toEqual([[DEV, 'xu-set', '6', '18', 'd4fe']])
  })
  it('resolves unit ids by GUID, not position (MK.2 layout)', async () => {
    const { adapter, sets } = setup({ units: [{ unit: 7, guid: IMAGE }, { unit: 8, guid: DEVICE }] })
    await adapter.set(DEV, USB, 'nr2d', 45)
    expect(sets()).toEqual([[DEV, 'xu-set', '8', '3', '2d']])
  })
  it('clamps writes to the camera-reported range', async () => {
    const { adapter, sets } = setup()
    await adapter.set(DEV, USB, 'tint', 9999)
    expect(sets()).toEqual([[DEV, 'xu-set', '6', '18', '2c01']])
  })
  it('caches unit ids per USB path + devnum, re-reading after a replug', async () => {
    const { adapter, unitReads } = setup()
    await adapter.set(DEV, USB, 'hdr', 1)
    await adapter.set(DEV, USB, 'hdr', 0)
    expect(unitReads).toHaveLength(1)
    await adapter.set(DEV, { ...USB, devnum: '45' }, 'hdr', 1)
    expect(unitReads).toHaveLength(2)
  })
  it('refuses keys outside the allowlist without writing', async () => {
    const { adapter, sets } = setup()
    await expect(adapter.set(DEV, USB, 'bogus' as never, 1)).rejects.toThrow(/unknown facecam control/)
    expect(sets()).toEqual([])
  })
  it('rejects when the camera lacks a required extension unit', async () => {
    const { adapter } = setup({ units: [{ unit: 6, guid: IMAGE }] })
    await expect(adapter.set(DEV, USB, 'nr2d', 1)).rejects.toThrow(/extension unit/)
  })
  it('saves to flash with device selector 7, payload 01', async () => {
    const { adapter, sets } = setup()
    await adapter.save(DEV, USB)
    expect(sets()).toEqual([[DEV, 'xu-set', '7', '7', '01']])
  })
  it('reads live readouts, unavailable values as null', async () => {
    const { adapter } = setup()
    expect(await adapter.readouts(DEV, USB)).toEqual({ iso: 100, exposure: 333, wbKelvin: null, tint: -300 })
  })
})
