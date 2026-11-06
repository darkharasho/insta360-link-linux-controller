import { describe, it, expect } from 'vitest'
import { xuArgv, xuGetArgv, xuSetArgv, parseXuGet } from './xu-argv'
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

describe('generic XU access', () => {
  it('xuGetArgv joins selectors into one invocation', () => {
    expect(xuGetArgv('/dev/video8', 6, [2, 18])).toEqual(['/dev/video8', 'xu-get', '6', '2,18'])
  })
  it('xuSetArgv passes unit, selector and hex payload', () => {
    expect(xuSetArgv('/dev/video8', 6, 18, 'd4fe')).toEqual(['/dev/video8', 'xu-set', '6', '18', 'd4fe'])
  })
  it('parseXuGet decodes readable, SET-only and failed selectors', () => {
    const r = parseXuGet(
      'sel=18 len=2 info=03 cur=0000 min=d4fe max=2c01 def=0000\nsel=7 len=1 info=02\nsel=9 err=Input/output error\n',
    )
    expect(r.get(18)!.len).toBe(2)
    expect(r.get(18)!.info).toBe(3)
    expect(r.get(18)!.min).toEqual(Uint8Array.of(0xd4, 0xfe))
    expect(r.get(18)!.max).toEqual(Uint8Array.of(0x2c, 0x01))
    expect(r.get(7)!.info).toBe(2)
    expect(r.get(7)!.cur).toBeUndefined()
    expect(r.get(9)!.err).toBe('Input/output error')
  })
  it('parseXuGet keeps len/info when only GET_CUR failed', () => {
    const r = parseXuGet('sel=8 len=4096 info=03 err=Input/output error\n')
    expect(r.get(8)).toEqual({ len: 4096, info: 3, err: 'Input/output error' })
  })
})
