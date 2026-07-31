import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ZoomIn, ZoomOut, Home } from 'lucide-react'
import type { Control } from '../../shared/types'
import { Button } from './ui/button'
import { Slider } from './ui/slider'
import { cn } from '../lib/utils'
import { holdSpeed } from './hold-ramp'
import { joystickDelta } from './joystick'

interface Props {
  controls: Control[]
  setControl: (name: string, value: number) => void
  className?: string
}

const REPEAT_MS = 80

/**
 * Press-and-hold with speed ramp: onTick receives the elapsed hold time so the
 * caller can move faster the longer the button is held.
 */
function useHold(onTick: (elapsedMs: number) => void) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAt = useRef(0)
  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
  }, [])
  const start = useCallback(() => {
    if (timer.current) return
    startedAt.current = performance.now()
    onTick(0)
    timer.current = setInterval(() => onTick(performance.now() - startedAt.current), REPEAT_MS)
  }, [onTick])
  // Clear any running interval if the component unmounts mid-hold.
  useEffect(() => stop, [stop])
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

  // Latest descriptors for the hold callbacks (optimistic values change every
  // tick; a plain closure would nudge from a stale base).
  const panRef = useRef(pan)
  const tiltRef = useRef(tilt)
  const zoomRef = useRef(zoom)
  panRef.current = pan
  tiltRef.current = tilt
  zoomRef.current = zoom

  const nudge = useCallback(
    (ref: React.MutableRefObject<Control | undefined>, dir: 1 | -1, elapsedMs: number) => {
      const c = ref.current
      if (!c) return
      const step = (c.step ?? 1) * holdSpeed(elapsedMs)
      setControl(c.name, clamp(c.value + dir * step, c.min, c.max))
    },
    [setControl],
  )

  const up = useHold((ms) => nudge(tiltRef, 1, ms))
  const down = useHold((ms) => nudge(tiltRef, -1, ms))
  const left = useHold((ms) => nudge(panRef, -1, ms))
  const right = useHold((ms) => nudge(panRef, 1, ms))
  const zoomIn = useHold((ms) => nudge(zoomRef, 1, ms))
  const zoomOut = useHold((ms) => nudge(zoomRef, -1, ms))

  const disabled = !pan && !tilt

  // --- Home knob: click to recenter, drag for proportional joystick motion. ---
  /** Max knob travel from center, px (stays clear of the arrow buttons). */
  const TRAVEL = 28
  /** Pointer movement below this is a click (recenter), not a drag. */
  const DRAG_THRESHOLD = 6
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 })
  const knobOffset = useRef({ x: 0, y: 0 })
  const dragTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const dragState = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null)

  const stopDrag = useCallback(() => {
    if (dragTimer.current) {
      clearInterval(dragTimer.current)
      dragTimer.current = null
    }
    dragState.current = null
    knobOffset.current = { x: 0, y: 0 }
    setKnobPos({ x: 0, y: 0 })
  }, [])
  useEffect(() => stopDrag, [stopDrag])

  const dragTick = useCallback(() => {
    const p = panRef.current
    const t = tiltRef.current
    const { dpan, dtilt } = joystickDelta(
      knobOffset.current.x,
      knobOffset.current.y,
      TRAVEL,
      p?.step ?? 3600,
      t?.step ?? 3600,
    )
    if (p && dpan !== 0) setControl(p.name, clamp(Math.round(p.value + dpan), p.min, p.max))
    if (t && dtilt !== 0) setControl(t.name, clamp(Math.round(t.value + dtilt), t.min, t.max))
  }, [setControl])

  const onKnobDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { startX: e.clientX, startY: e.clientY, dragging: false }
  }
  const onKnobMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = dragState.current
    if (!s) return
    let dx = e.clientX - s.startX
    let dy = e.clientY - s.startY
    if (!s.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      s.dragging = true
      if (!dragTimer.current) dragTimer.current = setInterval(dragTick, REPEAT_MS)
    }
    const len = Math.hypot(dx, dy)
    if (len > TRAVEL) {
      dx *= TRAVEL / len
      dy *= TRAVEL / len
    }
    knobOffset.current = { x: dx, y: dy }
    setKnobPos({ x: dx, y: dy })
  }
  const onKnobUp = () => {
    const wasDragging = dragState.current?.dragging ?? false
    stopDrag()
    if (!wasDragging) {
      if (pan) setControl(pan.name, pan.default ?? 0)
      if (tilt) setControl(tilt.name, tilt.default ?? 0)
    }
  }

  const arrow = (
    hold: { start: () => void; stop: () => void },
    icon: ReactNode,
    label: string,
    pos: string,
  ) => (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      className={cn(
        'absolute flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors',
        'hover:bg-primary/20 hover:text-foreground active:bg-primary active:text-primary-foreground',
        'disabled:pointer-events-none disabled:opacity-40 select-none',
        pos,
      )}
      onPointerDown={hold.start}
      onPointerUp={hold.stop}
      onPointerLeave={hold.stop}
      onPointerCancel={hold.stop}
    >
      {icon}
    </button>
  )

  return (
    <div className={cn('flex items-center gap-5 rounded-xl border bg-card/80 p-3 backdrop-blur', className)}>
      {/* Compass pad: 4 hold-to-move arrows around a centered Home. */}
      <div className="relative h-44 w-44 shrink-0 rounded-full border bg-muted/60 shadow-inner">
        {arrow(up, <ArrowUp className="h-5 w-5" />, 'Tilt up', 'left-1/2 top-2 -translate-x-1/2')}
        {arrow(down, <ArrowDown className="h-5 w-5" />, 'Tilt down', 'left-1/2 bottom-2 -translate-x-1/2')}
        {arrow(left, <ArrowLeft className="h-5 w-5" />, 'Pan left', 'top-1/2 left-2 -translate-y-1/2')}
        {arrow(right, <ArrowRight className="h-5 w-5" />, 'Pan right', 'top-1/2 right-2 -translate-y-1/2')}
        <button
          type="button"
          aria-label="Recenter (click) or drag to move"
          title="Drag to move · click to recenter"
          disabled={disabled}
          className={cn(
            'absolute left-1/2 top-1/2 flex h-14 w-14 items-center justify-center touch-none',
            'rounded-full border bg-secondary text-muted-foreground',
            'hover:text-foreground hover:border-primary hover:shadow-[0_0_0_3px] hover:shadow-primary/25',
            'disabled:pointer-events-none disabled:opacity-40 select-none',
            dragState.current?.dragging
              ? 'cursor-grabbing border-primary bg-primary/20 text-foreground'
              : 'cursor-grab transition-all',
          )}
          style={{ transform: `translate(calc(-50% + ${knobPos.x}px), calc(-50% + ${knobPos.y}px))` }}
          onPointerDown={onKnobDown}
          onPointerMove={onKnobMove}
          onPointerUp={onKnobUp}
          onPointerCancel={stopDrag}
        >
          <Home className="h-5 w-5" />
        </button>
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
