import type { Control } from '../../shared/types'
import { widgetFor } from './widget'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

const PTZ_NAMES = new Set(['pan_absolute', 'tilt_absolute', 'zoom_absolute'])

function label(name: string) {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

interface Props {
  controls: Control[]
  setControl: (name: string, value: number) => void
}

export function ImageSettings({ controls, setControl }: Props) {
  const rows = controls.filter((c) => !PTZ_NAMES.has(c.name))

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No image controls reported by this camera.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((c) => (
        <div key={c.name} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className={c.inactive ? 'text-sm text-muted-foreground' : 'text-sm'}>{label(c.name)}</span>
            {widgetFor(c) === 'switch' && (
              <Switch
                checked={c.value !== 0}
                disabled={c.inactive}
                onCheckedChange={(checked) => setControl(c.name, checked ? 1 : 0)}
              />
            )}
          </div>
          {widgetFor(c) === 'slider' && (
            <Slider
              disabled={c.inactive}
              min={c.min ?? 0}
              max={c.max ?? 100}
              step={c.step ?? 1}
              value={[c.value]}
              onValueChange={([v]) => setControl(c.name, v)}
            />
          )}
          {widgetFor(c) === 'select' && (
            <Select
              value={String(c.value)}
              disabled={c.inactive}
              onValueChange={(v) => setControl(c.name, Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(c.menu ?? {}).map(([v, text]) => (
                  <SelectItem key={v} value={v}>
                    {text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}
    </div>
  )
}
