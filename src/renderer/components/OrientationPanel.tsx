import { FlipHorizontal2, RotateCw } from 'lucide-react'
import type { Orientation } from '../effects/orient'
import { Switch } from './ui/switch'

interface Props {
  orient: Orientation
  onChange: (o: Orientation) => void
  disabled?: boolean
}

const ROWS: {
  key: keyof Orientation
  label: string
  hint: string
  Icon: typeof RotateCw
}[] = [
  { key: 'rotate180', label: 'Rotate 180°', hint: 'Fix an upside-down camera', Icon: RotateCw },
  { key: 'mirror', label: 'Mirror', hint: 'Flip horizontally (selfie view)', Icon: FlipHorizontal2 },
]

/**
 * Software rotate/mirror, per camera. The Link exposes no hardware flip —
 * neither a V4L2 control nor a known XU selector — so an upside-down start
 * can only be corrected in the render pipeline.
 */
export function OrientationPanel({ orient, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Orientation</p>
      {ROWS.map(({ key, label, hint, Icon }) => (
        <div key={key} className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className={disabled ? 'text-sm text-muted-foreground' : 'text-sm'}>{label}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          </div>
          <Switch
            checked={orient[key]}
            disabled={disabled}
            onCheckedChange={(v) => onChange({ ...orient, [key]: v })}
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Software rotation, saved per camera. Applies to the preview and the virtual camera —
        not to apps reading the camera directly.
      </p>
    </div>
  )
}
