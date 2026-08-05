/**
 * Software color correction for the preview/vcam pipeline.
 *
 * The Link cameras expose only a minimal UVC image-control set (no tint, no
 * gamma), and the Link 2 Pro's firmware tuning expects the official app's
 * software processing — which doesn't exist on Linux. This module provides
 * that missing stage: a per-device correction applied in the canvas pipeline,
 * so it reaches both the preview and the virtual camera without touching
 * camera state.
 *
 * The correction compiles to an SVG filter (feColorMatrix + optional gamma
 * feComponentTransfer) referenced from ctx.filter via url(#id).
 */

export interface ColorCorrection {
  /** -100 (cooler / blue) … 100 (warmer / orange). 0 = neutral. */
  temperature: number
  /** -100 (green) … 100 (magenta). 0 = neutral. */
  tint: number
  /** -100 (grayscale) … 100 (double). 0 = neutral. */
  saturation: number
  /** Per-channel gamma exponent, 0.5 … 2. 1 = neutral; >1 darkens mids. */
  gamma: number
}

export const NEUTRAL_COLOR: ColorCorrection = { temperature: 0, tint: 0, saturation: 0, gamma: 1 }

/** How strongly the ±100 temperature/tint sliders push the channel gains. */
const TEMP_STRENGTH = 0.3
const TINT_STRENGTH = 0.25

/** Rec. 709 luma weights, matching how Chromium derives video luminance. */
const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 }

export function isNeutral(c: ColorCorrection): boolean {
  return c.temperature === 0 && c.tint === 0 && c.saturation === 0 && c.gamma === 1
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/** Coerce anything (bad storage, old versions) into a valid correction. */
export function sanitizeColor(raw: unknown): ColorCorrection {
  const o = (raw ?? {}) as Record<string, unknown>
  return {
    temperature: clamp(num(o.temperature, 0), -100, 100),
    tint: clamp(num(o.tint, 0), -100, 100),
    saturation: clamp(num(o.saturation, 0), -100, 100),
    gamma: clamp(num(o.gamma, 1), 0.5, 2),
  }
}

/** White-balance channel gains derived from the temperature/tint sliders. */
function channelGains(c: ColorCorrection): { r: number; g: number; b: number } {
  const t = c.temperature / 100
  const ti = c.tint / 100
  return {
    r: Math.max(0, 1 + TEMP_STRENGTH * t),
    g: Math.max(0, 1 - TINT_STRENGTH * ti),
    b: Math.max(0, 1 - TEMP_STRENGTH * t),
  }
}

/**
 * The 4×5 feColorMatrix values: a standard luma-weighted saturation matrix
 * with the white-balance gains folded into each RGB row. Alpha is untouched.
 */
export function colorMatrixValues(c: ColorCorrection): string {
  const gain = channelGains(c)
  const s = 1 + c.saturation / 100
  const base = { r: LUMA.r * (1 - s), g: LUMA.g * (1 - s), b: LUMA.b * (1 - s) }
  const round = (v: number) => Number(v.toFixed(6))
  const row = (g: number, self: 'r' | 'g' | 'b') =>
    [
      round(g * (base.r + (self === 'r' ? s : 0))),
      round(g * (base.g + (self === 'g' ? s : 0))),
      round(g * (base.b + (self === 'b' ? s : 0))),
      0, 0,
    ]
  return [
    ...row(gain.r, 'r'),
    ...row(gain.g, 'g'),
    ...row(gain.b, 'b'),
    0, 0, 0, 1, 0,
  ].join(' ')
}

/**
 * Full <filter> markup for injection into a hidden <svg>. sRGB interpolation
 * keeps slider behaviour intuitive (SVG filters default to linearRGB).
 */
export function colorFilterMarkup(id: string, c: ColorCorrection): string {
  const gamma =
    c.gamma === 1
      ? ''
      : '<feComponentTransfer>' +
        (['feFuncR', 'feFuncG', 'feFuncB'] as const)
          .map((fn) => `<${fn} type="gamma" exponent="${c.gamma}" amplitude="1" offset="0"/>`)
          .join('') +
        '</feComponentTransfer>'
  return (
    `<filter id="${id}" color-interpolation-filters="sRGB">` +
    `<feColorMatrix type="matrix" values="${colorMatrixValues(c)}"/>` +
    gamma +
    '</filter>'
  )
}

const storageKey = (deviceId: string) => `color-correction:${deviceId}`

/**
 * Load the saved correction for a camera; neutral when unset/unavailable.
 * When `legacyId` is given (the pre-v0.3 port-path id) and the stable key has
 * nothing yet, the legacy entry is moved under the stable key first.
 */
export function loadColor(deviceId: string, legacyId?: string): ColorCorrection {
  try {
    if (typeof localStorage === 'undefined') return NEUTRAL_COLOR
    let raw = localStorage.getItem(storageKey(deviceId))
    if (raw === null && legacyId && legacyId !== deviceId) {
      raw = localStorage.getItem(storageKey(legacyId))
      if (raw !== null) {
        localStorage.setItem(storageKey(deviceId), raw)
        localStorage.removeItem(storageKey(legacyId))
      }
    }
    return raw ? sanitizeColor(JSON.parse(raw)) : NEUTRAL_COLOR
  } catch {
    return NEUTRAL_COLOR
  }
}

export function saveColor(deviceId: string, c: ColorCorrection): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(storageKey(deviceId), JSON.stringify(c))
  } catch {
    // Persistence is best-effort; the in-session state still applies.
  }
}
