import { describe, it, expect } from 'vitest'
import { xuArgv } from './xu-argv'
const D = '/dev/video1'

describe('xuArgv', () => {
  it('ai on/off', () => {
    expect(xuArgv(D, { kind: 'ai', on: true })).toEqual([D, 'ai', 'on'])
    expect(xuArgv(D, { kind: 'ai', on: false })).toEqual([D, 'ai', 'off'])
  })
  it('framing', () => expect(xuArgv(D, { kind: 'framing', mode: 'half' })).toEqual([D, 'framing', 'half']))
  it('scene', () => expect(xuArgv(D, { kind: 'scene', scene: 'deskview' })).toEqual([D, 'scene', 'deskview']))
  it('preset recall/save', () => {
    expect(xuArgv(D, { kind: 'preset-recall', slot: 3 })).toEqual([D, 'preset', 'recall', '3'])
    expect(xuArgv(D, { kind: 'preset-save', slot: 6 })).toEqual([D, 'preset', 'save', '6'])
  })
  it('reset', () => expect(xuArgv(D, { kind: 'reset' })).toEqual([D, 'reset']))
  it('rejects invalid preset slots', () => {
    expect(() => xuArgv(D, { kind: 'preset-recall', slot: 0 })).toThrow()
    expect(() => xuArgv(D, { kind: 'preset-recall', slot: 7 })).toThrow()
  })
})
