import { Camera } from 'lucide-react'
import { useCamera } from './useCamera'
import { CameraPicker } from './components/CameraPicker'
import { PreviewPane } from './components/PreviewPane'
import { PtzPad } from './components/PtzPad'
import { ImageSettings } from './components/ImageSettings'
import { AiTracking } from './components/AiTracking'
import { SceneModes } from './components/SceneModes'
import { Presets } from './components/Presets'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { cn } from './lib/utils'

export default function App() {
  const { devices, current, controls, selectDevice, refresh, setControl, setAi, setFraming, setScene, recallHwPreset, reset } =
    useCamera()

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

      <main className="flex flex-1 gap-6 overflow-hidden p-6">
        <div className="flex flex-1 flex-col gap-4">
          <PreviewPane current={current} className="flex-1" />
          <PtzPad controls={controls} setControl={setControl} />
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto rounded-xl border bg-card p-4">
          <Tabs defaultValue="ai">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="ai">AI</TabsTrigger>
              <TabsTrigger value="scene">Scene</TabsTrigger>
              <TabsTrigger value="image">Image</TabsTrigger>
              <TabsTrigger value="presets">Presets</TabsTrigger>
            </TabsList>

            <TabsContent value="ai">
              <AiTracking setAi={setAi} setFraming={setFraming} />
            </TabsContent>
            <TabsContent value="scene">
              <SceneModes setScene={setScene} />
            </TabsContent>
            <TabsContent value="image">
              <ImageSettings controls={controls} setControl={setControl} />
            </TabsContent>
            <TabsContent value="presets">
              <Presets
                device={current}
                controls={controls}
                recallHwPreset={recallHwPreset}
                reset={reset}
                refresh={refresh}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  )
}
