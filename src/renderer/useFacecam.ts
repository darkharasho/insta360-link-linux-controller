import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FacecamKey, FacecamReadouts, FacecamState } from '../shared/types'
import { cameraApi } from './api'
import { makeDebouncer } from './debounce'
import { mergeReadouts } from './facecam-readouts'

const READOUT_MS = 1000

/**
 * Elgato Facecam 4K vendor controls for the selected camera (dev = capture
 * node, or null when the selection isn't a Facecam). Writes are optimistic and
 * debounced like useCamera's; readouts poll while `polling` is true.
 */
export function useFacecam(dev: string | null, polling: boolean, onError: (label: string, err: unknown) => void) {
  const [state, setState] = useState<FacecamState | null>(null)
  const [readouts, setReadouts] = useState<FacecamReadouts | null>(null)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    if (!dev) return setState(null)
    try {
      setState(await cameraApi.facecamState(dev))
    } catch (err) {
      onError('Read Facecam settings', err)
    }
  }, [dev, onError])

  useEffect(() => {
    setState(null)
    setReadouts(null)
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!dev || !polling) return
    let live = true
    const tick = async () => {
      try {
        const next = await cameraApi.facecamReadouts(dev)
        if (live) setReadouts((prev) => mergeReadouts(prev, next))
      } catch {
        // Readouts are informational; a failed poll just keeps the last values.
      }
    }
    tick()
    const t = setInterval(tick, READOUT_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [dev, polling])

  const write = useMemo(
    () =>
      makeDebouncer((key: string, value: number) => {
        if (!dev) return
        cameraApi.facecamSet(dev, key as FacecamKey, value).catch((err) => {
          onError('Set Facecam control', err)
          refresh()
        })
      }, 60),
    [dev, onError, refresh],
  )

  const set = useCallback(
    (key: FacecamKey, value: number) => {
      setState((s) => s && { ...s, controls: s.controls.map((c) => (c.key === key ? { ...c, value } : c)) })
      write(key, value)
    },
    [write],
  )

  const save = useCallback(async () => {
    if (!dev) return false
    setSaving(true)
    try {
      await cameraApi.facecamSave(dev)
      return true
    } catch (err) {
      onError('Save to camera', err)
      return false
    } finally {
      setSaving(false)
    }
  }, [dev, onError])

  return { state, readouts, set, save, saving }
}
