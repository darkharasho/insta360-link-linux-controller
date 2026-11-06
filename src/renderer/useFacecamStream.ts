import { useEffect, useState } from 'react'
import type { Device, StreamUsage, VideoMode } from '../shared/types'
import { cameraApi } from './api'
import { loadPreviewMode, savePreviewMode } from './preview-mode'

const USAGE_MS = 3000

/** Preview mode choice, available modes and other-app usage for a Facecam (null = not one). */
export function useFacecamStream(device: Device | null) {
  const facecam = device?.family === 'elgato-facecam-4k' ? device : null
  const dev = facecam?.captureNode ?? null
  const id = facecam?.id ?? null
  const [modes, setModes] = useState<VideoMode[]>([])
  const [mode, setModeState] = useState<VideoMode | null>(null)
  const [usage, setUsage] = useState<StreamUsage | null>(null)

  useEffect(() => {
    setModes([])
    setUsage(null)
    setModeState(id ? loadPreviewMode(id) : null)
    if (!dev) return
    cameraApi.listModes(dev).then(setModes).catch(() => setModes([]))
  }, [dev, id])

  useEffect(() => {
    if (!dev) return
    let live = true
    const tick = () =>
      cameraApi.streamUsage(dev).then((u) => live && setUsage(u)).catch(() => live && setUsage(null))
    tick()
    const t = setInterval(tick, USAGE_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [dev])

  const setMode = (m: VideoMode | null) => {
    setModeState(m)
    if (id) savePreviewMode(id, m)
  }

  return { isFacecam: !!facecam, modes, mode, setMode, usage }
}
