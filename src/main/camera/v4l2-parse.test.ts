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
})
