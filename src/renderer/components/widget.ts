import type { Control } from '../../shared/types'

export type Widget = 'slider' | 'switch' | 'select'

export function widgetFor(c: Control): Widget {
  if (c.kind === 'bool') return 'switch'
  if (c.kind === 'menu') return 'select'
  return 'slider'
}

/** Friendly display names for the v4l2 control ids the Link cameras expose. */
const LABELS: Record<string, string> = {
  focus_automatic_continuous: 'Auto focus',
  focus_absolute: 'Manual focus',
  white_balance_automatic: 'Auto white balance',
  white_balance_temperature: 'White balance',
  power_line_frequency: 'Power line frequency',
  exposure_auto: 'Auto exposure',
  exposure_absolute: 'Exposure',
}

export function labelFor(name: string): string {
  const known = LABELS[name]
  if (known) return known
  const pretty = name.replace(/_/g, ' ')
  return pretty.charAt(0).toUpperCase() + pretty.slice(1)
}
