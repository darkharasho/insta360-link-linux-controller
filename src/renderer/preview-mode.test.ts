import { afterEach, describe, expect, it, vi } from 'vitest'
import { previewVideoConstraints, loadPreviewMode, savePreviewMode, usageNotice } from './preview-mode'

describe('previewVideoConstraints', () => {
  it('keeps the Link default when no mode is chosen', () => {
    expect(previewVideoConstraints(null)).toEqual({ width: { ideal: 1280 }, height: { ideal: 720 } })
  })
  it('asks for exactly the chosen mode', () => {
    expect(previewVideoConstraints({ width: 1920, height: 1080, fps: 60 })).toEqual({
      width: { exact: 1920 }, height: { exact: 1080 }, frameRate: { exact: 60 },
    })
  })
})

describe('usageNotice', () => {
  const m720 = { width: 1280, height: 720, fps: 30 }
  it('names the holder and its mode', () => {
    expect(usageNotice({ holders: ['Discord'], mode: m720 }, false)).toBe('In use by Discord · 1280×720 @ 30')
  })
  it('joins several holders and omits an unknown mode', () => {
    expect(usageNotice({ holders: ['Discord', 'wireplumber'], mode: null }, false)).toBe('In use by Discord, wireplumber')
  })
  it('warns that HDR needs 30 fps', () => {
    expect(usageNotice({ holders: ['Discord'], mode: { ...m720, fps: 60 } }, true)).toBe(
      'In use by Discord · 1280×720 @ 60 — HDR only works at 30 fps',
    )
  })
  it('does not warn when HDR is off or the stream is 30 fps', () => {
    expect(usageNotice({ holders: ['Discord'], mode: { ...m720, fps: 60 } }, false)).not.toMatch(/HDR/)
    expect(usageNotice({ holders: ['Discord'], mode: m720 }, true)).not.toMatch(/HDR/)
  })
  it('is silent when nobody else holds the camera', () => {
    expect(usageNotice({ holders: [], mode: null }, true)).toBeNull()
  })
})

describe('preview mode persistence', () => {
  afterEach(() => vi.unstubAllGlobals())
  const stub = () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
      removeItem: (k: string) => void backing.delete(k),
    })
    return backing
  }
  it('round-trips per camera', () => {
    const b = stub()
    savePreviewMode('usb:0fd9:0092', { width: 3840, height: 2160, fps: 30 })
    expect(b.has('preview-mode:usb:0fd9:0092')).toBe(true)
    expect(loadPreviewMode('usb:0fd9:0092')).toEqual({ width: 3840, height: 2160, fps: 30 })
    expect(loadPreviewMode('usb:2e1a:4c06')).toBeNull()
  })
  it('clears with null', () => {
    stub()
    savePreviewMode('x', { width: 1, height: 1, fps: 1 })
    savePreviewMode('x', null)
    expect(loadPreviewMode('x')).toBeNull()
  })
  it('ignores corrupt data and missing storage', () => {
    const b = stub()
    b.set('preview-mode:x', '{nope')
    expect(loadPreviewMode('x')).toBeNull()
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } })
    expect(loadPreviewMode('x')).toBeNull()
    expect(() => savePreviewMode('x', null)).not.toThrow()
  })
})
