'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RouteSegment } from '@/data/raceRoute'
import {
  parseEsp32TelemetryPacket,
  simulatorTelemetryToEsp32Packet,
} from '@/lib/esp32Telemetry'
import { generateTelemetryFrame } from '@/lib/telemetrySimulator'
import type {
  TelemetryConnectionStatus,
  TelemetryData,
  TelemetrySource,
} from '@/types/telemetry'

type Esp32ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

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
  const [connectionStatus, setConnectionStatus] =
    useState<Esp32ConnectionStatus>('disconnected')
  const [connectionError, setConnectionError] = useState<string | undefined>()
  const [lastPacketAt, setLastPacketAt] = useState<number | undefined>()
  const [source, setSourceState] = useState<TelemetrySource>('simulator')
  const intervalRef = useRef<number | null>(null)
  const esp32PollInFlightRef = useRef(false)
  const esp32AbortControllerRef = useRef<AbortController | null>(null)
  const esp32SessionRef = useRef(0)
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
    stopEsp32Telemetry()
  }, [])

  const connect = useCallback(() => {
    disconnect()
    setStatus('connecting')
    setConnectionError(undefined)

    if (source === 'esp32') {
      startEsp32Telemetry()
      return
    }

    if (source !== 'simulator' && source !== 'mock-esp32') {
      setStatus('error')
      setConnectionStatus('error')
      setConnectionError('Telemetry source is reserved for future hardware integration.')
      return
    }

    const tick = () => {
      const simulatorTelemetry = generateTelemetryFrame({
        currentMile: currentMileRef.current,
        currentSegment: currentSegmentRef.current,
        previousTelemetry: telemetryRef.current,
      })
      const nextTelemetry =
        source === 'mock-esp32'
          ? parseEsp32TelemetryPacket(
              simulatorTelemetryToEsp32Packet(simulatorTelemetry)
            )
          : simulatorTelemetry

      telemetryRef.current = nextTelemetry
      setTelemetry(nextTelemetry)
      setStatus('simulated')
      setConnectionStatus('connected')
      setLastPacketAt(nextTelemetry.timestamp)
    }

    tick()
    intervalRef.current = window.setInterval(tick, 1000)
  }, [disconnect, source])

  const setSource = useCallback(
    (nextSource: TelemetrySource) => {
      disconnect()
      setSourceState(nextSource)
      setTelemetry(null)
      setLastPacketAt(undefined)
      setConnectionError(undefined)
    },
    [disconnect]
  )

  function startEsp32Telemetry() {
    const telemetryUrl = process.env.NEXT_PUBLIC_ESP32_TELEMETRY_URL?.trim()
    const sessionId = esp32SessionRef.current + 1

    esp32SessionRef.current = sessionId

    setConnectionStatus('connecting')

    if (!telemetryUrl) {
      setConnectionStatus('error')
      setStatus('error')
      setConnectionError(
        'NEXT_PUBLIC_ESP32_TELEMETRY_URL is not configured.'
      )
      return
    }

    const configuredTelemetryUrl = telemetryUrl

    async function pollEsp32Telemetry() {
      if (esp32PollInFlightRef.current) return

      esp32PollInFlightRef.current = true
      const abortController = new AbortController()
      const timeoutId = window.setTimeout(() => {
        abortController.abort()
      }, 5000)

      esp32AbortControllerRef.current = abortController

      try {
        const response = await fetch(configuredTelemetryUrl, {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
          signal: abortController.signal,
        })

        if (esp32SessionRef.current !== sessionId) return

        if (!response.ok) {
          throw new Error(
            `ESP32 telemetry request failed with HTTP ${response.status}.`
          )
        }

        handleEsp32Packet(await response.text())
      } catch (error) {
        if (esp32SessionRef.current !== sessionId) return

        setConnectionStatus('error')
        setStatus('error')
        setConnectionError(
          error instanceof DOMException && error.name === 'AbortError'
            ? 'ESP32 telemetry request timed out.'
            : error instanceof Error
            ? error.message
            : 'Failed to poll ESP32 telemetry.'
        )
      } finally {
        window.clearTimeout(timeoutId)
        if (esp32AbortControllerRef.current === abortController) {
          esp32AbortControllerRef.current = null
        }
        esp32PollInFlightRef.current = false
      }
    }

    void pollEsp32Telemetry()
    intervalRef.current = window.setInterval(() => {
      void pollEsp32Telemetry()
    }, 1000)
  }

  function stopEsp32Telemetry() {
    esp32SessionRef.current += 1
    esp32AbortControllerRef.current?.abort()
    esp32AbortControllerRef.current = null
    esp32PollInFlightRef.current = false
    setConnectionStatus('disconnected')
  }

  function handleEsp32Packet(rawJson: string) {
    try {
      const packet = JSON.parse(rawJson)
      const nextTelemetry = parseEsp32TelemetryPacket(packet)

      telemetryRef.current = nextTelemetry
      setTelemetry(nextTelemetry)
      setLastPacketAt(nextTelemetry.timestamp)
      setConnectionStatus('connected')
      setStatus('connected')
      setConnectionError(undefined)
    } catch (error) {
      setConnectionStatus('error')
      setStatus('error')
      setConnectionError(
        error instanceof Error ? error.message : 'Failed to parse ESP32 packet.'
      )
    }
  }

  useEffect(() => {
    return () => disconnect()
  }, [disconnect])

  return {
    telemetry,
    status,
    source,
    connectionStatus,
    connectionError,
    lastPacketAt,
    connect,
    disconnect,
    setSource,
  }
}
