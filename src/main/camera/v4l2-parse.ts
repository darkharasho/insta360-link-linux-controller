import type { Control } from '../../shared/types.js'

export function parseControls(raw: string): Control[] {
  const controls: Control[] = []
  const lines = raw.split('\n')
  const ctrlLine = /^\s*(\w+)\s+0x[0-9a-f]+\s+\((int|bool|menu)\)\s*:\s*(.*)$/
  let current: Control | null = null
  for (const line of lines) {
    const m = line.match(ctrlLine)
    if (m) {
      const [, name, kind, rest] = m
      const num = (key: string) => {
        const mm = rest.match(new RegExp(`${key}=(-?\\d+)`))
        return mm ? Number(mm[1]) : undefined
      }
      current = {
        name, kind: kind as Control['kind'],
        value: num('value') ?? 0,
        min: num('min'), max: num('max'), step: num('step'), default: num('default'),
        inactive: /flags=[^\n]*inactive/.test(rest),
        ...(kind === 'menu' ? { menu: {} } : {}),
      }
      controls.push(current)
      continue
    }
    const menuEntry = line.match(/^\s+(\d+):\s+(.*)$/)
    if (menuEntry && current && current.menu) {
      current.menu[Number(menuEntry[1])] = menuEntry[2].trim()
    }
  }
  return controls
}
