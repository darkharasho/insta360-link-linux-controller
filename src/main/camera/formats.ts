import type { VideoMode } from '../../shared/types.js'

/**
 * MJPG modes from `v4l2-ctl --list-formats-ext`. MJPG is what browsers and
 * Discord use for the camera's high-resolution modes, and it is the only
 * format offering every size at both frame rates.
 */
export function parseFormats(stdout: string): VideoMode[] {
  const modes = new Map<string, VideoMode>()
  let inMjpg = false
  let size: { width: number; height: number } | null = null
  for (const line of stdout.split('\n')) {
    const fmt = line.match(/^\s*\[\d+\]:\s*'(\w+)'/)
    if (fmt) {
      inMjpg = fmt[1] === 'MJPG'
      size = null
      continue
    }
    if (!inMjpg) continue
    const s = line.match(/Size: Discrete (\d+)x(\d+)/)
    if (s) {
      size = { width: Number(s[1]), height: Number(s[2]) }
      continue
    }
    const i = line.match(/Interval: Discrete [\d.]+s \(([\d.]+) fps\)/)
    if (i && size) {
      const m = { ...size, fps: Math.round(Number(i[1])) }
      modes.set(`${m.width}x${m.height}@${m.fps}`, m)
    }
  }
  return [...modes.values()].sort((a, b) => b.width - a.width || b.height - a.height || b.fps - a.fps)
}

/** Current mode from `v4l2-ctl --get-fmt-video --get-parm`. */
export function parseCurrentMode(stdout: string): VideoMode | null {
  const wh = stdout.match(/Width\/Height\s*:\s*(\d+)\/(\d+)/)
  const fps = stdout.match(/Frames per second:\s*([\d.]+)/)
  if (!wh || !fps) return null
  return { width: Number(wh[1]), height: Number(wh[2]), fps: Math.round(Number(fps[1])) }
}
