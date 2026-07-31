import type { AiFraming, CameraMode } from '../../shared/types'
import { Segmented } from './ui/segmented'

interface Props {
  mode: CameraMode
  framing: AiFraming
  onModeChange: (m: CameraMode) => void
  onFramingChange: (f: AiFraming) => void
  disabled: boolean
}

const MODES: { value: CameraMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'ai', label: 'AI Track' },
  { value: 'deskview', label: 'DeskView' },
  { value: 'whiteboard', label: 'Whiteboard' },
  { value: 'overhead', label: 'Overhead' },
]

const FRAMINGS: { value: AiFraming; label: string }[] = [
  { value: 'head', label: 'Head' },
  { value: 'half', label: 'Half body' },
  { value: 'full', label: 'Full body' },
]

// Single source of truth for the hardware "mode" selector: AI tracking and
// the fixed scene modes are mutually exclusive on the device, so they share
// one control here instead of two independent panels. The selected mode/
// framing state lives in useCamera so presets can capture and restore it.
export function ModeControl({ mode, framing, onModeChange, onFramingChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Mode</p>
        <Segmented options={MODES} value={mode} onChange={onModeChange} disabled={disabled} cols="grid-cols-2" />
      </div>

      {mode === 'ai' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Framing</p>
          <Segmented options={FRAMINGS} value={framing} onChange={onFramingChange} disabled={disabled} cols="grid-cols-3" />
        </div>
      )}
    </div>
  )
}
