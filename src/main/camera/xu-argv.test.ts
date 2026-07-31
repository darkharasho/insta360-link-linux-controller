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
  it('reset', () => expect(xuArgv(D, { kind: 'reset' })).toEqual([D, 'reset']))
})
