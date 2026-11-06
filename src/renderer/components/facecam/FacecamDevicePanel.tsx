import { useEffect, useState } from 'react'
import type { FacecamReadouts, FacecamState } from '../../../shared/types'
import { Button } from '../ui/button'
import { formatShutter } from '../../facecam-readouts'
import { Section } from './shared'

interface Props {
  facecam: FacecamState | null
  readouts: FacecamReadouts | null
  save: () => Promise<boolean>
  saving: boolean
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

const n = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? '—' : `${v}${unit}`)

export function FacecamDevicePanel({ facecam, readouts, save, saving }: Props) {
  const [saved, setSaved] = useState(false)
  useEffect(() => setSaved(false), [facecam?.serial])
  return (
    <div className="flex flex-col gap-6">
      <Section title="Live">
        <Row label="ISO" value={n(readouts?.iso)} />
        <Row label="Shutter" value={formatShutter(readouts?.exposure ?? null)} />
        <Row label="White balance" value={n(readouts?.wbKelvin, ' K')} />
        <Row label="Tint" value={n(readouts?.tint)} />
        <p className="text-xs text-muted-foreground">Updates while an app is streaming from the camera.</p>
      </Section>
      <Section title="Camera">
        <Row label="Firmware" value={facecam?.firmware || '—'} />
        <Row label="Serial" value={facecam?.serial || '—'} />
        <Button
          disabled={!facecam || saving}
          onClick={async () => setSaved(await save())}
        >
          {saving ? 'Saving…' : 'Save to camera'}
        </Button>
        <p className="text-xs text-muted-foreground">
          {saved
            ? 'Saved — settings will survive replugging.'
            : 'Stores the current settings in the camera so they stick across replugs and other computers.'}
        </p>
      </Section>
    </div>
  )
}
