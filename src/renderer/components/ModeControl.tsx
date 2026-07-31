import { useState } from 'react'
import type { AiFraming, Scene } from '../../shared/types'
import { cn } from '../lib/utils'

type Mode = 'normal' | 'ai' | Exclude<Scene, 'normal'>

interface Props {
  setAi: (on: boolean) => Promise<boolean>
  setFraming: (mode: AiFraming) => Promise<boolean>
  setScene: (scene: Scene) => Promise<boolean>
  disabled: boolean
}

const MODES: { value: Mode; label: string }[] = [
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
// one control here instead of two independent panels.
export function ModeControl({ setAi, setFraming, setScene, disabled }: Props) {
  const [mode, setMode] = useState<Mode>('normal')
  const [framing, setFramingState] = useState<AiFraming>('half')

  const handleModeChange = async (next: Mode) => {
    const prev = mode
    setMode(next)
    const ok = next === 'ai' ? await setAi(true) : await setScene(next === 'normal' ? 'normal' : next)
    if (!ok) setMode(prev)
  }

  const handleFramingChange = async (next: AiFraming) => {
    const prev = framing
    setFramingState(next)
    const ok = await setFraming(next)
    if (!ok) setFramingState(prev)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Mode</p>
        <Segmented options={MODES} value={mode} onChange={handleModeChange} disabled={disabled} cols="grid-cols-2" />
      </div>

      {mode === 'ai' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Framing</p>
          <Segmented options={FRAMINGS} value={framing} onChange={handleFramingChange} disabled={disabled} cols="grid-cols-3" />
        </div>
      )}
    </div>
  )
}
