export type CameraFamily = 'insta360-link' | 'elgato-facecam-4k'

export interface Device {
  /** Which camera line this is; decides the available commands and UI. */
  family: CameraFamily
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
  /** USB device sysfs dir (holds idVendor, descriptors, devnum). */
  usbPath?: string
  /** USB device number; changes on every replug. */
  devnum?: string
  /** USB serial number, when the camera reports one (the Facecam does). */
  serial?: string
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

/** Elgato vendor controls the app may write. See src/main/camera/facecam-map.ts. */
export type FacecamKey = 'metering' | 'tint' | 'hdr' | 'nr2d' | 'nr3d'
export interface FacecamControl { key: FacecamKey; value: number; min: number; max: number; default: number }
/** Live auto-exposure/AWB state; null = not readable right now. exposure is in 100 µs units. */
export interface FacecamReadouts { iso: number | null; exposure: number | null; wbKelvin: number | null; tint: number | null }
export interface FacecamState { firmware: string; serial: string; controls: FacecamControl[] }

export interface VideoMode { width: number; height: number; fps: number }
/** Who else has the camera open, and the mode it is set to (null when unknown). */
export interface StreamUsage { holders: string[]; mode: VideoMode | null }
