/**
 * Find the capture node of a v4l2loopback device by its card label in
 * `v4l2-ctl --list-devices` output. Only loopback blocks match, so a real
 * camera with a similar name can never be picked as the virtual output.
 */
export function findLoopbackDevice(raw: string, name: string): string | null {
  for (const block of raw.split(/\n(?=\S)/)) {
    const lines = block.split('\n')
    const header = lines[0] ?? ''
    if (!header.includes('platform:v4l2loopback')) continue
    if (!header.trim().startsWith(name)) continue
    const node = lines.map((l) => l.trim()).find((l) => l.startsWith('/dev/video'))
    if (node) return node
  }
  return null
}
