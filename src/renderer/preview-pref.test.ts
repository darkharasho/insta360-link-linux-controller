import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPreviewEnabled, savePreviewEnabled } from './preview-pref'

describe('preview preference persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stub = () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
    })
    return backing
  }

  it('defaults to enabled when nothing is saved', () => {
    stub()
    expect(loadPreviewEnabled()).toBe(true)
  })

  it('defaults to enabled when no storage is available', () => {
    expect(loadPreviewEnabled()).toBe(true)
  })

  it('round-trips off and back on', () => {
    stub()
    savePreviewEnabled(false)
    expect(loadPreviewEnabled()).toBe(false)
    savePreviewEnabled(true)
    expect(loadPreviewEnabled()).toBe(true)
  })

  it('treats unrecognized stored values as enabled', () => {
    const backing = stub()
    savePreviewEnabled(false)
    backing.set([...backing.keys()][0], 'garbage')
    expect(loadPreviewEnabled()).toBe(true)
  })

  it('defaults to enabled when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(loadPreviewEnabled()).toBe(true)
    expect(() => savePreviewEnabled(false)).not.toThrow()
  })
})
