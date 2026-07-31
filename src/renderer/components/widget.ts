import type { Control } from '../../shared/types'

export type Widget = 'slider' | 'switch' | 'select'

export function widgetFor(c: Control): Widget {
  if (c.kind === 'bool') return 'switch'
  if (c.kind === 'menu') return 'select'
  return 'slider'
}
