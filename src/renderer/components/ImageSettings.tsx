import type { Control } from '../../shared/types'
import { ControlRow } from './ControlRow'

const PTZ_NAMES = new Set(['pan_absolute', 'tilt_absolute', 'zoom_absolute'])

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
        <ControlRow key={c.name} control={c} onChange={(v) => setControl(c.name, v)} />
      ))}
    </div>
  )
}
