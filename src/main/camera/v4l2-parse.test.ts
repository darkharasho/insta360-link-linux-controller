import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListDevices } from './v4l2-parse'

const raw = readFileSync('tests/fixtures/list-devices.txt', 'utf8')

describe('parseListDevices', () => {
  it('returns only Insta360 Link cameras', () => {
    const d = parseListDevices(raw)
    expect(d.map((x) => x.name)).toEqual([
      'Insta360 Link 2: Insta360 Link',
      'Insta360 Link 2 Pro: Insta360 L',
    ])
  })
  it('picks the first video node as the capture node', () => {
    const d = parseListDevices(raw)
    expect(d[0].captureNode).toBe('/dev/video1')
    expect(d[1].captureNode).toBe('/dev/video5')
  })
  it('uses the USB token as a stable id', () => {
    expect(parseListDevices(raw)[0].id).toBe('usb-0000:11:00.4-1.4.1.1')
  })
  it('ignores non-video nodes for captureNode', () => {
    const d = parseListDevices(raw)
    expect(d[0].captureNode.startsWith('/dev/video')).toBe(true)
  })
})
