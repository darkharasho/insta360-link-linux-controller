import type { Control, FacecamKey, FacecamState } from '../../../shared/types'
import { ControlRow } from '../ControlRow'
import { Section, asControl, vendor } from './shared'

const METERING = { 0: 'Center-weighted', 1: 'Spot', 2: 'Average' }
const EXPOSURE = ['auto_exposure', 'exposure_time_absolute', 'gain', 'power_line_frequency', 'backlight_compensation']
const COLOR = ['white_balance_automatic', 'white_balance_temperature', 'brightness', 'contrast', 'saturation', 'sharpness']

interface Props {
  controls: Control[]
  setControl: (name: string, value: number) => void
  facecam: FacecamState | null
  setFacecam: (key: FacecamKey, value: number) => void
}

/** Exposure and color controls grouped like Elgato Camera Hub. */
export function FacecamImagePanel({ controls, setControl, facecam, setFacecam }: Props) {
  const row = (name: string) => {
    const c = controls.find((x) => x.name === name)
    return c && <ControlRow key={name} control={c} onChange={(v) => setControl(name, v)} />
  }
  const metering = vendor(facecam, 'metering')
  const tint = vendor(facecam, 'tint')
  const autoExposure = controls.find((c) => c.name === 'auto_exposure')?.value !== 1

  return (
    <div className="flex flex-col gap-6">
      <Section title="Exposure">
        {EXPOSURE.slice(0, 1).map(row)}
        {metering && autoExposure && (
          <ControlRow
            control={asControl(metering, METERING)}
            label="Metering"
            onChange={(v) => setFacecam('metering', v)}
          />
        )}
        {EXPOSURE.slice(1).map(row)}
      </Section>
      <Section title="Color">
        {COLOR.slice(0, 2).map(row)}
        {tint && (
          <ControlRow
            control={asControl(tint)}
            label="Tint"
            hint={tint.value > 0 ? `+${tint.value} magenta` : tint.value < 0 ? `${-tint.value} green` : '0'}
            onChange={(v) => setFacecam('tint', v)}
          />
        )}
        {COLOR.slice(2).map(row)}
      </Section>
    </div>
  )
}
