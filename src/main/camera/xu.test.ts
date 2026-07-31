import { describe, it, expect, vi } from 'vitest'
import { XuAdapter } from './xu'

describe('XuAdapter', () => {
  it('spawns link-xu with mapped argv', async () => {
    const run = vi.fn().mockResolvedValue('')
    const a = new XuAdapter('/opt/link-xu', run)
    await a.send('/dev/video1', { kind: 'framing', mode: 'full' })
    expect(run).toHaveBeenCalledWith('/opt/link-xu', ['/dev/video1', 'framing', 'full'])
  })
  it('spawns link-xu with reset argv', async () => {
    const run = vi.fn().mockResolvedValue('')
    const a = new XuAdapter('/opt/link-xu', run)
    await a.send('/dev/video1', { kind: 'reset' })
    expect(run).toHaveBeenCalledWith('/opt/link-xu', ['/dev/video1', 'reset'])
  })
})
