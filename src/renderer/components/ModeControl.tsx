import { useState } from 'react'
import type { AiFraming, Scene } from '../../shared/types'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'

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

// Single source of truth for the hardware "mode" selector: AI tracking and
// the fixed scene modes are mutually exclusive on the device, so they share
// one control here instead of two independent panels.
export function ModeControl({ setAi, setFraming, setScene, disabled }: Props) {
  const [mode, setMode] = useState<Mode>('normal')
  const [framing, setFramingState] = useState<AiFraming>('half')

  const handleModeChange = async (v: string) => {
    const next = v as Mode
    const prev = mode
    setMode(next)
    const ok = next === 'ai' ? await setAi(true) : await setScene(next === 'normal' ? 'normal' : next)
    if (!ok) setMode(prev)
  }

  const handleFramingChange = async (v: string) => {
    const next = v as AiFraming
    const prev = framing
    setFramingState(next)
    const ok = await setFraming(next)
    if (!ok) setFramingState(prev)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Mode</p>
        <Tabs value={mode} onValueChange={handleModeChange}>
          <TabsList className="grid w-full grid-cols-2 gap-1">
            {MODES.map((m) => (
              <TabsTrigger key={m.value} value={m.value} disabled={disabled}>
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {mode === 'ai' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Framing</p>
          <Tabs value={framing} onValueChange={handleFramingChange}>
            <TabsList className="grid w-full grid-cols-3">
              {FRAMINGS.map((f) => (
                <TabsTrigger key={f.value} value={f.value} disabled={disabled}>
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}
    </div>
  )
}
