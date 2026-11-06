import { describe, it, expect } from 'vitest'
import { parseFormats, parseCurrentMode } from './formats'

const SIZES = ['3840x2160', '2560x1440', '1920x1080', '1280x720', '960x540', '640x360', '640x480']
const block = (sizes: string[], intervals: string[]) =>
  sizes.map((s) => `\t\tSize: Discrete ${s}\n` + intervals.map((i) => `\t\t\tInterval: Discrete ${i}\n`).join('')).join('')
const BOTH = ['0.017s (60.000 fps)', '0.033s (30.000 fps)']

// Shape of the real Facecam 4K output (fw 2.49).
const LIST = [
  'ioctl: VIDIOC_ENUM_FMT\n\tType: Video Capture\n\n',
  "\t[0]: 'MJPG' (Motion-JPEG, compressed)\n", block(SIZES, BOTH), '\n',
  "\t[1]: 'YUYV' (YUYV 4:2:2)\n", block(['2560x1440'], ['0.033s (30.000 fps)']), block(['1920x1080'], BOTH), '\n',
  "\t[2]: 'NV12' (Y/UV 4:2:0)\n", block(['3840x2160'], ['0.033s (30.000 fps)']), block(['800x600'], BOTH),
].join('')

describe('parseFormats', () => {
  it('lists MJPG modes only, largest and fastest first', () => {
    const m = parseFormats(LIST)
    expect(m).toHaveLength(14)
    expect(m[0]).toEqual({ width: 3840, height: 2160, fps: 60 })
    expect(m[1]).toEqual({ width: 3840, height: 2160, fps: 30 })
    expect(m.some((x) => x.width === 800)).toBe(false)
  })
  it('dedupes repeated modes', () => {
    const twice = LIST.replace("\t[1]: 'YUYV'", block(['1920x1080'], BOTH) + "\t[1]: 'YUYV'")
    expect(parseFormats(twice)).toHaveLength(14)
  })
  it('returns nothing for a camera without MJPG', () => {
    expect(parseFormats("\t[0]: 'YUYV' (YUYV 4:2:2)\n" + block(['640x480'], BOTH))).toEqual([])
  })
})

describe('parseCurrentMode', () => {
  it('reads size and frame rate from --get-fmt-video --get-parm', () => {
    const out = [
      'Format Video Capture:',
      '\tWidth/Height      : 3840/2160',
      "\tPixel Format      : 'MJPG' (Motion-JPEG)",
      'Streaming Parameters Video Capture:',
      '\tCapabilities     : timeperframe',
      '\tFrames per second: 30.000 (30/1)',
    ].join('\n')
    expect(parseCurrentMode(out)).toEqual({ width: 3840, height: 2160, fps: 30 })
  })
  it('returns null for unparseable output', () => expect(parseCurrentMode('garbage')).toBeNull())
})
