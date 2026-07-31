import { describe, it, expect, vi } from 'vitest'
import { CameraService } from './service'
import { PresetStore } from './presets'

function makeService() {
  const v4l2 = { listDevices: vi.fn(), getControls: vi.fn(), setControl: vi.fn().mockResolvedValue(undefined) } as any
  const xu = { send: vi.fn().mockResolvedValue(undefined) } as any
  const svc = new CameraService(v4l2, xu, new PresetStore())
  return { svc, v4l2, xu }
}

describe('CameraService', () => {
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
  it('routes preset recall to xu adapter', async () => {
    const { svc, xu } = makeService()
    await svc.recallHwPreset('/dev/video1', 2)
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'preset-recall', slot: 2 })
  })
  it('routes preset save to xu adapter', async () => {
    const { svc, xu } = makeService()
    await svc.saveHwPreset('/dev/video1', 4)
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'preset-save', slot: 4 })
  })
  it('routes reset to xu adapter', async () => {
    const { svc, xu } = makeService()
    await svc.reset('/dev/video1')
    expect(xu.send).toHaveBeenCalledWith('/dev/video1', { kind: 'reset' })
  })
  it('applies an app preset by replaying setControl', async () => {
    const { svc, v4l2 } = makeService()
    svc.saveAppPreset('cam1', 'Desk', { zoom_absolute: 250, pan_absolute: 0 })
    await svc.applyAppPreset('/dev/video1', 'cam1', 'Desk')
    expect(v4l2.setControl).toHaveBeenCalledWith('/dev/video1', 'zoom_absolute', 250)
    expect(v4l2.setControl).toHaveBeenCalledWith('/dev/video1', 'pan_absolute', 0)
  })
  it('throws applying an unknown preset', async () => {
    const { svc } = makeService()
    await expect(svc.applyAppPreset('/dev/video1', 'cam1', 'Nope')).rejects.toThrow()
  })
})
