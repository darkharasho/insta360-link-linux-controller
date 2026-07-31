import { useEffect, useRef, useState } from 'react'
import { VideoOff } from 'lucide-react'
import type { Device } from '../../shared/types'
import { cn } from '../lib/utils'

interface Props {
  current: Device | null
  className?: string
}

export function PreviewPane({ current, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    setUnavailable(false)

    async function start() {
      if (!current) {
        setUnavailable(true)
        return
      }
      try {
        // First ask for any camera permission so device labels are populated,
        // then enumerate to find the device whose label matches the selected camera.
        const probe = await navigator.mediaDevices.getUserMedia({ video: true })
        probe.getTracks().forEach((t) => t.stop())

        const all = await navigator.mediaDevices.enumerateDevices()
        // TODO(hardware): verify device-label matching with two Insta360 cameras (see Task 15).
        // A plain substring match on `label` may bind the wrong camera when two
        // similar Insta360 Link devices are attached; needs the real label format.
        const match = all.find(
          (d) => d.kind === 'videoinput' && d.label.includes(current.name),
        )

        stream = await navigator.mediaDevices.getUserMedia({
          video: match ? { deviceId: { exact: match.deviceId } } : true,
        })

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch {
        if (!cancelled) setUnavailable(true)
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
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cn('h-full w-full object-cover', unavailable && 'hidden')}
      />
      {unavailable && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-secondary/40 text-center">
          <VideoOff className="h-8 w-8 text-muted-foreground" />
          <p className="max-w-xs text-sm text-muted-foreground">
            Camera in use or preview unavailable — controls still work
          </p>
        </div>
      )}
    </div>
  )
}
