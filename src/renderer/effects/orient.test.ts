import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  NEUTRAL_ORIENT,
  isNeutralOrient,
  loadOrient,
  orientTransform,
  saveOrient,
} from './orient'

function stubStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  return store
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('loadOrient / saveOrient', () => {
  it('returns neutral when nothing is stored', () => {
    stubStorage()
    expect(loadOrient('cam-a')).toEqual(NEUTRAL_ORIENT)
  })

  it('returns neutral when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(loadOrient('cam-a')).toEqual(NEUTRAL_ORIENT)
  })

  it('round-trips per camera, independently', () => {
    stubStorage()
    saveOrient('cam-a', { rotate180: true, mirror: false })
    saveOrient('cam-b', { rotate180: false, mirror: true })
    expect(loadOrient('cam-a')).toEqual({ rotate180: true, mirror: false })
    expect(loadOrient('cam-b')).toEqual({ rotate180: false, mirror: true })
  })

  it('coerces non-boolean stored values to neutral fields', () => {
    const store = stubStorage()
    store.set('orientation:cam-a', '{"rotate180":"yes","mirror":1}')
    expect(loadOrient('cam-a')).toEqual(NEUTRAL_ORIENT)
  })

  it('returns neutral on corrupted JSON', () => {
    const store = stubStorage()
    store.set('orientation:cam-a', '{not json')
    expect(loadOrient('cam-a')).toEqual(NEUTRAL_ORIENT)
  })

  it('survives a throwing storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    })
    expect(loadOrient('cam-a')).toEqual(NEUTRAL_ORIENT)
    expect(() => saveOrient('cam-a', { rotate180: true, mirror: true })).not.toThrow()
  })
})

describe('isNeutralOrient', () => {
  it('is true only when both flags are off', () => {
    expect(isNeutralOrient({ rotate180: false, mirror: false })).toBe(true)
    expect(isNeutralOrient({ rotate180: true, mirror: false })).toBe(false)
    expect(isNeutralOrient({ rotate180: false, mirror: true })).toBe(false)
  })
})

describe('orientTransform', () => {
  const W = 960
  const H = 540

  it('is the identity when neutral', () => {
    expect(orientTransform(NEUTRAL_ORIENT, W, H)).toEqual([1, 0, 0, 1, 0, 0])
  })

  it('rotates 180° by flipping both axes about the frame center', () => {
    expect(orientTransform({ rotate180: true, mirror: false }, W, H)).toEqual([-1, 0, 0, -1, W, H])
  })

  it('mirrors horizontally only', () => {
    expect(orientTransform({ rotate180: false, mirror: true }, W, H)).toEqual([-1, 0, 0, 1, W, 0])
  })

  it('rotate + mirror nets out to a vertical flip', () => {
    expect(orientTransform({ rotate180: true, mirror: true }, W, H)).toEqual([1, 0, 0, -1, 0, H])
  })
})
