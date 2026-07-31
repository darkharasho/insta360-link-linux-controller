export interface JoystickDelta { dpan: number; dtilt: number }

/** Per-axis speed multiplier at full deflection, in control steps per tick. */
const GAIN = 3
/** Fraction of the radius treated as a no-move deadzone around center. */
const DEADZONE = 0.12

/**
 * Convert a joystick knob offset (px from center, screen coords) into per-tick
 * pan/tilt deltas. Speed is proportional to deflection with a squared response
 * curve for fine control near center; screen y grows downward while tilt grows
 * upward, so the tilt axis is inverted.
 */
export function joystickDelta(
  dx: number,
  dy: number,
  radius: number,
  panStep: number,
  tiltStep: number,
): JoystickDelta {
  const shape = (v: number) => {
    const n = Math.max(-1, Math.min(1, v / radius))
    if (Math.abs(n) < DEADZONE) return 0
    const t = (Math.abs(n) - DEADZONE) / (1 - DEADZONE)
    return Math.sign(n) * t * t
  }
  // `+ 0` normalizes the -0 that negating a zero deflection produces.
  return {
    dpan: shape(dx) * GAIN * panStep + 0,
    dtilt: -shape(dy) * GAIN * tiltStep + 0,
  }
}
