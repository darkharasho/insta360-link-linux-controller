import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Device, Control, AiFraming, Scene, CameraMode } from '../shared/types'
import { cameraApi } from './api'
import { makeDebouncer } from './debounce'

function describeError(label: string, err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err)
  return `${label} failed: ${detail}`
}

export function useCamera() {
  const [devices, setDevices] = useState<Device[]>([])
  const [current, setCurrent] = useState<Device | null>(null)
  const [controls, setControls] = useState<Control[]>([])
  const [lastError, setLastError] = useState<string | null>(null)
  // The camera's mode is write-only hardware state; this mirror is the app's
  // single source of truth for it (saved into presets, restored on recall).
  const [mode, setModeState] = useState<CameraMode>('normal')
  const [framing, setFramingState] = useState<AiFraming>('half')

  // A different camera's mode is unknown — reset the mirror on device change.
  useEffect(() => {
    setModeState('normal')
    setFramingState('half')
  }, [current?.id])

  const reportError = useCallback((label: string, err: unknown) => {
    setLastError(describeError(label, err))
  }, [])

  const dismissError = useCallback(() => setLastError(null), [])

  const refreshDevices = useCallback(async () => {
    try {
      const d = await cameraApi.listDevices()
      setDevices(d)
      setCurrent((c) => c ?? d[0] ?? null)
    } catch (err) {
      reportError('List devices', err)
    }
  }, [reportError])

  const refresh = useCallback(async () => {
    if (!current) return
    try {
      setControls(await cameraApi.getSnapshot(current.captureNode))
    } catch (err) {
      reportError('Read camera state', err)
    }
  }, [current, reportError])

  useEffect(() => { refreshDevices() }, [refreshDevices])
  useEffect(() => { refresh() }, [refresh])

  // Generic wrapper for mutating IPC calls: awaits the call, surfaces any
  // rejection as a user-visible error instead of an unhandled promise
  // rejection, and returns whether the call succeeded so callers can
  // reconcile optimistic UI state.
  const runMutation = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      return true
    } catch (err) {
      reportError(label, err)
      return false
    }
  }, [reportError])

  const debouncedWrite = useMemo(
    () => makeDebouncer((name: string, value: number) => {
      if (!current) return
      cameraApi.setControl(current.captureNode, name, value).catch((err) => {
        reportError('Set control', err)
        // Reconcile optimistic UI: re-read the actual hardware state.
        refresh()
      })
    }, 60),
    [current, reportError, refresh],
  )

  const setControl = useCallback((name: string, value: number) => {
    setControls((cs) => cs.map((c) => (c.name === name ? { ...c, value } : c)))
    debouncedWrite(name, value)
  }, [debouncedWrite])

  const dev = current?.captureNode ?? ''
  const deviceId = current?.id ?? ''

  return {
    devices, current, controls,
    selectDevice: setCurrent, refresh,
    setControl,
    // Capture the live hardware state for a preset. Reading a fresh snapshot
    // (rather than the optimistic `controls` React state) guarantees the saved
    // values reflect the camera's actual current position/zoom.
    captureCurrent: async (): Promise<Record<string, number>> => {
      if (!dev) return {}
      try {
        const snap = await cameraApi.getSnapshot(dev)
        return Object.fromEntries(snap.filter((c) => !c.inactive).map((c) => [c.name, c.value]))
      } catch (err) {
        reportError('Read camera state', err)
        return {}
      }
    },
    mode,
    framing,
    changeMode: async (next: CameraMode) => {
      const prev = mode
      setModeState(next)
      const ok =
        next === 'ai'
          ? await runMutation('Set AI tracking', () => cameraApi.setAi(dev, true))
          : await runMutation('Set mode', () => cameraApi.setScene(dev, next === 'normal' ? 'normal' : next))
      if (!ok) setModeState(prev)
      return ok
    },
    changeFraming: async (next: AiFraming) => {
      const prev = framing
      setFramingState(next)
      const ok = await runMutation('Set framing', () => cameraApi.setFraming(dev, next))
      if (!ok) setFramingState(prev)
      return ok
    },
    reset: async () => {
      const ok = await runMutation('Recenter gimbal', () => cameraApi.reset(dev))
      // The gimbal reset also drops AI/scene modes on the hardware.
      if (ok) setModeState('normal')
      return ok
    },
    listAppPresets: () => cameraApi.listAppPresets(deviceId).catch((err) => { reportError('Load presets', err); return [] }),
    // Presets capture the whole look: control values + the current mode.
    saveAppPreset: (name: string, values: Record<string, number>) =>
      runMutation('Save preset', () =>
        cameraApi.saveAppPreset(deviceId, name, values, mode, mode === 'ai' ? framing : undefined),
      ),
    applyAppPreset: async (name: string) => {
      try {
        const result = await cameraApi.applyAppPreset(dev, deviceId, name)
        setModeState(result.mode)
        if (result.framing) setFramingState(result.framing)
        if (result.failed.length) reportError('Apply preset', new Error(`could not set: ${result.failed.join(', ')}`))
        refresh()
        return true
      } catch (err) {
        reportError('Apply preset', err)
        return false
      }
    },
    removeAppPreset: (name: string) =>
      runMutation('Delete preset', () => cameraApi.removeAppPreset(deviceId, name)),
    lastError, dismissError,
  }
}
