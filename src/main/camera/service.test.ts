import { describe, it, expect, vi } from 'vitest'
import { CameraService } from './service'
import { PresetStore } from './presets'

function makeService() {
  const v4l2 = { listDevices: vi.fn(), getControls: vi.fn(), setControl: vi.fn().mockResolvedValue(undefined) } as any
  const xu = { send: vi.fn().mockResolvedValue(undefined) } as any
  const presets = new PresetStore()
  const svc = new CameraService(v4l2, xu, presets, { sceneSettleMs: 0 })
  return { svc, v4l2, xu, presets }
}

const device = (id: string, busId?: string) => ({
  id,
  ...(busId ? { busId } : {}),
  name: 'Insta360 Link 2 Pro: Insta360 L',
  label: 'Insta360 Link 2 Pro',
  captureNode: '/dev/video1',
  nodes: ['/dev/video1'],
})

describe('CameraService', () => {
  it('listDevices migrates presets from the legacy busId key to the stable id', async () => {
    const { svc, v4l2, presets } = makeService()
    presets.save('usb-0000:11:00.4-1.4.1.1', { name: 'Desk - Pro', values: { zoom_absolute: 200 } })
    v4l2.listDevices.mockResolvedValue([device('usb:2e1a:4c06', 'usb-0000:11:00.4-1.4.1.1')])
    await svc.listDevices()
    expect(presets.list('usb:2e1a:4c06')).toEqual([{ name: 'Desk - Pro', values: { zoom_absolute: 200 } }])
    expect(presets.list('usb-0000:11:00.4-1.4.1.1')).toEqual([])
  })
  it('listDevices tolerates devices without a busId (port-scoped identity)', async () => {
    const { svc, v4l2 } = makeService()
    v4l2.listDevices.mockResolvedValue([device('usb-0000:11:00.4-1.4.1.1')])
    await expect(svc.listDevices()).resolves.toHaveLength(1)
  })
  it('routes AI toggle to xu adapter', async () => {
    const { svc, xu } = makeService()
    await svc.setAi('/dev/video1', true)
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'ai', on: true })
  })
  it('routes scene to xu adapter', async () => {
    const { svc, xu } = makeService()
    await svc.setScene('/dev/video1', 'whiteboard')
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'scene', scene: 'whiteboard' })
  })
  it('routes framing to xu adapter', async () => {
    const { svc, xu } = makeService()
    await svc.setFraming('/dev/video1', 'full')
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'framing', mode: 'full' })
  })
  it('routes reset to xu adapter', async () => {
    const { svc, xu } = makeService()
    await svc.reset('/dev/video1')
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'reset' })
  })
  it('applies a scene-mode preset: image controls, scene command, then zoom replay — no pan/tilt', async () => {
    const { svc, v4l2, xu } = makeService()
    v4l2.getControls.mockResolvedValue([
      { name: 'zoom_absolute', kind: 'int', value: 100, min: 100, max: 400, step: 1, inactive: false },
    ])
    svc.saveAppPreset('cam1', 'Desk', { brightness: 60, pan_absolute: 7200, zoom_absolute: 250 }, 'deskview')
    const result = await svc.applyAppPreset('/dev/video1', 'cam1', 'Desk')

    // The scene aims the gimbal itself, so stale pan/tilt are never replayed —
    // but the scene transition also resets zoom, so the saved zoom IS replayed
    // (nudged) after the scene command.
    const calls = v4l2.setControl.mock.calls.map((c: unknown[]) => [c[1], c[2]])
    expect(calls).toEqual([
      ['brightness', 60],
      ['zoom_absolute', 249],
      ['zoom_absolute', 250],
    ])
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'scene', scene: 'deskview' })
    const sceneOrder = xu.send.mock.invocationCallOrder[0]
    const zoomOrder = v4l2.setControl.mock.invocationCallOrder[1]
    expect(zoomOrder).toBeGreaterThan(sceneOrder)
    expect(result).toMatchObject({ failed: [], mode: 'deskview' })
  })
  it('applies an AI preset: position replay, then ai on + framing', async () => {
    const { svc, v4l2, xu } = makeService()
    v4l2.getControls.mockResolvedValue([
      { name: 'pan_absolute', kind: 'int', value: 0, min: -522000, max: 522000, step: 3600, inactive: false },
    ])
    svc.saveAppPreset('cam1', 'Track me', { pan_absolute: 7200 }, 'ai', 'full')
    const result = await svc.applyAppPreset('/dev/video1', 'cam1', 'Track me')

    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'scene', scene: 'normal' })
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'ai', on: true })
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'framing', mode: 'full' })
    // ai on must come after the position replay
    const aiOrder = xu.send.mock.invocationCallOrder[1]
    const lastSet = v4l2.setControl.mock.invocationCallOrder.at(-1)!
    expect(aiOrder).toBeGreaterThan(lastSet)
    expect(result).toMatchObject({ mode: 'ai', framing: 'full' })
  })
  it('applies a normal-mode preset: scene normal first, then controls, position controls nudged', async () => {
    const { svc, v4l2, xu } = makeService()
    v4l2.getControls.mockResolvedValue([
      { name: 'pan_absolute', kind: 'int', value: 0, min: -522000, max: 522000, step: 3600, inactive: false },
      { name: 'zoom_absolute', kind: 'int', value: 100, min: 100, max: 400, step: 1, inactive: false },
      { name: 'brightness', kind: 'int', value: 50, min: 0, max: 100, step: 1, inactive: false },
    ])
    svc.saveAppPreset('cam1', 'Desk', { brightness: 60, zoom_absolute: 250, pan_absolute: 7200 })
    await svc.applyAppPreset('/dev/video1', 'cam1', 'Desk')

    // AI/scene modes are silenced before moving, so tracking can't fight the recall.
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'scene', scene: 'normal' })
    expect(xu.send.mock.invocationCallOrder[0]).toBeLessThan(v4l2.setControl.mock.invocationCallOrder[0])

    // Plain control: written once. Position controls: nudge (target-step) then target,
    // so the kernel's same-value dedupe can never swallow the write.
    const calls = v4l2.setControl.mock.calls.map((c: unknown[]) => [c[1], c[2]])
    expect(calls).toEqual([
      ['brightness', 60],
      ['pan_absolute', 7200 - 3600],
      ['pan_absolute', 7200],
      ['zoom_absolute', 249],
      ['zoom_absolute', 250],
    ])
  })
  it('clamps the nudge value at the control minimum', async () => {
    const { svc, v4l2 } = makeService()
    v4l2.getControls.mockResolvedValue([
      { name: 'zoom_absolute', kind: 'int', value: 300, min: 100, max: 400, step: 1, inactive: false },
    ])
    svc.saveAppPreset('cam1', 'Wide', { zoom_absolute: 100 })
    await svc.applyAppPreset('/dev/video1', 'cam1', 'Wide')
    // target == min, so the nudge goes UP one step instead of below the range
    const calls = v4l2.setControl.mock.calls.map((c: unknown[]) => [c[1], c[2]])
    expect(calls).toEqual([
      ['zoom_absolute', 101],
      ['zoom_absolute', 100],
    ])
  })
  it('throws applying an unknown preset', async () => {
    const { svc } = makeService()
    await expect(svc.applyAppPreset('/dev/video1', 'cam1', 'Nope')).rejects.toThrow()
  })
  it('continues applying remaining controls when one setControl fails', async () => {
    const { svc, v4l2 } = makeService()
    v4l2.getControls.mockResolvedValue([])
    svc.saveAppPreset('cam1', 'Desk', { brightness: 60, contrast: 40, sharpness: 55 })
    v4l2.setControl
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('EIO'))
      .mockResolvedValueOnce(undefined)
    const result = await svc.applyAppPreset('/dev/video1', 'cam1', 'Desk')
    expect(v4l2.setControl).toHaveBeenCalledTimes(3)
    expect(result.failed).toEqual(['contrast'])
  })
  it('still applies controls when the scene-normal command fails', async () => {
    const { svc, v4l2, xu } = makeService()
    v4l2.getControls.mockResolvedValue([])
    xu.send.mockRejectedValueOnce(new Error('ioctl failed'))
    svc.saveAppPreset('cam1', 'Desk', { brightness: 60 })
    const result = await svc.applyAppPreset('/dev/video1', 'cam1', 'Desk')
    expect(v4l2.setControl).toHaveBeenCalledWith('/dev/video1', 'brightness', 60)
    expect(result.failed).toEqual([])
  })
})

