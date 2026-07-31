import { AlertCircle, Camera, X } from 'lucide-react'
import { useCamera } from './useCamera'
import { CameraPicker } from './components/CameraPicker'
import { PreviewPane } from './components/PreviewPane'
import { PtzPad } from './components/PtzPad'
import { ImageSettings } from './components/ImageSettings'
import { ModeControl } from './components/ModeControl'
import { Presets } from './components/Presets'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { Button } from './components/ui/button'
import { cn } from './lib/utils'

export default function App() {
  const {
    devices, current, controls, selectDevice, refresh, setControl,
    setAi, setFraming, setScene, reset,
    listAppPresets, saveAppPreset, applyAppPreset, removeAppPreset,
    lastError, dismissError,
  } = useCamera()

  const connected = !!current

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">Insta360 Link Controller</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
            {connected ? 'Connected' : 'No camera'}
          </div>
          <CameraPicker devices={devices} current={current} onSelect={selectDevice} />
        </div>
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
          <PreviewPane current={current} className="flex-1" />
          <PtzPad controls={controls} setControl={setControl} />
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto rounded-xl border bg-card p-4">
          <Tabs defaultValue="mode">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="mode">Mode</TabsTrigger>
              <TabsTrigger value="image">Image</TabsTrigger>
              <TabsTrigger value="presets">Presets</TabsTrigger>
            </TabsList>

            <TabsContent value="mode">
              <ModeControl
                key={current?.id ?? 'none'}
                setAi={setAi}
                setFraming={setFraming}
                setScene={setScene}
                disabled={!current}
              />
            </TabsContent>
            <TabsContent value="image">
              <ImageSettings controls={controls} setControl={setControl} />
            </TabsContent>
            <TabsContent value="presets">
              <Presets
                device={current}
                controls={controls}
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
