export interface Device { id: string; name: string; captureNode: string; nodes: string[] }
export interface Control {
  name: string
  kind: 'int' | 'bool' | 'menu'
  value: number
  min?: number; max?: number; step?: number; default?: number
  menu?: Record<number, string>
  inactive: boolean
}
export interface CameraSnapshot { device: Device; controls: Control[] }
export type AiFraming = 'head' | 'half' | 'full'
export type Scene = 'normal' | 'deskview' | 'whiteboard' | 'overhead'
