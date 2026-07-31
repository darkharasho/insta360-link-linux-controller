import { describe, it, expect } from 'vitest'
import { holdSpeed } from './hold-ramp'

describe('holdSpeed', () => {
  it('starts at 1 step per tick', () => {
    expect(holdSpeed(0)).toBe(1)
    expect(holdSpeed(699)).toBe(1)
  })
  it('ramps up the longer the button is held', () => {
    expect(holdSpeed(700)).toBe(2)
    expect(holdSpeed(1400)).toBe(3)
  })
  it('caps at 4 steps per tick', () => {
    expect(holdSpeed(2100)).toBe(4)
    expect(holdSpeed(60_000)).toBe(4)
  })
})
