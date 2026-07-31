import { describe, it, expect, vi } from 'vitest'
import { XuAdapter } from './xu'

describe('XuAdapter', () => {
  it('spawns link-xu with mapped argv', async () => {
    const run = vi.fn().mockResolvedValue('')
    const a = new XuAdapter('/opt/link-xu', run)
    await a.send('/dev/video1', { kind: 'framing', mode: 'full' })
    expect(run).toHaveBeenCalledWith('/opt/link-xu', ['/dev/video1', 'framing', 'full'])
  })
  it('propagates preset validation errors', async () => {
    const run = vi.fn().mockResolvedValue('')
    const a = new XuAdapter('/opt/link-xu', run)
    await expect(a.send('/dev/video1', { kind: 'preset-recall', slot: 9 })).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
  })
})
