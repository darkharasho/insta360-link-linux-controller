import type { Device, Control } from '../../shared/types.js'

export function parseListDevices(raw: string): Device[] {
  const blocks = raw.split(/\n(?=\S)/) // split on non-indented header lines
  const devices: Device[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const header = lines[0]
    if (!/Insta360 Link/i.test(header)) continue
    const idMatch = header.match(/\(([^)]*)\)\s*:/)
    const id = idMatch ? idMatch[1] : header.trim()
    const name = header.replace(/\s*\([^)]*\)\s*:\s*$/, '').trim()
    // Tidy display name: v4l2 reports "Insta360 Link 2: Insta360 Link" — the
    // part before the colon is the human-friendly model name.
    const label = name.split(':')[0].trim() || name
    const nodes = lines
      .map((l) => l.trim())
      .filter((l) => l.startsWith('/dev/'))
    const captureNode = nodes.find((n) => n.startsWith('/dev/video')) ?? ''
    if (!captureNode) continue
    devices.push({ id, name, label, captureNode, nodes })
  }
  return devices
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
