import { useCallback, useEffect, useState } from 'react'
import type { VcamStatus } from '../shared/vcam-ipc'
import { vcamApi } from './api'
import { PIPELINE_WIDTH, PIPELINE_HEIGHT, SINK_FPS } from './effects/pipeline'

export function useVcam() {
  const [status, setStatus] = useState<VcamStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await vcamApi.status())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const toggle = useCallback(async () => {
    setError(null)
    try {
      if (status?.running) {
        await vcamApi.stop()
      } else {
        await vcamApi.start(PIPELINE_WIDTH, PIPELINE_HEIGHT, SINK_FPS)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    refresh()
  }, [status?.running, refresh])

  return { status, error, refresh, toggle }
}
