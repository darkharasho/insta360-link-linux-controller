import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseControls } from './v4l2-parse'

const ctrls = readFileSync('tests/fixtures/list-ctrls.txt', 'utf8')

describe('parseControls', () => {
  it('parses int controls with ranges', () => {
    const c = parseControls(ctrls).find((x) => x.name === 'brightness')!
    expect(c).toMatchObject({ kind: 'int', min: 0, max: 100, step: 1, default: 50, value: 50, inactive: false })
  })
  it('parses bool controls', () => {
    const c = parseControls(ctrls).find((x) => x.name === 'white_balance_automatic')!
    expect(c.kind).toBe('bool'); expect(c.value).toBe(1)
  })
  it('parses menu controls with entries', () => {
    const c = parseControls(ctrls).find((x) => x.name === 'power_line_frequency')!
    expect(c.kind).toBe('menu')
    expect(c.menu).toEqual({ 0: 'Disabled', 1: '50 Hz', 2: '60 Hz' })
  })
  it('flags inactive controls', () => {
    const c = parseControls(ctrls).find((x) => x.name === 'white_balance_temperature')!
    expect(c.inactive).toBe(true)
  })
  it('parses camera controls too', () => {
    expect(parseControls(ctrls).find((x) => x.name === 'zoom_absolute')!.max).toBe(400)
  })

  it('replaces an out-of-range reported value with the control default', () => {
    // A Link 2 that has not been driven since plug-in answers GET_CUR for
    // pan/tilt with junk; believing it makes the UI think the gimbal is parked
    // at the far end of its travel.
    const [pan] = parseControls(
      '                   pan_absolute 0x009a0908 (int)    : min=-522000 max=522000 step=3600 default=0 value=37362756 flags=has-min-max',
    )
    expect(pan.value).toBe(0)
  })

  it('keeps an in-range value untouched', () => {
    const [pan] = parseControls(
      '                   pan_absolute 0x009a0908 (int)    : min=-522000 max=522000 step=3600 default=0 value=-14400 flags=has-min-max',
    )
    expect(pan.value).toBe(-14400)
  })
})
