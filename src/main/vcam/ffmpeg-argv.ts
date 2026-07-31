/**
 * ffmpeg argv: raw RGBA frames on stdin -> yuv420p onto a v4l2loopback device.
 * Consumers (Zoom/OBS/browsers) read the loopback node like any webcam.
 */
export function ffmpegVcamArgv(dev: string, width: number, height: number, fps: number): string[] {
  return [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps),
    '-i', 'pipe:0',
    '-f', 'v4l2', '-pix_fmt', 'yuv420p', dev,
  ]
}
