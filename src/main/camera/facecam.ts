import type { FacecamControl, FacecamKey, FacecamReadouts, FacecamState } from '../../shared/types.js'
import type { XuAdapter } from './xu.js'
import { parseXuGet, xuGetArgv, xuSetArgv, type XuReading } from './xu-argv.js'
import { readExtensionUnits, type ExtensionUnit } from './usb-descriptors.js'
import {
  FACECAM_CONTROLS, FACECAM_GUID, FACECAM_INFO, FACECAM_READOUTS, FACECAM_SAVE,
  decodeInfo, decodeLE, encodeLE, type FacecamXu,
} from './facecam-map.js'

export interface FacecamUsb { path: string; devnum: string }
type UnitReader = (usbPath: string) => Promise<ExtensionUnit[]>

/** Elgato Facecam 4K vendor controls, via the generic xu-get/xu-set helper. */
export class FacecamAdapter {
  /** Unit ids per physical plug-in (path + devnum), resolved by GUID. */
  private units = new Map<string, Promise<Record<FacecamXu, number | undefined>>>()
  /** Last ranges read by state(), for clamping writes. */
  private ranges = new Map<string, Map<FacecamKey, { min: number; max: number }>>()

  constructor(private xu: XuAdapter, private readUnits: UnitReader = readExtensionUnits) {}

  private async unitOf(usb: FacecamUsb, xu: FacecamXu): Promise<number> {
    const key = `${usb.path}#${usb.devnum}`
    let pending = this.units.get(key)
    if (!pending) {
      // Cache the lookup itself so parallel reads share one descriptor read.
      pending = this.readUnits(usb.path).then((found) => {
        const byGuid = (g: string) => found.find((x) => x.guid === g)?.unit
        return { image: byGuid(FACECAM_GUID.image), device: byGuid(FACECAM_GUID.device) }
      })
      pending.catch(() => this.units.delete(key))
      this.units.set(key, pending)
    }
    const u = await pending
    const unit = u[xu]
    if (unit === undefined) throw new Error(`Facecam ${xu} extension unit not found`)
    return unit
  }

  private async read(dev: string, usb: FacecamUsb, xu: FacecamXu, sels: number[]): Promise<Map<number, XuReading>> {
    return parseXuGet(await this.xu.query(xuGetArgv(dev, await this.unitOf(usb, xu), sels)))
  }

  private selsFor(xu: FacecamXu): Array<[FacecamKey, number]> {
    return (Object.entries(FACECAM_CONTROLS) as Array<[FacecamKey, { xu: FacecamXu; sel: number }]>)
      .filter(([, f]) => f.xu === xu)
      .map(([k, f]) => [k, f.sel])
  }

  async state(dev: string, usb: FacecamUsb): Promise<FacecamState> {
    const imageSels = this.selsFor('image')
    const deviceSels = this.selsFor('device')
    const [image, device] = await Promise.all([
      this.read(dev, usb, 'image', imageSels.map(([, s]) => s)),
      this.read(dev, usb, 'device', [FACECAM_INFO.sel, ...deviceSels.map(([, s]) => s)]),
    ])
    const controls: FacecamControl[] = []
    const ranges = new Map<FacecamKey, { min: number; max: number }>()
    for (const [key, sel] of [...imageSels, ...deviceSels]) {
      const f = FACECAM_CONTROLS[key]
      const r = (f.xu === 'image' ? image : device).get(sel)
      if (!r || r.err || !r.cur || !r.min || !r.max) continue
      const [value, min, max] = [r.cur, r.min, r.max].map((b) => decodeLE(b, f.signed))
      if (value === null || min === null || max === null || min === max) continue
      const def = r.def ? decodeLE(r.def, f.signed) : null
      controls.push({ key, value, min, max, default: def ?? min })
      ranges.set(key, { min, max })
    }
    this.ranges.set(dev, ranges)
    const info = device.get(FACECAM_INFO.sel)
    const { firmware, serial } = info?.cur ? decodeInfo(info.cur) : { firmware: '', serial: '' }
    return { firmware, serial, controls }
  }

  async set(dev: string, usb: FacecamUsb, key: FacecamKey, value: number): Promise<void> {
    const f = Object.prototype.hasOwnProperty.call(FACECAM_CONTROLS, key) ? FACECAM_CONTROLS[key] : undefined
    if (!f) throw new Error(`unknown facecam control: ${String(key)}`)
    if (!this.ranges.get(dev)?.has(key)) await this.state(dev, usb)
    const range = this.ranges.get(dev)?.get(key)
    if (!range) throw new Error(`Facecam control not supported by this firmware: ${key}`)
    const v = Math.min(range.max, Math.max(range.min, value))
    await this.xu.query(xuSetArgv(dev, await this.unitOf(usb, f.xu), f.sel, encodeLE(v, f.len, f.signed)))
  }

  async save(dev: string, usb: FacecamUsb): Promise<void> {
    await this.xu.query(xuSetArgv(dev, await this.unitOf(usb, FACECAM_SAVE.xu), FACECAM_SAVE.sel, FACECAM_SAVE.payload))
  }

  async readouts(dev: string, usb: FacecamUsb): Promise<FacecamReadouts> {
    const entries = Object.entries(FACECAM_READOUTS) as Array<[keyof FacecamReadouts, (typeof FACECAM_READOUTS)['iso']]>
    const got = await this.read(dev, usb, 'image', entries.map(([, f]) => f.sel))
    const out = { iso: null, exposure: null, wbKelvin: null, tint: null } as FacecamReadouts
    for (const [k, f] of entries) {
      const r = got.get(f.sel)
      out[k] = r?.cur && !r.err ? decodeLE(r.cur, f.signed) : null
    }
    return out
  }
}
