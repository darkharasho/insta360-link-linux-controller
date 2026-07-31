import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Save, Trash2 } from 'lucide-react'
import type { AppPreset, Control, Device } from '../../shared/types'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'

interface Props {
  device: Device | null
  controls: Control[]
  listAppPresets: () => Promise<AppPreset[]>
  saveAppPreset: (name: string, values: Record<string, number>) => Promise<boolean>
  applyAppPreset: (name: string) => Promise<boolean>
  removeAppPreset: (name: string) => Promise<boolean>
  reset: () => Promise<boolean>
}

export function Presets({ device, controls, listAppPresets, saveAppPreset, applyAppPreset, removeAppPreset, reset }: Props) {
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

  const save = async () => {
    if (!device || !name.trim()) return
    // Only capture active controls: inactive/read-only controls (e.g. a menu
    // control disabled because a related control is off) don't reflect a
    // meaningful position and shouldn't be replayed on apply.
    const values = Object.fromEntries(
      controls.filter((c) => !c.inactive).map((c) => [c.name, c.value]),
    )
    const ok = await saveAppPreset(name.trim(), values)
    if (ok) {
      setName('')
      loadAppPresets()
    }
  }

  const apply = async (p: AppPreset) => {
    if (!device) return
    await applyAppPreset(p.name)
  }

  const remove = async (p: AppPreset) => {
    if (!device) return
    const ok = await removeAppPreset(p.name)
    if (ok) loadAppPresets()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">App presets</p>
        <div className="flex gap-1.5">
          <input
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            placeholder="Preset name"
            value={name}
            disabled={!device}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
          />
          <Button variant="secondary" size="icon" disabled={!device || !name.trim()} onClick={save} aria-label="Save preset">
            <Save className="h-4 w-4" />
          </Button>
        </div>

        {appPresets.length === 0 ? (
          <p className="text-xs text-muted-foreground">No saved presets yet.</p>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-1 p-2">
              {appPresets.map((p) => (
                <div key={p.name} className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-accent">
                  <span className="text-sm">{p.name}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => apply(p)}>Apply</Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}>
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