describe('CameraService wakes the camera before driving it', () => {
  // A control write holds the device open for only ~25ms, which is not long
  // enough to wake a sleeping Link; the write then succeeds while the camera
  // ignores it. Ordering matters: waking after the write is useless.
  function makeWoken() {
    const order: string[] = []
    const waker = { ensureAwake: vi.fn(async () => { order.push('wake') }) }
    const v4l2 = {
      listDevices: vi.fn(),
      getControls: vi.fn().mockResolvedValue([]),
      setControl: vi.fn(async () => { order.push('setControl') }),
    } as any
    const xu = { send: vi.fn(async () => { order.push('xu') }) } as any
    const presets = new PresetStore()
    const svc = new CameraService(v4l2, xu, presets, { sceneSettleMs: 0 }, waker)
    return { svc, v4l2, xu, presets, waker, order }
  }

  it('wakes before a control write', async () => {
    const { svc, waker, order } = makeWoken()
    await svc.setControl('/dev/video1', 'pan_absolute', 3600)
    expect(waker.ensureAwake).toHaveBeenCalledWith('/dev/video1')
    expect(order).toEqual(['wake', 'setControl'])
  })

  it('wakes before a gimbal reset', async () => {
    // reset() then issues several commands (XU trigger, scene clear, pan/tilt
    // home); only the wake having to come first is asserted here.
    const { svc, order } = makeWoken()
    await svc.reset('/dev/video1')
    expect(order[0]).toBe('wake')
    expect(order.indexOf('wake')).toBe(order.lastIndexOf('wake'))
  })

  it('wakes before AI, framing and scene commands', async () => {
    for (const call of [
      (s: CameraService) => s.setAi('/dev/video1', true),
      (s: CameraService) => s.setFraming('/dev/video1', 'half'),
      (s: CameraService) => s.setScene('/dev/video1', 'normal'),
    ]) {
      const { svc, order } = makeWoken()
      await call(svc)
      expect(order).toEqual(['wake', 'xu'])
    }
  })

  it('wakes before replaying a preset', async () => {
    const { svc, presets, order } = makeWoken()
    presets.save('cam', { name: 'Desk', values: { pan_absolute: 3600 }, mode: 'normal' })
    await svc.applyAppPreset('/dev/video1', 'cam', 'Desk')
    expect(order[0]).toBe('wake')
  })
})

