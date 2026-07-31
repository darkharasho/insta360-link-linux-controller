import type { AiFraming, CameraMode } from '../../shared/types'
import { cn } from '../lib/utils'

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

function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  cols,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  disabled: boolean
  cols: string
}) {
  return (
    <div className={cn('grid gap-1 rounded-lg bg-muted p-1', cols)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
            value === o.value
              ? 'bg-background text-foreground shadow'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

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
