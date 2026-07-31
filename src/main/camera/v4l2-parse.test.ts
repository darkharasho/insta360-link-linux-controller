import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListDevices, parseControls } from './v4l2-parse'

const raw = readFileSync('tests/fixtures/list-devices.txt', 'utf8')
const ctrls = readFileSync('tests/fixtures/list-ctrls.txt', 'utf8')

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
  it('derives a tidy label from the part before the colon', () => {
    const d = parseListDevices(raw)
    expect(d.map((x) => x.label)).toEqual(['Insta360 Link 2', 'Insta360 Link 2 Pro'])
  })
  it('ignores non-video nodes for captureNode', () => {
    const d = parseListDevices(raw)
    expect(d[0].captureNode.startsWith('/dev/video')).toBe(true)
  })
  it('excludes v4l2loopback virtual cameras even when named Insta360', () => {
    const d = parseListDevices(raw)
    expect(d.map((x) => x.label)).not.toContain('Insta360 Link Filtered')
    expect(d).toHaveLength(2)
  })
})

describe('parseControls', () => {
  it('parses int controls with ranges', () => {
    const c = parseControls(ctrls).find((x) => x.name === 'brightness')!
    expect(c).toMatchObject({ kind: 'int', min: 0, max: 100, step: 1, default: 50, value: 50, inactive: false })
  })
  it('parses bool controls', () => {
    const c = parseControls(ctrls).find((x) => x.name === 'white_balance_automatic')!
    expect(c.kind).toBe('bool'); expect(c.value).toBe(1)
  })
  it('parses menu controls with entries', () => {
    const c = parseControls(ctrls).find((x) => x.name === 'power_line_frequency')!
    expect(c.kind).toBe('menu')
    expect(c.menu).toEqual({ 0: 'Disabled', 1: '50 Hz', 2: '60 Hz' })
  })
  it('flags inactive controls', () => {
    const c = parseControls(ctrls).find((x) => x.name === 'white_balance_temperature')!
    expect(c.inactive).toBe(true)
  })
  it('parses camera controls too', () => {
    expect(parseControls(ctrls).find((x) => x.name === 'zoom_absolute')!.max).toBe(400)
  })
})
