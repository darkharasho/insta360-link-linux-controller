import { describe, it, expect, vi } from 'vitest'
import { CH } from './ipc'
import { registerIpc } from '../main/ipc'

describe('ipc channels', () => {
  it('has a stable channel for every camera action', () => {
    expect(CH.listDevices).toBe('camera:list')
    expect(CH.setControl).toBe('camera:setControl')
    expect(Object.values(CH).every((c) => c.startsWith('camera:'))).toBe(true)
  })
  it('registers a handler for each channel', () => {
    const handlers: Record<string, unknown> = {}
    const ipcMain = { handle: (ch: string, fn: unknown) => { handlers[ch] = fn } }
    const service = {
      listDevices: vi.fn(), getSnapshot: vi.fn(), setControl: vi.fn(),
      setAi: vi.fn(), setFraming: vi.fn(), setScene: vi.fn(),
      reset: vi.fn(),
      listAppPresets: vi.fn(), saveAppPreset: vi.fn(), applyAppPreset: vi.fn(), removeAppPreset: vi.fn(),
    }
    registerIpc(ipcMain as any, service as any)
    for (const ch of Object.values(CH)) expect(handlers[ch]).toBeTypeOf('function')
  })
  it('invokes the service when a handler is called', async () => {
    const handlers: Record<string, Function> = {}
    const ipcMain = { handle: (ch: string, fn: Function) => { handlers[ch] = fn } }
    const service = { setControl: vi.fn().mockResolvedValue(undefined) } as any
    // register a minimal service; others default to no-op
    registerIpc(ipcMain as any, { ...service,
      listDevices: vi.fn(), getSnapshot: vi.fn(), setAi: vi.fn(), setFraming: vi.fn(),
      setScene: vi.fn(), reset: vi.fn(),
      listAppPresets: vi.fn(), saveAppPreset: vi.fn(), applyAppPreset: vi.fn(), removeAppPreset: vi.fn() })
    await handlers[CH.setControl]({}, '/dev/video1', 'zoom_absolute', 300)
    expect(service.setControl).toHaveBeenCalledWith('/dev/video1', 'zoom_absolute', 300)
  })
})
