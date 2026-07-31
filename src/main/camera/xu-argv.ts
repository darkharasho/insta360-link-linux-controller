import type { AiFraming, Scene } from '../../shared/types'

export type XuCommand =
  | { kind: 'ai'; on: boolean }
  | { kind: 'framing'; mode: AiFraming }
  | { kind: 'scene'; scene: Scene }
  | { kind: 'preset-recall'; slot: number }
  | { kind: 'preset-save'; slot: number }
  | { kind: 'reset' }

function assertSlot(slot: number) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 6) throw new Error(`preset slot out of range: ${slot}`)
}

export function xuArgv(dev: string, cmd: XuCommand): string[] {
  switch (cmd.kind) {
    case 'ai': return [dev, 'ai', cmd.on ? 'on' : 'off']
    case 'framing': return [dev, 'framing', cmd.mode]
    case 'scene': return [dev, 'scene', cmd.scene]
    case 'preset-recall': assertSlot(cmd.slot); return [dev, 'preset', 'recall', String(cmd.slot)]
    case 'preset-save': assertSlot(cmd.slot); return [dev, 'preset', 'save', String(cmd.slot)]
    case 'reset': return [dev, 'reset']
  }
}
