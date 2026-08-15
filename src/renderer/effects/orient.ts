/**
 * Software image orientation for the preview/vcam pipeline.
 *
 * The Link cameras expose no hardware flip — neither a V4L2 control nor a
 * known XU selector — so when one boots with the head rolled upside down the
 * only fix is in our pipeline. Applied where the raw video is first drawn, so
 * blur segmentation runs on the corrected (upright) image, and both the
 * preview and the virtual camera inherit it.
 */

export interface Orientation {
  /** Fixes an upside-down camera: a 180° rotation (both axes flipped). */
  rotate180: boolean
  /** Horizontal mirror, applied on top of the rotation. */
  mirror: boolean
}

export const NEUTRAL_ORIENT: Orientation = { rotate180: false, mirror: false }

export function isNeutralOrient(o: Orientation): boolean {
  return !o.rotate180 && !o.mirror
}

/** Coerce anything (bad storage, old versions) into a valid orientation. */
export function sanitizeOrient(raw: unknown): Orientation {
  const o = (raw ?? {}) as Record<string, unknown>
  return { rotate180: o.rotate180 === true, mirror: o.mirror === true }
}

/**
 * The 2D canvas transform [a, b, c, d, e, f] that applies the orientation to
 * a w×h draw. Axis-aligned flips about the frame center, so rotate and mirror
 * compose commutatively.
 */
export function orientTransform(
  o: Orientation,
  w: number,
  h: number,
): [number, number, number, number, number, number] {
  const sx = (o.rotate180 ? -1 : 1) * (o.mirror ? -1 : 1)
  const sy = o.rotate180 ? -1 : 1
  return [sx, 0, 0, sy, sx < 0 ? w : 0, sy < 0 ? h : 0]
}

const storageKey = (deviceId: string) => `orientation:${deviceId}`

/** Load the saved orientation for a camera; neutral when unset/unavailable. */
export function loadOrient(deviceId: string): Orientation {
  try {
    if (typeof localStorage === 'undefined') return NEUTRAL_ORIENT
    const raw = localStorage.getItem(storageKey(deviceId))
    return raw ? sanitizeOrient(JSON.parse(raw)) : NEUTRAL_ORIENT
  } catch {
    return NEUTRAL_ORIENT
  }
}

export function saveOrient(deviceId: string, o: Orientation): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(storageKey(deviceId), JSON.stringify(o))
  } catch {
    // Persistence is best-effort; the in-session state still applies.
  }
}
