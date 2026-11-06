import type { VideoMode } from '../../../shared/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { formatMode } from '../../preview-mode'

const AUTO = 'auto'
const keyOf = (m: VideoMode) => `${m.width}x${m.height}@${m.fps}`

interface Props {
  modes: VideoMode[]
  value: VideoMode | null
  onChange: (m: VideoMode | null) => void
  disabled?: boolean
}

/** Resolution/fps for this app's own preview (other apps choose their own). */
export function PreviewModePicker({ modes, value, onChange, disabled }: Props) {
  return (
    <Select
      value={value ? keyOf(value) : AUTO}
      disabled={disabled || modes.length === 0}
      onValueChange={(k) => onChange(k === AUTO ? null : modes.find((m) => keyOf(m) === k) ?? null)}
    >
      <SelectTrigger className="h-9 w-48" aria-label="Preview resolution">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO}>Preview: Auto</SelectItem>
        {modes.map((m) => (
          <SelectItem key={keyOf(m)} value={keyOf(m)}>
            {formatMode(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
