import type { FacecamKey, FacecamReadouts } from '../../shared/types.js'

/**
 * The Elgato Facecam 4K vendor-control allowlist. This file is the ONLY place
 * a selector number is named; nothing else may write to the extension units.
 * Never add device selectors 6 or 21 (unidentified SET-only commands).
 * Provenance: docs/HARDWARE-TEST.md and the Facecam 4K design spec.
 */
export const FACECAM_GUID = {
  image: '23e49ed0-1178-4f31-ae52-d2fb8a8d3001',
  device: '2c49d16a-32b8-4485-3ea8-643a15236002',
} as const
export type FacecamXu = keyof typeof FACECAM_GUID

export interface XuField { xu: FacecamXu; sel: number; len: 1 | 2 | 4; signed: boolean }

export const FACECAM_CONTROLS: Record<FacecamKey, XuField & { len: 1 | 2 }> = {
  metering: { xu: 'image', sel: 2, len: 1, signed: false },
  tint: { xu: 'image', sel: 18, len: 2, signed: true },
  hdr: { xu: 'image', sel: 21, len: 1, signed: false },
  nr2d: { xu: 'device', sel: 3, len: 1, signed: false },
  nr3d: { xu: 'device', sel: 20, len: 1, signed: false },
}

/** Read-only live values, measured on hardware (see docs/HARDWARE-TEST.md). */
export const FACECAM_READOUTS: Record<keyof FacecamReadouts, XuField> = {
  iso: { xu: 'image', sel: 8, len: 4, signed: false },
  exposure: { xu: 'image', sel: 11, len: 4, signed: false },
  wbKelvin: { xu: 'image', sel: 17, len: 4, signed: false },
  tint: { xu: 'image', sel: 19, len: 4, signed: true },
}

export const FACECAM_SAVE = { xu: 'device', sel: 7, payload: '01' } as const
export const FACECAM_INFO = { xu: 'device', sel: 1 } as const

/** Little-endian integer; null when every byte is 0xff (the "not ready" answer). */
export function decodeLE(bytes: Uint8Array, signed: boolean): number | null {
  if (bytes.length === 0 || bytes.every((b) => b === 0xff)) return null
  let v = 0
  for (let i = bytes.length - 1; i >= 0; i--) v = v * 256 + bytes[i]
  const bits = 8 * bytes.length
  if (signed && bytes[bytes.length - 1] & 0x80) v -= 2 ** bits
  return v
}

export function encodeLE(value: number, len: 1 | 2, signed: boolean): string {
  let v = Math.round(value)
  if (signed && v < 0) v += 2 ** (8 * len)
  const out: string[] = []
  for (let i = 0; i < len; i++) {
    out.push((v & 0xff).toString(16).padStart(2, '0'))
    v = Math.floor(v / 256)
  }
  return out.join('')
}

/** Device info block: firmware major/minor in bytes 0–1, ASCII serial from byte 32. */
export function decodeInfo(bytes: Uint8Array): { firmware: string; serial: string } {
  const firmware = bytes.length >= 2 ? `${bytes[0]}.${String(bytes[1]).padStart(2, '0')}` : ''
  const tail = bytes.subarray(32)
  const end = tail.indexOf(0)
  const serial = new TextDecoder().decode(end >= 0 ? tail.subarray(0, end) : tail).replace(/[^\x20-\x7e]/g, '')
  return { firmware, serial }
}
