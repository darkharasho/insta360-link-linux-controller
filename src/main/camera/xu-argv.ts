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
