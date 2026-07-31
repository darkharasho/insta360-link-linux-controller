import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Device, Control, AiFraming, Scene } from '../shared/types'
import { cameraApi } from './api'
import { makeDebouncer } from './debounce'

export function useCamera() {
  const [devices, setDevices] = useState<Device[]>([])
  const [current, setCurrent] = useState<Device | null>(null)
  const [controls, setControls] = useState<Control[]>([])

  const refreshDevices = useCallback(async () => {
    const d = await cameraApi.listDevices()
    setDevices(d)
    setCurrent((c) => c ?? d[0] ?? null)
  }, [])

  const refresh = useCallback(async () => {
    if (!current) return
    setControls(await cameraApi.getSnapshot(current.captureNode))
  }, [current])

  useEffect(() => { refreshDevices() }, [refreshDevices])
  useEffect(() => { refresh() }, [refresh])

  const debouncedWrite = useMemo(
    () => makeDebouncer((name: string, value: number) => {
      if (current) cameraApi.setControl(current.captureNode, name, value)
    }, 60),
    [current],
  )

  const setControl = useCallback((name: string, value: number) => {
    setControls((cs) => cs.map((c) => (c.name === name ? { ...c, value } : c)))
    debouncedWrite(name, value)
  }, [debouncedWrite])

  const dev = current?.captureNode ?? ''
  return {
    devices, current, controls,
    selectDevice: setCurrent, refresh,
    setControl,
    setAi: (on: boolean) => cameraApi.setAi(dev, on),
    setFraming: (m: AiFraming) => cameraApi.setFraming(dev, m),
    setScene: (s: Scene) => cameraApi.setScene(dev, s),
    recallHwPreset: (slot: number) => cameraApi.recallHwPreset(dev, slot),
    reset: () => cameraApi.reset(dev),
  }
}
