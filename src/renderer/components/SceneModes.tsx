import { useState } from 'react'
import type { Scene } from '../../shared/types'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'

interface Props {
  setScene: (s: Scene) => void
}

const SCENES: { value: Scene; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'deskview', label: 'Desk view' },
  { value: 'whiteboard', label: 'Whiteboard' },
  { value: 'overhead', label: 'Overhead' },
]

export function SceneModes({ setScene }: Props) {
  const [scene, setSceneState] = useState<Scene>('normal')

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Scene mode</p>
      <Tabs
        value={scene}
        onValueChange={(v) => {
          const s = v as Scene
          setSceneState(s)
          setScene(s)
        }}
      >
        <TabsList className="grid w-full grid-cols-2 gap-1">
          {SCENES.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
