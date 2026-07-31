import { useEffect, useRef, useState } from 'react'
import { VideoOff } from 'lucide-react'
import type { Device } from '../../shared/types'
import { cn } from '../lib/utils'
import { EffectsPipeline, type EffectsConfig } from '../effects/pipeline'

interface Props {
  current: Device | null
  effects: EffectsConfig
  frameSink: ((data: Uint8Array) => void) | null
  className?: string
}

export function PreviewPane({ current, effects, frameSink, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pipelineRef = useRef<EffectsPipeline | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)

  // The pipeline lives as long as the pane: it draws the (hidden) video into
  // the visible canvas with the selected effect and feeds the vcam sink.
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return
    const pipeline = new EffectsPipeline(videoRef.current, canvasRef.current)
    pipelineRef.current = pipeline
    pipeline.start()
    return () => {
      pipeline.stop()
      pipelineRef.current = null
    }
  }, [])

  useEffect(() => { pipelineRef.current?.setConfig(effects) }, [effects])
  useEffect(() => { pipelineRef.current?.setSink(frameSink) }, [frameSink])

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    setUnavailable(null)

    async function start() {
      if (!current) {
        setUnavailable('No camera selected')
        return
      }
      try {
        // Electron normally exposes device labels without a permission grant;
        // the probe is a best-effort fallback for when it doesn't. It must
        // never be fatal — the default device it opens may be busy even when
        // the camera we actually want is free.
        let cams = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === 'videoinput',
        )
        if (!cams.some((d) => d.label)) {
          try {
            const probe = await navigator.mediaDevices.getUserMedia({ video: true })
            probe.getTracks().forEach((t) => t.stop())
          } catch (err) {
            console.warn('preview: permission probe failed (continuing)', err)
          }
          cams = (await navigator.mediaDevices.enumerateDevices()).filter(
            (d) => d.kind === 'videoinput',
          )
        }
        // Never bind virtual/loopback outputs (our own filtered camera, OBS).
        cams = cams.filter((d) => !/filtered|virtual|dummy/i.test(d.label))

        // Match reliably by USB vid:pid, which Chromium includes in the label
        // (e.g. "Insta360 Link 2 (2e1a:4c04)"). Two same-model Insta360 cameras
        // share a name prefix, so a plain name substring binds the wrong one —
        // the vid:pid is unique per unit. Fall back to name/label only if the
        // vid:pid isn't present in the labels.
        const vidpid =
          current.vendorId && current.productId
            ? `${current.vendorId}:${current.productId}`.toLowerCase()
            : null
        const match =
          (vidpid && cams.find((d) => d.label.toLowerCase().includes(vidpid))) ||
          cams.find((d) => d.label.includes(current.name)) ||
          cams.find((d) => d.label.includes(current.label))

        if (!match) {
          // Better to show "unavailable" than to bind an arbitrary camera and
          // display the wrong feed.
          console.warn('preview: no matching videoinput', { want: current, labels: cams.map((c) => c.label) })
          setUnavailable(`No video device matched "${current.label}"`)
          return
        }

        const open = () =>
          navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: match.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
          })
        try {
          stream = await open()
        } catch (err) {
          // Transient NotReadableError happens when the node was released
          // milliseconds ago (probe, previous selection, another app closing).
          if ((err as DOMException)?.name !== 'NotReadableError') throw err
          await new Promise((r) => setTimeout(r, 400))
          stream = await open()
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (err) {
        console.error('preview: failed to open camera', err)
        if (!cancelled) {
          const e = err as DOMException
          setUnavailable(e?.name ? `${e.name}: ${e.message || 'camera busy or unavailable'}` : String(err))
        }
      }
    }

    start()

    return () => {
      cancelled = true
      if (stream) stream.getTracks().forEach((t) => t.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [current])

  return (
    <div className={cn('relative aspect-video w-full overflow-hidden rounded-xl border bg-black', className)}>
      <video ref={videoRef} autoPlay muted playsInline className="hidden" />
      <canvas
        ref={canvasRef}
        className={cn('h-full w-full object-cover', unavailable && 'hidden')}
      />
      {unavailable && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-secondary/40 text-center">
          <VideoOff className="h-8 w-8 text-muted-foreground" />
          <p className="max-w-xs text-sm text-muted-foreground">
            Preview unavailable — controls still work
          </p>
          <p className="max-w-sm text-xs text-muted-foreground/70">{unavailable}</p>
        </div>
      )}
    </div>
  )
}
