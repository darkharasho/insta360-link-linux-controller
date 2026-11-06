import type { FacecamReadouts } from '../shared/types'

/** A null field (camera busy right after a write) keeps the last known value. */
export function mergeReadouts(prev: FacecamReadouts | null, next: FacecamReadouts): FacecamReadouts {
  if (!prev) return next
  return {
    iso: next.iso ?? prev.iso,
    exposure: next.exposure ?? prev.exposure,
    wbKelvin: next.wbKelvin ?? prev.wbKelvin,
    tint: next.tint ?? prev.tint,
  }
}

/** Exposure in 100 µs units as a shutter speed, e.g. 333 → "1/30 s". */
export function formatShutter(exposure: number | null): string {
  if (exposure === null || exposure <= 0) return '—'
  const seconds = exposure / 10000
  if (seconds >= 1) return `${Math.round(seconds * 10) / 10} s`
  return `1/${Math.round(1 / seconds)} s`
}
