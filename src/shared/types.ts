export interface Device {
  /** Stable camera identity: usb:<vid>:<pid> for a model seen once, else the
   * port-path busId. Presets and color corrections are keyed by this. */
  id: string
  /** Port-path identity (v4l2 bus_info); pre-v0.3 data was keyed by this and
   * is migrated from it. Distinguishes duplicate same-model cameras. */
  busId?: string
  /** Full raw name from v4l2-ctl, e.g. "Insta360 Link 2: Insta360 Link". */
  name: string
  /** Short, tidy name for the UI, e.g. "Insta360 Link 2". */
  label: string
  captureNode: string
  nodes: string[]
  /** USB vendor id (hex, e.g. "2e1a"), when resolvable via udev. */
  vendorId?: string
  /** USB product id (hex, e.g. "4c04"), when resolvable via udev. */
  productId?: string
}
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
/** The camera's single hardware mode: manual, AI tracking, or a fixed scene. */
export type CameraMode = 'normal' | 'ai' | Exclude<Scene, 'normal'>
export interface AppPreset {
  name: string
  values: Record<string, number>
  /** Mode the camera was in when saved; recall restores it. Absent = normal. */
  mode?: CameraMode
  /** AI framing to restore when mode === 'ai'. */
  framing?: AiFraming
}
