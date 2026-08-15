/**
 * App-level preference: whether the video preview holds the camera stream.
 * Off releases the device so other apps can capture while PTZ and image
 * controls (plain v4l2 ioctls) keep working.
 */
const KEY = 'preview-enabled'

export function loadPreviewEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export function savePreviewEnabled(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // Persistence is best-effort; the in-session state still applies.
  }
}
