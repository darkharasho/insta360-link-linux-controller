import { AlertTriangle, Cast, Copy, RefreshCw } from 'lucide-react'
import type { VcamStatus } from '../../shared/vcam-ipc'
import type { EffectKind, EffectsConfig } from '../effects/pipeline'
import { Segmented } from './ui/segmented'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'

const SETUP_CMD = 'sudo v4l2loopback-ctl add -n "Insta360 Link Filtered" -x 1 42'

const EFFECTS: { value: EffectKind; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'blur', label: 'Blur' },
  { value: 'soft', label: 'Soft' },
  { value: 'mono', label: 'Mono' },
  { value: 'warm', label: 'Warm' },
]

interface Props {
  effects: EffectsConfig
  onEffectsChange: (c: EffectsConfig) => void
  vcamStatus: VcamStatus | null
  vcamError: string | null
  onVcamToggle: () => void
  onVcamRefresh: () => void
  disabled: boolean
}

export function EffectsPanel({
  effects, onEffectsChange, vcamStatus, vcamError, onVcamToggle, onVcamRefresh, disabled,
}: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Effect</p>
        <Segmented
          options={EFFECTS}
          value={effects.effect}
          onChange={(effect) => onEffectsChange({ ...effects, effect })}
          disabled={disabled}
          cols="grid-cols-3"
        />
        <p className="text-xs text-muted-foreground">
          Blur keeps you sharp and blurs the background (on-device AI). Effects apply to the
          preview and the virtual camera.
        </p>
      </div>

      {effects.effect === 'blur' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Blur strength</p>
          <Slider
            min={4}
            max={24}
            step={1}
            disabled={disabled}
            value={[effects.blurStrength]}
            onValueChange={([blurStrength]) => onEffectsChange({ ...effects, blurStrength })}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Cast className="h-4 w-4" />
            Virtual camera
          </p>
          {vcamStatus?.deviceFound && (
            <Switch
              checked={vcamStatus?.running ?? false}
              disabled={disabled || !vcamStatus?.ffmpegFound}
              onCheckedChange={onVcamToggle}
            />
          )}
        </div>

        {vcamStatus && !vcamStatus.deviceFound && (
          <Card>
            <CardContent className="flex flex-col gap-2 p-3">
              <p className="text-xs text-muted-foreground">
                One-time setup: create the virtual camera device (your OBS virtual camera is
                not touched), then hit re-check.
              </p>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1.5 text-[11px]">
                  {SETUP_CMD}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Copy setup command"
                  onClick={() => navigator.clipboard.writeText(SETUP_CMD)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button variant="secondary" size="sm" className="gap-2 self-start" onClick={onVcamRefresh}>
                <RefreshCw className="h-3.5 w-3.5" />
                Re-check
              </Button>
            </CardContent>
          </Card>
        )}

        {vcamStatus?.deviceFound && (
          <p className="text-xs text-muted-foreground">
            {vcamStatus.running
              ? `Streaming the filtered view to ${vcamStatus.devicePath} — select "Insta360 Link Filtered" in Zoom/OBS.`
              : `Ready on ${vcamStatus.devicePath}. Toggle on, then pick "Insta360 Link Filtered" in your meeting app.`}
          </p>
        )}

        {vcamStatus && !vcamStatus.ffmpegFound && (
          <p className="flex items-center gap-1.5 text-xs text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5" /> ffmpeg not found — install it to enable the virtual camera.
          </p>
        )}

        {vcamError && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> {vcamError}
          </p>
        )}
      </div>
    </div>
  )
}
