import { useCallback, useRef, type ReactNode } from 'react'
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ZoomIn, ZoomOut, Home } from 'lucide-react'
import type { Control } from '../../shared/types'
import { Button } from './ui/button'
import { Slider } from './ui/slider'
import { cn } from '../lib/utils'

interface Props {
  controls: Control[]
  setControl: (name: string, value: number) => void
  className?: string
}

const REPEAT_MS = 80

function useHold(onTick: () => void) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const start = useCallback(() => {
    if (timer.current) return
    onTick()
    timer.current = setInterval(onTick, REPEAT_MS)
  }, [onTick])
  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
  }, [])
  return { start, stop }
}

function clamp(v: number, min?: number, max?: number) {
  if (min !== undefined) v = Math.max(min, v)
  if (max !== undefined) v = Math.min(max, v)
  return v
}

export function PtzPad({ controls, setControl, className }: Props) {
  const pan = controls.find((c) => c.name === 'pan_absolute')
  const tilt = controls.find((c) => c.name === 'tilt_absolute')
  const zoom = controls.find((c) => c.name === 'zoom_absolute')

  const nudge = useCallback(
    (c: Control | undefined, delta: number) => {
      if (!c) return
      const step = c.step ?? 1
      setControl(c.name, clamp(c.value + delta * step, c.min, c.max))
    },
    [setControl],
  )

  const left = useHold(() => nudge(pan, -1))
  const right = useHold(() => nudge(pan, 1))
  const up = useHold(() => nudge(tilt, 1))
  const down = useHold(() => nudge(tilt, -1))
  const zoomIn = useHold(() => nudge(zoom, 1))
  const zoomOut = useHold(() => nudge(zoom, -1))

  const disabled = !pan && !tilt

  const dirBtn = (
    hold: { start: () => void; stop: () => void },
    icon: ReactNode,
    label: string,
    extraClass = '',
  ) => (
    <Button
      variant="secondary"
      size="icon"
      disabled={disabled}
      aria-label={label}
      className={cn('select-none', extraClass)}
      onMouseDown={hold.start}
      onMouseUp={hold.stop}
      onMouseLeave={hold.stop}
      onTouchStart={hold.start}
      onTouchEnd={hold.stop}
    >
      {icon}
    </Button>
  )

  return (
    <div className={cn('flex items-center gap-4 rounded-xl border bg-card/80 p-3 backdrop-blur', className)}>
      <div className="grid grid-cols-3 grid-rows-3 gap-1">
        <div />
        {dirBtn(up, <ArrowUp className="h-4 w-4" />, 'Tilt up')}
        <div />
        {dirBtn(left, <ArrowLeft className="h-4 w-4" />, 'Pan left')}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Center"
          disabled={disabled}
          onClick={() => {
            if (pan) setControl(pan.name, pan.default ?? 0)
            if (tilt) setControl(tilt.name, tilt.default ?? 0)
          }}
        >
          <Home className="h-4 w-4" />
        </Button>
        {dirBtn(right, <ArrowRight className="h-4 w-4" />, 'Pan right')}
        <div />
        {dirBtn(down, <ArrowDown className="h-4 w-4" />, 'Tilt down')}
        <div />
      </div>

      <div className="flex flex-1 items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          disabled={!zoom}
          aria-label="Zoom out"
          onMouseDown={zoomOut.start}
          onMouseUp={zoomOut.stop}
          onMouseLeave={zoomOut.stop}
          onTouchStart={zoomOut.start}
          onTouchEnd={zoomOut.stop}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Slider
          className="flex-1"
          disabled={!zoom}
          min={zoom?.min ?? 0}
          max={zoom?.max ?? 100}
          step={zoom?.step ?? 1}
          value={[zoom?.value ?? 0]}
          onValueChange={([v]) => zoom && setControl(zoom.name, v)}
        />
        <Button
          variant="secondary"
          size="icon"
          disabled={!zoom}
          aria-label="Zoom in"
          onMouseDown={zoomIn.start}
          onMouseUp={zoomIn.stop}
          onMouseLeave={zoomIn.stop}
          onTouchStart={zoomIn.start}
          onTouchEnd={zoomIn.stop}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
