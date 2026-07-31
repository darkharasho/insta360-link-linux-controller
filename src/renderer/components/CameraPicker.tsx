import { Video } from 'lucide-react'
import type { Device } from '../../shared/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface Props {
  devices: Device[]
  current: Device | null
  onSelect: (d: Device) => void
}

export function CameraPicker({ devices, current, onSelect }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Video className="h-4 w-4 text-muted-foreground" />
      <Select
        value={current?.id ?? ''}
        onValueChange={(id) => {
          const d = devices.find((x) => x.id === id)
          if (d) onSelect(d)
        }}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="No camera found" />
        </SelectTrigger>
        <SelectContent>
          {devices.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
