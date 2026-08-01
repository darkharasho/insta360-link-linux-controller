import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { VcamService, VCAM_NAME } from './service'

function makeChild() {
  const child = new EventEmitter() as any
  child.stdin = new EventEmitter() as any
  child.stdin.write = vi.fn().mockReturnValue(true)
  child.stdin.end = vi.fn()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

function makeService(child = makeChild()) {
  const spawnFn = vi.fn().mockReturnValue(child)
  const svc = new VcamService(async () => '/dev/video42', spawnFn, () => '/usr/bin/ffmpeg')
  return { svc, spawnFn, child }
}

describe('VcamService', () => {
  it('reports device + ffmpeg found, not running', async () => {
    const { svc } = makeService()
    expect(await svc.status()).toEqual({
      deviceFound: true, devicePath: '/dev/video42', ffmpegFound: true, running: false,
    })
  })
  it('starts ffmpeg against the discovered device and reports running', async () => {
    const { svc, spawnFn } = makeService()
    const status = await svc.start(960, 540, 24)
    expect(spawnFn).toHaveBeenCalledWith('/usr/bin/ffmpeg', expect.arrayContaining(['/dev/video42', '960x540']))
    expect(status.running).toBe(true)
  })
  it('throws when the loopback device is missing', async () => {
    const svc = new VcamService(async () => null, vi.fn(), () => '/usr/bin/ffmpeg')
    await expect(svc.start(960, 540, 24)).rejects.toThrow(VCAM_NAME)
  })
  it('drops frames while stdin is backpressured, resumes on drain', async () => {
    const { svc, child } = makeService()
    await svc.start(960, 540, 24)
    child.stdin.write.mockReturnValueOnce(true).mockReturnValueOnce(false)
    svc.frame(new Uint8Array(4))
    svc.frame(new Uint8Array(4)) // returns false -> blocked
    svc.frame(new Uint8Array(4)) // dropped
    expect(child.stdin.write).toHaveBeenCalledTimes(2)
    child.stdin.emit('drain')
    svc.frame(new Uint8Array(4))
    expect(child.stdin.write).toHaveBeenCalledTimes(3)
  })
  it('stop kills the child and frames become no-ops', async () => {
    const { svc, child } = makeService()
    await svc.start(960, 540, 24)
    svc.stop()
    expect(child.kill).toHaveBeenCalled()
    svc.frame(new Uint8Array(4))
    expect(child.stdin.write).not.toHaveBeenCalled()
  })
})
