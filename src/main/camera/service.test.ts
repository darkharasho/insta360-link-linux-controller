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
