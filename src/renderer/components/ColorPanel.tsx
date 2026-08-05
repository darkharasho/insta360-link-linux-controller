import { RotateCcw } from 'lucide-react'
import { NEUTRAL_COLOR, isNeutral, type ColorCorrection } from '../effects/color'
import { Slider } from './ui/slider'
import { Button } from './ui/button'

interface Props {
  color: ColorCorrection
  onChange: (c: ColorCorrection) => void
  disabled?: boolean
}

const signed = (v: number) => (v > 0 ? `+${v}` : String(v))

const AXES: {
  key: keyof ColorCorrection
  label: string
  min: number
  max: number
  step: number
  format: (v: number) => string
}[] = [
  { key: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1, format: signed },
  { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, format: signed },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, format: signed },
  { key: 'gamma', label: 'Gamma', min: 0.5, max: 2, step: 0.01, format: (v) => v.toFixed(2) },
]

/**
 * Software color correction, per camera. Unlike the hardware sliders above it,
 * these run in the render pipeline — they cover what the cameras' UVC set
 * cannot (tint, gamma) and rescue models whose firmware tuning looks off on
 * Linux without the official app's processing (Link 2 Pro).
 */
export function ColorPanel({ color, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Color correction</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={disabled || isNeutral(color)}
          onClick={() => onChange(NEUTRAL_COLOR)}
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>
      {AXES.map((axis) => (
        <div key={axis.key} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className={disabled ? 'text-sm text-muted-foreground' : 'text-sm'}>{axis.label}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{axis.format(color[axis.key])}</span>
          </div>
          <Slider
            disabled={disabled}
            min={axis.min}
            max={axis.max}
            step={axis.step}
            value={[color[axis.key]]}
            onValueChange={([v]) => onChange({ ...color, [axis.key]: v })}
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Software adjustment, saved per camera. Applies to the preview and the virtual camera —
        not to apps reading the camera directly.
      </p>
    </div>
  )
}
