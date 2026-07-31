import { useState } from 'react'
import type { AiFraming } from '../../shared/types'
import { Switch } from './ui/switch'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'

interface Props {
  setAi: (on: boolean) => void
  setFraming: (mode: AiFraming) => void
}

const FRAMINGS: { value: AiFraming; label: string }[] = [
  { value: 'head', label: 'Head' },
  { value: 'half', label: 'Half body' },
  { value: 'full', label: 'Full body' },
]

export function AiTracking({ setAi, setFraming }: Props) {
  const [on, setOn] = useState(false)
  const [framing, setFramingState] = useState<AiFraming>('half')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">AI Tracking</p>
          <p className="text-xs text-muted-foreground">Automatically follow the subject</p>
        </div>
        <Switch
          checked={on}
          onCheckedChange={(checked) => {
            setOn(checked)
            setAi(checked)
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Framing</p>
        <Tabs
          value={framing}
          onValueChange={(v) => {
            const mode = v as AiFraming
            setFramingState(mode)
            setFraming(mode)
          }}
        >
          <TabsList className="grid w-full grid-cols-3">
            {FRAMINGS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} disabled={!on}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  )
}
