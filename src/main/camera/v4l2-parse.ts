import type { Device } from '../../shared/types'

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
    const nodes = lines
      .map((l) => l.trim())
      .filter((l) => l.startsWith('/dev/'))
    const captureNode = nodes.find((n) => n.startsWith('/dev/video')) ?? ''
    if (!captureNode) continue
    devices.push({ id, name, captureNode, nodes })
  }
  return devices
}
