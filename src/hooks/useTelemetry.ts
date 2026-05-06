'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RouteSegment } from '@/data/raceRoute'
import { generateTelemetryFrame } from '@/lib/telemetrySimulator'
import type {
  TelemetryConnectionStatus,
  TelemetryData,
  TelemetrySource,
} from '@/types/telemetry'

type UseTelemetryOptions = {
  currentMile?: number
  currentSegment?: RouteSegment | null
}

export function useTelemetry({
  currentMile,
  currentSegment,
}: UseTelemetryOptions = {}) {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null)
  const [status, setStatus] =
    useState<TelemetryConnectionStatus>('disconnected')
  const [source, setSourceState] = useState<TelemetrySource>('simulator')
  const intervalRef = useRef<number | null>(null)
  const telemetryRef = useRef<TelemetryData | null>(null)
  const currentMileRef = useRef(currentMile)
  const currentSegmentRef = useRef(currentSegment)

  useEffect(() => {
    currentMileRef.current = currentMile
    currentSegmentRef.current = currentSegment
  }, [currentMile, currentSegment])

  const disconnect = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    setStatus('disconnected')
  }, [])

  const connect = useCallback(() => {
    disconnect()
    setStatus('connecting')

    if (source !== 'simulator') {
      setStatus('error')
      return
    }

    const tick = () => {
      const nextTelemetry = generateTelemetryFrame({
        currentMile: currentMileRef.current,
        currentSegment: currentSegmentRef.current,
        previousTelemetry: telemetryRef.current,
      })

      telemetryRef.current = nextTelemetry
      setTelemetry(nextTelemetry)
      setStatus('simulated')
    }

    tick()
    intervalRef.current = window.setInterval(tick, 1000)
  }, [disconnect, source])

  const setSource = useCallback(
    (nextSource: TelemetrySource) => {
      disconnect()
      setSourceState(nextSource)
      setTelemetry(null)
    },
    [disconnect]
  )

  useEffect(() => {
    return () => disconnect()
  }, [disconnect])

  return {
    telemetry,
    status,
    source,
    connect,
    disconnect,
    setSource,
  }
}
