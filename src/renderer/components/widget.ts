import type { Control } from '../../shared/types'

export type Widget = 'slider' | 'switch' | 'select'

export function widgetFor(c: Control): Widget {
  if (c.kind === 'bool') return 'switch'
  if (c.kind === 'menu') return 'select'
  // An int that only takes 0 or 1 (e.g. backlight compensation) is an on/off.
  if (c.min === 0 && c.max === 1) return 'switch'
  return 'slider'
}

/** UVC exposure-mode names, as the camera vendors' own apps label them. */
const EXPOSURE_MODES: Record<string, string> = {
  'Manual Mode': 'Manual',
  'Aperture Priority Mode': 'Auto',
  'Auto Mode': 'Auto',
  'Shutter Priority Mode': 'Shutter priority',
}

/** Menu entries to display for a control. */
export function menuFor(c: Control): Record<number, string> | undefined {
  if (c.name !== 'auto_exposure' || !c.menu) return c.menu
  return Object.fromEntries(Object.entries(c.menu).map(([k, v]) => [k, EXPOSURE_MODES[v] ?? v]))
}

/** Friendly display names for the v4l2 control ids the Link cameras expose. */
const LABELS: Record<string, string> = {
  focus_automatic_continuous: 'Auto focus',
  focus_absolute: 'Manual focus',
  white_balance_automatic: 'Auto white balance',
  white_balance_temperature: 'White balance',
  power_line_frequency: 'Anti-flicker',
  exposure_auto: 'Auto exposure',
  exposure_absolute: 'Exposure',
  auto_exposure: 'Exposure mode',
  exposure_time_absolute: 'Shutter',
  backlight_compensation: 'Backlight compensation',
}

export function labelFor(name: string): string {
  const known = LABELS[name]
  if (known) return known
  const pretty = name.replace(/_/g, ' ')
  return pretty.charAt(0).toUpperCase() + pretty.slice(1)
}
