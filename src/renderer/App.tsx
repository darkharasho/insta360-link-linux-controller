import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { useCamera } from './useCamera'
import { useVcam } from './useVcam'
import { vcamApi } from './api'
import { TitleBar } from './components/TitleBar'
import { CameraPicker } from './components/CameraPicker'
import { PreviewPane } from './components/PreviewPane'
import { PtzPad } from './components/PtzPad'
import { ImageSettings } from './components/ImageSettings'
import { ColorPanel } from './components/ColorPanel'
import { ModeControl } from './components/ModeControl'
import { Presets } from './components/Presets'
import { EffectsPanel } from './components/EffectsPanel'
import type { EffectsConfig } from './effects/pipeline'
import { NEUTRAL_COLOR, loadColor, saveColor, type ColorCorrection } from './effects/color'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { Button } from './components/ui/button'
import { cn } from './lib/utils'

export default function App() {
  const {
    devices, current, controls, selectDevice, refresh, setControl,
    mode, framing, changeMode, changeFraming, reset, captureCurrent,
    listAppPresets, saveAppPreset, applyAppPreset, removeAppPreset,
    lastError, dismissError,
  } = useCamera()

  const [effects, setEffects] = useState<EffectsConfig>({
    effect: 'none',
    blurStrength: 12,
    color: NEUTRAL_COLOR,
  })

  // Color correction is per camera: load the saved values when the selection
  // changes, persist edits under the selected camera's id.
  const deviceId = current?.id
  useEffect(() => {
    setEffects((e) => ({ ...e, color: deviceId ? loadColor(deviceId) : NEUTRAL_COLOR }))
  }, [deviceId])
  const changeColor = useCallback(
    (color: ColorCorrection) => {
      setEffects((e) => ({ ...e, color }))
      if (deviceId) saveColor(deviceId, color)
    },
    [deviceId],
  )

  const vcam = useVcam()
  const frameSink = useMemo(
    () => (vcam.status?.running ? (data: Uint8Array) => vcamApi.sendFrame(data) : null),
    [vcam.status?.running],
  )

  const connected = !!current

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar />
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
          {connected ? 'Connected' : 'No camera'}
        </div>
        <CameraPicker devices={devices} current={current} onSelect={selectDevice} />
      </header>

      {lastError && (
        <div className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{lastError}</span>
          </div>
          <Button variant="ghost" size="icon" aria-label="Dismiss error" onClick={dismissError} className="h-6 w-6 shrink-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <main className="flex flex-1 gap-6 overflow-hidden p-6">
        <div className="flex flex-1 flex-col gap-4">
          <PreviewPane current={current} effects={effects} frameSink={frameSink} className="flex-1" />
          <PtzPad controls={controls} setControl={setControl} />
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto rounded-xl border bg-card p-4">
          <Tabs defaultValue="mode">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="mode">Mode</TabsTrigger>
              <TabsTrigger value="image">Image</TabsTrigger>
              <TabsTrigger value="effects">Effects</TabsTrigger>
              <TabsTrigger value="presets">Presets</TabsTrigger>
            </TabsList>

            <TabsContent value="mode">
              <ModeControl
                mode={mode}
                framing={framing}
                onModeChange={changeMode}
                onFramingChange={changeFraming}
                disabled={!current}
              />
            </TabsContent>
            <TabsContent value="image">
              <div className="flex flex-col gap-6">
                <ImageSettings controls={controls} setControl={setControl} />
                <div className="border-t pt-4">
                  <ColorPanel color={effects.color} onChange={changeColor} disabled={!current} />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="effects">
              <EffectsPanel
                effects={effects}
                onEffectsChange={setEffects}
                vcamStatus={vcam.status}
                vcamError={vcam.error}
                onVcamToggle={vcam.toggle}
                onVcamRefresh={vcam.refresh}
                disabled={!current}
              />
            </TabsContent>
            <TabsContent value="presets">
              <Presets
                device={current}
                captureCurrent={captureCurrent}
                listAppPresets={listAppPresets}
                saveAppPreset={saveAppPreset}
                applyAppPreset={applyAppPreset}
                removeAppPreset={removeAppPreset}
                reset={reset}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  )
}
