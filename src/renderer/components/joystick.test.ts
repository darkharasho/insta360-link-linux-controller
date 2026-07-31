import { describe, it, expect } from 'vitest'
import { joystickDelta } from './joystick'

const R = 50
const PAN_STEP = 3600
const TILT_STEP = 3600

describe('joystickDelta', () => {
  it('is zero at center and inside the deadzone', () => {
    expect(joystickDelta(0, 0, R, PAN_STEP, TILT_STEP)).toEqual({ dpan: 0, dtilt: 0 })
    expect(joystickDelta(3, -3, R, PAN_STEP, TILT_STEP)).toEqual({ dpan: 0, dtilt: 0 })
  })
  it('full right deflection pans right at full speed, no tilt', () => {
    const d = joystickDelta(R, 0, R, PAN_STEP, TILT_STEP)
    expect(d.dpan).toBeGreaterThan(0)
    expect(d.dpan).toBe(3 * PAN_STEP)
    expect(d.dtilt).toBe(0)
  })
  it('dragging up tilts up (screen y is inverted)', () => {
    const d = joystickDelta(0, -R, R, PAN_STEP, TILT_STEP)
    expect(d.dtilt).toBe(3 * TILT_STEP)
    expect(d.dpan).toBe(0)
  })
  it('is proportional: half deflection is slower than full', () => {
    const half = joystickDelta(R / 2, 0, R, PAN_STEP, TILT_STEP)
    const full = joystickDelta(R, 0, R, PAN_STEP, TILT_STEP)
    expect(half.dpan).toBeGreaterThan(0)
    expect(half.dpan).toBeLessThan(full.dpan)
  })
  it('clamps deflection beyond the radius to full speed', () => {
    const beyond = joystickDelta(R * 3, 0, R, PAN_STEP, TILT_STEP)
    expect(beyond.dpan).toBe(3 * PAN_STEP)
  })
})
