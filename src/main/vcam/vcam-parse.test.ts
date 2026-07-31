import { describe, it, expect } from 'vitest'
import { findLoopbackDevice } from './vcam-parse'
import { ffmpegVcamArgv } from './ffmpeg-argv'

const raw = `OBS Virtual Camera (platform:v4l2loopback-000):
\t/dev/video0

Insta360 Link Filtered (platform:v4l2loopback-001):
\t/dev/video42

Insta360 Link 2: Insta360 Link  (usb-0000:11:00.4-1.4.1.1):
\t/dev/video1
\t/dev/video2
\t/dev/media0
`

describe('findLoopbackDevice', () => {
  it('finds the named loopback device node', () => {
    expect(findLoopbackDevice(raw, 'Insta360 Link Filtered')).toBe('/dev/video42')
  })
  it('does not match a non-loopback camera with a similar name', () => {
    expect(findLoopbackDevice(raw, 'Insta360 Link 2')).toBeNull()
  })
  it('returns null when absent', () => {
    expect(findLoopbackDevice(raw, 'Nope')).toBeNull()
  })
})

describe('ffmpegVcamArgv', () => {
  it('builds a rawvideo rgba stdin -> v4l2 yuv420p pipeline', () => {
    expect(ffmpegVcamArgv('/dev/video42', 960, 540, 24)).toEqual([
      '-hide_banner', '-loglevel', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '960x540', '-r', '24',
      '-i', 'pipe:0',
      '-f', 'v4l2', '-pix_fmt', 'yuv420p', '/dev/video42',
    ])
  })
})
