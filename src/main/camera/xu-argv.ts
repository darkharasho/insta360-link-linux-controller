import type { AiFraming, Scene } from '../../shared/types.js'

export type XuCommand =
  | { kind: 'ai'; on: boolean }
  | { kind: 'framing'; mode: AiFraming }
  | { kind: 'scene'; scene: Scene }
  | { kind: 'reset' }

export function xuArgv(dev: string, cmd: XuCommand): string[] {
  switch (cmd.kind) {
    case 'ai': return [dev, 'ai', cmd.on ? 'on' : 'off']
    case 'framing': return [dev, 'framing', cmd.mode]
    case 'scene': return [dev, 'scene', cmd.scene]
    case 'reset': return [dev, 'reset']
  }
}

/** One selector's answer from `link-xu <dev> xu-get`. Byte arrays are in device order. */
export interface XuReading {
  len: number
  info: number
  cur?: Uint8Array
  min?: Uint8Array
  max?: Uint8Array
  def?: Uint8Array
  err?: string
}

/** Read-only query of several selectors of one extension unit, in one process. */
export function xuGetArgv(dev: string, unit: number, sels: number[]): string[] {
  return [dev, 'xu-get', String(unit), sels.join(',')]
}

/** SET_CUR of one selector; the helper rejects a payload whose size isn't GET_LEN. */
export function xuSetArgv(dev: string, unit: number, sel: number, hex: string): string[] {
  return [dev, 'xu-set', String(unit), String(sel), hex]
}

const hexBytes = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16))

export function parseXuGet(stdout: string): Map<number, XuReading> {
  const out = new Map<number, XuReading>()
  for (const line of stdout.split('\n')) {
    const sel = line.match(/^sel=(\d+)\s*(.*)$/)
    if (!sel) continue
    const rest = sel[2]
    const err = rest.match(/^err=(.*)$/)
    if (err) {
      out.set(Number(sel[1]), { len: 0, info: 0, err: err[1].trim() })
      continue
    }
    const field = (k: string) => rest.match(new RegExp(`(?:^|\\s)${k}=([0-9a-f]+)`))?.[1]
    const r: XuReading = { len: Number(field('len') ?? 0), info: parseInt(field('info') ?? '0', 16) }
    const curErr = rest.match(/(?:^|\s)err=(.*)$/)
    if (curErr) r.err = curErr[1].trim()
    for (const k of ['cur', 'min', 'max', 'def'] as const) {
      const v = field(k)
      if (v !== undefined) r[k] = hexBytes(v)
    }
    out.set(Number(sel[1]), r)
  }
  return out
}
