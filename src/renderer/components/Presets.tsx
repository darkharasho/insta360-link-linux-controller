import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Save, Trash2, X } from 'lucide-react'
import type { AppPreset, Device } from '../../shared/types'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { cn } from '../lib/utils'

interface Props {
  device: Device | null
  captureCurrent: () => Promise<Record<string, number>>
  /** Called after a successful apply — the camera is now in Normal mode. */
  onApplied?: () => void
  listAppPresets: () => Promise<AppPreset[]>
  saveAppPreset: (name: string, values: Record<string, number>) => Promise<boolean>
  applyAppPreset: (name: string) => Promise<boolean>
  removeAppPreset: (name: string) => Promise<boolean>
  reset: () => Promise<boolean>
}

const SLOT_PREFIX = 'slot:'
const SLOTS = [1, 2, 3, 4, 5, 6]

export function Presets({ device, captureCurrent, onApplied, listAppPresets, saveAppPreset, applyAppPreset, removeAppPreset, reset }: Props) {
  const [appPresets, setAppPresets] = useState<AppPreset[]>([])
  const [name, setName] = useState('')

  const loadAppPresets = useCallback(async () => {
    if (!device) {
      setAppPresets([])
      return
    }
    setAppPresets(await listAppPresets())
  }, [device, listAppPresets])

  useEffect(() => { loadAppPresets() }, [loadAppPresets])

  const filled = new Set(appPresets.map((p) => p.name))
  const named = appPresets.filter((p) => !p.name.startsWith(SLOT_PREFIX))

  const clickSlot = async (n: number) => {
    if (!device) return
    const key = `${SLOT_PREFIX}${n}`
    if (filled.has(key)) {
      if (await applyAppPreset(key)) {
        onApplied?.()
        loadAppPresets()
      }
      return
    }
    const values = await captureCurrent()
    if (Object.keys(values).length && (await saveAppPreset(key, values))) loadAppPresets()
  }

  const clearSlot = async (n: number) => {
    if (!device) return
    if (await removeAppPreset(`${SLOT_PREFIX}${n}`)) loadAppPresets()
  }

  const saveNamed = async () => {
    if (!device || !name.trim()) return
    const values = await captureCurrent()
    if (!Object.keys(values).length) return
    if (await saveAppPreset(name.trim(), values)) {
      setName('')
      loadAppPresets()
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Quick slots</p>
        <div className="grid grid-cols-3 gap-1.5">
          {SLOTS.map((n) => {
            const isFilled = filled.has(`${SLOT_PREFIX}${n}`)
            return (
              <div key={n} className="group relative">
                <button
                  disabled={!device}
                  onClick={() => clickSlot(n)}
                  className={cn(
                    'flex h-12 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors disabled:opacity-40',
                    isFilled
                      ? 'border-primary/50 bg-primary/15 text-primary hover:bg-primary/25'
                      : 'border-dashed border-input text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                  title={isFilled ? `Recall position ${n}` : `Save current position to slot ${n}`}
                >
                  {n}
                </button>
                {isFilled && device && (
                  <button
                    onClick={() => clearSlot(n)}
                    aria-label={`Clear slot ${n}`}
                    className="absolute -right-1 -top-1 hidden rounded-full bg-secondary p-0.5 text-muted-foreground shadow group-hover:block hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Click an empty slot to save the current position; a filled slot to recall it.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Named presets</p>
        <div className="flex gap-1.5">
          <input
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            placeholder="Preset name"
            value={name}
            disabled={!device}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveNamed() }}
          />
          <Button variant="secondary" size="icon" disabled={!device || !name.trim()} onClick={saveNamed} aria-label="Save preset">
            <Save className="h-4 w-4" />
          </Button>
        </div>

        {named.length === 0 ? (
          <p className="text-xs text-muted-foreground">No named presets yet.</p>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-1 p-2">
              {named.map((p) => (
                <div key={p.name} className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-accent">
                  <span className="text-sm">{p.name}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => { if (await applyAppPreset(p.name)) onApplied?.() }}
                    >
                      Apply
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${p.name}`}
                      onClick={async () => { if (await removeAppPreset(p.name)) loadAppPresets() }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Button variant="outline" disabled={!device} onClick={() => reset()} className="gap-2">
        <RotateCcw className="h-4 w-4" />
        Recenter gimbal
      </Button>
    </div>
  )
}
