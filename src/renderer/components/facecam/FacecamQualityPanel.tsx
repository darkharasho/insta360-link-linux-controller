import type { FacecamKey, FacecamState } from '../../../shared/types'
import { ControlRow } from '../ControlRow'
import { Segmented } from '../ui/segmented'
import { NR_PRESETS, nrPresetFor, type NrPreset } from '../../facecam-nr'
import { Section, asControl, vendor } from './shared'
import { useEffect, useState } from 'react'

const NR_OPTIONS: { value: NrPreset; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
  { value: 'custom', label: 'Custom' },
]

interface Props {
  facecam: FacecamState | null
  setFacecam: (key: FacecamKey, value: number) => void
}

export function FacecamQualityPanel({ facecam, setFacecam }: Props) {
  const hdr = vendor(facecam, 'hdr')
  const nr2d = vendor(facecam, 'nr2d')
  const nr3d = vendor(facecam, 'nr3d')
  const detected = nr2d && nr3d ? nrPresetFor(nr2d.value, nr3d.value) : 'custom'
  // "Custom" stays open while the sliders are dragged through preset values.
  const [custom, setCustom] = useState(false)
  useEffect(() => setCustom(false), [facecam?.serial])
  const preset: NrPreset = custom ? 'custom' : detected

  if (!facecam) return <p className="text-sm text-muted-foreground">Reading camera…</p>

  return (
    <div className="flex flex-col gap-6">
      {hdr && (
        <Section title="Dynamic range">
          <ControlRow control={{ ...asControl(hdr), kind: 'bool' }} label="HDR" onChange={(v) => setFacecam('hdr', v)} />
          <p className="-mt-2 text-xs text-muted-foreground">Only takes effect in 30 fps modes.</p>
        </Section>
      )}
      {nr2d && nr3d && (
        <Section title="Noise reduction">
          <Segmented
            options={NR_OPTIONS}
            value={preset}
            cols="grid-cols-5"
            onChange={(p) => {
              if (p === 'custom') return setCustom(true)
              setCustom(false)
              const [a, b] = NR_PRESETS[p]
              setFacecam('nr2d', a)
              setFacecam('nr3d', b)
            }}
          />
          {preset === 'custom' && (
            <>
              <ControlRow control={asControl(nr2d)} label="Spatial (2D)" hint={String(nr2d.value)} onChange={(v) => setFacecam('nr2d', v)} />
              <ControlRow control={asControl(nr3d)} label="Temporal (3D)" hint={String(nr3d.value)} onChange={(v) => setFacecam('nr3d', v)} />
            </>
          )}
        </Section>
      )}
      {!hdr && !(nr2d && nr3d) && (
        <p className="text-sm text-muted-foreground">This firmware reports no quality controls.</p>
      )}
    </div>
  )
}