describe('CameraService.reset actually recenters the gimbal', () => {
  // Measured on a Link 2 Pro: the XU gimbal-reset trigger (unit 9, selector 14)
  // is accepted -- GET_LEN reports 1 byte, GET_INFO reports SET-only, and the
  // ioctl returns success -- but the gimbal does not move. With the camera
  // parked 50 deg off-center, nothing moved for 10s after the trigger. A scene
  // mode also makes the camera ignore pan/tilt writes entirely. So recentering
  // means clearing the scene and driving pan/tilt home ourselves.
  const ptz = [
    { name: 'pan_absolute', kind: 'int', value: 180000, min: -522000, max: 522000, step: 3600, default: 0 },
    { name: 'tilt_absolute', kind: 'int', value: 36000, min: -324000, max: 360000, step: 3600, default: 0 },
    { name: 'brightness', kind: 'int', value: 5, min: 0, max: 10, step: 1, default: 5 },
  ]

  function makeReset() {
    const calls: string[] = []
    const v4l2 = {
      listDevices: vi.fn(),
      getControls: vi.fn().mockResolvedValue(ptz),
      setControl: vi.fn(async (_d: string, n: string, v: number) => { calls.push(`${n}=${v}`) }),
    } as any
    const xu = { send: vi.fn(async (_d: string, c: any) => { calls.push(`xu:${c.kind}${c.scene ? ':' + c.scene : ''}`) }) } as any
    const svc = new CameraService(v4l2, xu, new PresetStore(), { sceneSettleMs: 0 })
    return { svc, v4l2, xu, calls }
  }

  it('drives pan and tilt to their defaults instead of trusting the XU trigger', async () => {
    const { svc, calls } = makeReset()
    await svc.reset('/dev/video1')
    expect(calls).toContain('pan_absolute=0')
    expect(calls).toContain('tilt_absolute=0')
  })

  it('clears any active scene before writing pan/tilt, which a scene would ignore', async () => {
    const { svc, calls } = makeReset()
    await svc.reset('/dev/video1')
    const scene = calls.indexOf('xu:scene:normal')
    const pan = calls.findIndex((c) => c.startsWith('pan_absolute'))
    expect(scene).toBeGreaterThanOrEqual(0)
    expect(scene).toBeLessThan(pan)
  })

  it('still sends the XU reset trigger, which is harmless and may help other firmware', async () => {
    const { svc, xu } = makeReset()
    await svc.reset('/dev/video1')
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'reset' })
  })

  it('nudges pan/tilt so a write matching the stale cache still reaches the camera', async () => {
    // AI tracking and scene modes move the gimbal without updating the v4l2
    // core's cached value, and the core skips a SET equal to its cache unless
    // the control sets EXECUTE_ON_WRITE -- which pan_absolute does not.
    const { svc, calls } = makeReset()
    await svc.reset('/dev/video1')
    expect(calls.filter((c) => c.startsWith('pan_absolute'))).toEqual(['pan_absolute=-3600', 'pan_absolute=0'])
  })

  it('leaves image controls alone', async () => {
    const { svc, calls } = makeReset()
    await svc.reset('/dev/video1')
    expect(calls.some((c) => c.startsWith('brightness'))).toBe(false)
  })

  it('recenters even when the control ranges cannot be read', async () => {
    const { svc, v4l2, calls } = makeReset()
    v4l2.getControls.mockRejectedValue(new Error('EBUSY'))
    await svc.reset('/dev/video1')
    expect(calls).toContain('pan_absolute=0')
    expect(calls).toContain('tilt_absolute=0')
  })

  it('wakes the camera before recentering it', async () => {
    const order: string[] = []
    const waker = { ensureAwake: vi.fn(async () => { order.push('wake') }) }
    const v4l2 = {
      listDevices: vi.fn(),
      getControls: vi.fn(async () => { order.push('getControls'); return ptz }),
      setControl: vi.fn(async () => { order.push('setControl') }),
    } as any
    const xu = { send: vi.fn(async () => { order.push('xu') }) } as any
    const svc = new CameraService(v4l2, xu, new PresetStore(), { sceneSettleMs: 0 }, waker)
    await svc.reset('/dev/video1')
    expect(order[0]).toBe('wake')
  })
})

describe('CameraService.reset waits out the scene transition', () => {
  it('does not write pan/tilt until the scene transition has settled', async () => {
    // Leaving a scene moves the gimbal, and a pan/tilt write landing during
    // that move is discarded by the firmware.
    const events: string[] = []
    const v4l2 = {
      listDevices: vi.fn(),
      getControls: vi.fn().mockResolvedValue([]),
      setControl: vi.fn(async (_d: string, n: string) => { events.push(`set:${n}`) }),
    } as any
    const xu = { send: vi.fn(async (_d: string, c: any) => { events.push(`xu:${c.kind}`) }) } as any
    const svc = new CameraService(v4l2, xu, new PresetStore(), { sceneSettleMs: 40 })
    const done = svc.reset('/dev/video1')
    await new Promise((r) => setTimeout(r, 10))
    expect(events.filter((e) => e.startsWith('set:'))).toEqual([])
    await done
    expect(events.filter((e) => e.startsWith('set:')).length).toBeGreaterThan(0)
  })
})
