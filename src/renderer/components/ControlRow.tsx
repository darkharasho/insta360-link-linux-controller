import type { Control } from '../../shared/types'
import { widgetFor, labelFor, menuFor } from './widget'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface Props {
  control: Control
  onChange: (value: number) => void
  /** Overrides the label derived from the control name. */
  label?: string
  /** Shown beside the label, e.g. the current value with its unit. */
  hint?: string
}

/** One camera control as a labelled switch, slider or select. */
export function ControlRow({ control: c, onChange, label, hint }: Props) {
  const widget = widgetFor(c)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={c.inactive ? 'text-sm text-muted-foreground' : 'text-sm'}>{label ?? labelFor(c.name)}</span>
        {hint && widget !== 'switch' && <span className="text-xs tabular-nums text-muted-foreground">{hint}</span>}
        {widget === 'switch' && (
          <Switch checked={c.value !== 0} disabled={c.inactive} onCheckedChange={(checked) => onChange(checked ? 1 : 0)} />
        )}
      </div>
      {widget === 'slider' && (
        <Slider
          disabled={c.inactive}
          min={c.min ?? 0}
          max={c.max ?? 100}
          step={c.step ?? 1}
          value={[c.value]}
          onValueChange={([v]) => onChange(v)}
        />
      )}
      {widget === 'select' && (
        <Select value={String(c.value)} disabled={c.inactive} onValueChange={(v) => onChange(Number(v))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(menuFor(c) ?? {}).map(([v, text]) => (
              <SelectItem key={v} value={v}>
                {text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
