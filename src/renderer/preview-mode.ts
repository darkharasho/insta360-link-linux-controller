import type { StreamUsage, VideoMode } from '../shared/types'

/** getUserMedia video constraints for the preview. null = today's Link default. */
export function previewVideoConstraints(mode: VideoMode | null): MediaTrackConstraints {
  if (!mode) return { width: { ideal: 1280 }, height: { ideal: 720 } }
  return { width: { exact: mode.width }, height: { exact: mode.height }, frameRate: { exact: mode.fps } }
}

const key = (deviceId: string) => `preview-mode:${deviceId}`

const isMode = (m: unknown): m is VideoMode =>
  !!m && typeof m === 'object' && ['width', 'height', 'fps'].every((k) => typeof (m as Record<string, unknown>)[k] === 'number')

export function loadPreviewMode(deviceId: string): VideoMode | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(key(deviceId))
    const m = raw ? JSON.parse(raw) : null
    return isMode(m) ? { width: m.width, height: m.height, fps: m.fps } : null
  } catch {
    return null
  }
}

export function savePreviewMode(deviceId: string, m: VideoMode | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (m) localStorage.setItem(key(deviceId), JSON.stringify(m))
    else localStorage.removeItem(key(deviceId))
  } catch {
    // Best-effort, like preview-pref.ts.
  }
}

export const formatMode = (m: VideoMode) => `${m.width}×${m.height} @ ${m.fps}`

/** Banner text when another app holds the camera, e.g. "In use by Discord · 1280×720 @ 30". */
export function usageNotice(u: StreamUsage, hdrOn: boolean): string | null {
  if (u.holders.length === 0) return null
  let text = `In use by ${u.holders.join(', ')}`
  if (u.mode) text += ` · ${formatMode(u.mode)}`
  if (hdrOn && u.mode && u.mode.fps > 30) text += ' — HDR only works at 30 fps'
  return text
}
