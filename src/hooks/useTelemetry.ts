'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RouteSegment } from '@/data/raceRoute'
import {
  type Esp32TelemetryPacket,
  parseEsp32TelemetryPacket,
  simulatorTelemetryToEsp32Packet,
} from '@/lib/esp32Telemetry'
import { generateTelemetryFrame } from '@/lib/telemetrySimulator'
import type {
  TelemetryNodeId,
  TelemetryPacketStats,
  TelemetryConnectionStatus,
  TelemetryData,
  TelemetrySource,
} from '@/types/telemetry'

type Esp32ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

type CloudTelemetryLatestResponse = {
  ok?: boolean
  node?: string
  payload?: unknown
  updated_at?: string | null
  error?: string
}

const defaultCloudNode: TelemetryNodeId = 'vehicle'
const emptyPacketStats: TelemetryPacketStats = {
  packetsReceived: 0,
  packetsPerMinute: 0,
  averageUpdateIntervalSeconds: null,
  packetLossEstimatePercent: null,
}

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
  const [cloudNode, setCloudNodeState] =
    useState<TelemetryNodeId>(defaultCloudNode)
  const [packetStats, setPacketStats] =
    useState<TelemetryPacketStats>(emptyPacketStats)
  const intervalRef = useRef<number | null>(null)
  const esp32PollInFlightRef = useRef(false)
  const esp32AbortControllerRef = useRef<AbortController | null>(null)
  const esp32SessionRef = useRef(0)
  const cloudPollInFlightRef = useRef(false)
  const cloudAbortControllerRef = useRef<AbortController | null>(null)
  const cloudSessionRef = useRef(0)
  const telemetryRef = useRef<TelemetryData | null>(null)
  const packetTimestampsRef = useRef<number[]>([])
  const lastPacketKeyRef = useRef<string | null>(null)
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
    stopCloudTelemetry()
  }, [])

  const connect = useCallback(() => {
    disconnect()
    resetPacketStats()
    setStatus('connecting')
    setConnectionError(undefined)

    if (source === 'esp32') {
      startEsp32Telemetry()
      return
    }

    if (source === 'cloud') {
      startCloudTelemetry()
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
      recordPacket(nextTelemetry.timestamp, `${source}:${nextTelemetry.timestamp}`)
    }

    tick()
    intervalRef.current = window.setInterval(tick, 1000)
  }, [cloudNode, disconnect, source])

  const setSource = useCallback(
    (nextSource: TelemetrySource) => {
      disconnect()
      setSourceState(nextSource)
      setTelemetry(null)
      setLastPacketAt(undefined)
      setConnectionError(undefined)
      resetPacketStats()
    },
    [disconnect]
  )

  const setCloudNode = useCallback(
    (nextNode: TelemetryNodeId) => {
      disconnect()
      setCloudNodeState(nextNode)
      setTelemetry(null)
      setLastPacketAt(undefined)
      setConnectionError(undefined)
      resetPacketStats()
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

  function startCloudTelemetry() {
    const sessionId = cloudSessionRef.current + 1

    cloudSessionRef.current = sessionId
    setConnectionStatus('connecting')

    async function pollCloudTelemetry() {
      if (cloudPollInFlightRef.current) return

      cloudPollInFlightRef.current = true
      const abortController = new AbortController()
      const timeoutId = window.setTimeout(() => {
        abortController.abort()
      }, 5000)

      cloudAbortControllerRef.current = abortController

      try {
        const response = await fetch(
          `/api/telemetry/latest?node=${encodeURIComponent(cloudNode)}`,
          {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
          signal: abortController.signal,
          }
        )

        if (cloudSessionRef.current !== sessionId) return

        const latest = (await response.json()) as CloudTelemetryLatestResponse

        if (response.status === 404) {
          refreshPacketStats()
          setConnectionStatus('disconnected')
          setStatus('connecting')
          setConnectionError(undefined)
          return
        }

        if (!response.ok) {
          throw new Error(
            latest.error ??
              `Cloud telemetry request failed with HTTP ${response.status}.`
          )
        }

        setConnectionStatus('connected')

        if (!latest.payload) {
          refreshPacketStats()
          setStatus('connecting')
          setConnectionError(undefined)
          return
        }

        const packetReceivedAt = parseTimestamp(latest.updated_at) ?? Date.now()

        handleEsp32Payload(
          latest.payload,
          packetReceivedAt,
          `cloud:${latest.node ?? cloudNode}:${latest.updated_at ?? packetReceivedAt}`
        )
      } catch (error) {
        if (cloudSessionRef.current !== sessionId) return

        setConnectionStatus('error')
        setStatus('error')
        setConnectionError(
          error instanceof DOMException && error.name === 'AbortError'
            ? 'Cloud telemetry request timed out.'
            : error instanceof Error
            ? error.message
            : 'Failed to poll cloud telemetry.'
        )
      } finally {
        window.clearTimeout(timeoutId)
        if (cloudAbortControllerRef.current === abortController) {
          cloudAbortControllerRef.current = null
        }
        cloudPollInFlightRef.current = false
      }
    }

    void pollCloudTelemetry()
    intervalRef.current = window.setInterval(() => {
      void pollCloudTelemetry()
    }, 1000)
  }

  function stopCloudTelemetry() {
    cloudSessionRef.current += 1
    cloudAbortControllerRef.current?.abort()
    cloudAbortControllerRef.current = null
    cloudPollInFlightRef.current = false
  }

  function handleEsp32Packet(rawJson: string) {
    try {
      const packet = JSON.parse(rawJson)
      handleEsp32Payload(packet)
    } catch (error) {
      setConnectionStatus('error')
      setStatus('error')
      setConnectionError(
        error instanceof Error ? error.message : 'Failed to parse ESP32 packet.'
      )
    }
  }

  function handleEsp32Payload(
    payload: unknown,
    packetReceivedAt?: number,
    packetKey?: string
  ) {
    try {
      const packet =
        typeof payload === 'string' ? JSON.parse(payload) : payload
      const nextTelemetry = parseEsp32TelemetryPacket(
        packet as Esp32TelemetryPacket
      )
      const lastPacketTimestamp = packetReceivedAt ?? nextTelemetry.timestamp
      const lastPacketAgeSeconds = Math.max(
        0,
        Math.round((Date.now() - lastPacketTimestamp) / 1000)
      )

      telemetryRef.current = nextTelemetry
      setTelemetry(nextTelemetry)
      setLastPacketAt(lastPacketTimestamp)
      setConnectionStatus(lastPacketAgeSeconds > 15 ? 'disconnected' : 'connected')
      setStatus(lastPacketAgeSeconds > 15 ? 'disconnected' : 'connected')
      setConnectionError(undefined)
      recordPacket(
        lastPacketTimestamp,
        packetKey ?? `${source}:${lastPacketTimestamp}`
      )
    } catch (error) {
      setConnectionStatus('error')
      setStatus('error')
      setConnectionError(
        error instanceof Error ? error.message : 'Failed to parse ESP32 packet.'
      )
    }
  }

  function resetPacketStats() {
    packetTimestampsRef.current = []
    lastPacketKeyRef.current = null
    setPacketStats(emptyPacketStats)
  }

  function refreshPacketStats() {
    setPacketStats(calculatePacketStats(packetTimestampsRef.current))
  }

  function recordPacket(packetTimestamp: number, packetKey: string) {
    if (lastPacketKeyRef.current === packetKey) {
      refreshPacketStats()
      return
    }

    lastPacketKeyRef.current = packetKey
    packetTimestampsRef.current = [
      ...packetTimestampsRef.current,
      packetTimestamp,
    ].sort((a, b) => a - b)
    refreshPacketStats()
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
    packetStats,
    cloudNode,
    connect,
    disconnect,
    setSource,
    setCloudNode,
  }
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return undefined

  const timestamp = Date.parse(value)

  return Number.isFinite(timestamp) ? timestamp : undefined
}

function calculatePacketStats(timestamps: number[], now = Date.now()) {
  const packetsReceived = timestamps.length

  if (packetsReceived === 0) {
    return emptyPacketStats
  }

  const packetsPerMinute = timestamps.filter(
    (timestamp) => now - timestamp <= 60_000
  ).length
  const averageUpdateIntervalSeconds =
    packetsReceived > 1
      ? timestamps
          .slice(1)
          .reduce(
            (total, timestamp, index) =>
              total + Math.max(0, timestamp - timestamps[index]),
            0
          ) /
        (packetsReceived - 1) /
        1000
      : null
  const expectedPackets = Math.max(
    1,
    Math.floor((now - timestamps[0]) / 1000) + 1
  )
  const packetLossEstimatePercent =
    expectedPackets > 1
      ? Math.max(
          0,
          ((expectedPackets - packetsReceived) / expectedPackets) * 100
        )
      : 0

  return {
    packetsReceived,
    packetsPerMinute,
    averageUpdateIntervalSeconds,
    packetLossEstimatePercent,
  }
}
