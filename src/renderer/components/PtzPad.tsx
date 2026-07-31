import { useCallback, useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Home } from 'lucide-react'
import type { Control } from '../../shared/types'
import { Button } from './ui/button'
import { Slider } from './ui/slider'
import { cn } from '../lib/utils'
import { joystickDelta } from './joystick'

interface Props {
  controls: Control[]
  setControl: (name: string, value: number) => void
  className?: string
}

const REPEAT_MS = 80
/** Usable knob travel from center, px (matches the pad's rendered size). */
const RADIUS = 44

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
  // Clear any running interval if the component unmounts (or this hook
  // instance is torn down) while a button is still held.
  useEffect(() => stop, [stop])
  return { start, stop }
}

function clamp(v: number, min?: number, max?: number) {
  if (min !== undefined) v = Math.max(min, v)
  if (max !== undefined) v = Math.min(max, v)
  return v
}

function Joystick({
  pan,
  tilt,
  setControl,
  disabled,
}: {
  pan?: Control
  tilt?: Control
  setControl: (name: string, value: number) => void
  disabled: boolean
}) {
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const offset = useRef({ x: 0, y: 0 })
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Latest control descriptors for the interval callback (state in a closure
  // would go stale between renders while the optimistic values update).
  const panRef = useRef(pan)
  const tiltRef = useRef(tilt)
  panRef.current = pan
  tiltRef.current = tilt

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
    offset.current = { x: 0, y: 0 }
    setKnob({ x: 0, y: 0 })
  }, [])
  useEffect(() => stop, [stop])

  const tick = useCallback(() => {
    const p = panRef.current
    const t = tiltRef.current
    const { dpan, dtilt } = joystickDelta(
      offset.current.x,
      offset.current.y,
      RADIUS,
      p?.step ?? 3600,
      t?.step ?? 3600,
    )
    if (p && dpan !== 0) setControl(p.name, clamp(Math.round(p.value + dpan), p.min, p.max))
    if (t && dtilt !== 0) setControl(t.name, clamp(Math.round(t.value + dtilt), t.min, t.max))
  }, [setControl])

  const updateFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    const len = Math.hypot(dx, dy)
    const s = len > RADIUS ? RADIUS / len : 1
    offset.current = { x: dx * s, y: dy * s }
    setKnob(offset.current)
  }

  return (
    <div
      role="slider"
      aria-label="Pan and tilt joystick"
      className={cn(
        'relative h-28 w-28 shrink-0 touch-none select-none rounded-full border bg-muted/60',
        disabled ? 'opacity-40' : 'cursor-grab active:cursor-grabbing',
      )}
      onPointerDown={(e) => {
        if (disabled) return
        e.currentTarget.setPointerCapture(e.pointerId)
        updateFromPointer(e)
        if (!timer.current) {
          tick()
          timer.current = setInterval(tick, REPEAT_MS)
        }
      }}
      onPointerMove={(e) => {
        if (!disabled && timer.current) updateFromPointer(e)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      {/* crosshair */}
      <div className="pointer-events-none absolute left-1/2 top-2 bottom-2 w-px -translate-x-1/2 bg-border" />
      <div className="pointer-events-none absolute top-1/2 left-2 right-2 h-px -translate-y-1/2 bg-border" />
      {/* knob */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-9 w-9 rounded-full bg-primary shadow-md transition-transform duration-75"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  )
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

  const zoomIn = useHold(() => nudge(zoom, 1))
  const zoomOut = useHold(() => nudge(zoom, -1))

  const disabled = !pan && !tilt

  return (
    <div className={cn('flex items-center gap-4 rounded-xl border bg-card/80 p-3 backdrop-blur', className)}>
      <Joystick pan={pan} tilt={tilt} setControl={setControl} disabled={disabled} />

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
