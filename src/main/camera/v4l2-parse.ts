import type { Control } from '../../shared/types.js'

/**
 * A reported value outside the control's own range is not a position, it is
 * junk: an Insta360 Link 2 that has not been driven since plug-in answers
 * GET_CUR for pan/tilt with values like 37362756 (range +-522000). Taking that
 * at face value makes the UI think the gimbal is parked hard right, so the
 * first nudge clamps to max and the camera swings across its whole travel.
 * Fall back to the control's default -- the centre, for pan/tilt -- and only
 * clamp if the firmware's default is itself out of range.
 */
function sane(value: number, min?: number, max?: number, def?: number): number {
  if (min === undefined || max === undefined) return value
  if (value >= min && value <= max) return value
  if (def !== undefined && def >= min && def <= max) return def
  return Math.min(max, Math.max(min, value))
}

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
      const min = num('min'), max = num('max'), def = num('default')
      current = {
        name, kind: kind as Control['kind'],
        value: sane(num('value') ?? 0, min, max, def),
        min, max, step: num('step'), default: def,
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
