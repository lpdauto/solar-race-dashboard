'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TelemetryData } from '@/types/telemetry'
import type {
  EfficiencyRunStatus,
  EfficiencyTestRun,
  TestRunChartPoint,
} from '@/types/efficiencyTest'

const runHistoryStorageKey = 'rx2-testmode-efficiency-runs-v1'

// Below this speed we pause accumulation entirely (idle/stopped time should
// not pollute a cruise-efficiency baseline).
const lowSpeedThresholdMph = 5
const rollingWindowMs = 15_000
// Upper bound on chart-point cadence. Actual cadence also depends on how
// often the phone uploads a genuinely new sample (see packetUpdatedAt below).
const chartPointIntervalMs = 1_000

const defaultTargetSpeedMph = 30
const defaultTargetDistanceMiles = 2

type RollingSample = {
  atMs: number
  deltaEnergyWh: number
  deltaDistanceMiles: number
}

type RunAccumulator = {
  id: string
  startedAtMs: number
  lastSampleAtMs: number | null
  totalDistanceMiles: number
  /** Discharge-only accumulation (regen excluded) -- the primary Wh figure. */
  totalEnergyWh: number
  /** Signed net accumulation (regen included as negative). */
  netEnergyWh: number
  speedSumMph: number
  speedSampleCount: number
  powerSumW: number
  powerSampleCount: number
  startingMotorTempC?: number
  latestMotorTempC?: number
  startingControllerTempC?: number
  latestControllerTempC?: number
  rollingBuffer: RollingSample[]
  chartPoints: TestRunChartPoint[]
  lastChartPushAtMs: number
}

export type EfficiencyLiveSnapshot = {
  elapsedSeconds: number
  distanceMiles: number
  rollingWhPerMile: number | null
  runAverageWhPerMile: number | null
}

const initialLiveSnapshot: EfficiencyLiveSnapshot = {
  elapsedSeconds: 0,
  distanceMiles: 0,
  rollingWhPerMile: null,
  runAverageWhPerMile: null,
}

/**
 * Drives the Test Mode baseline-efficiency feature: accumulates energy/
 * distance from the existing telemetry stream (no separate polling),
 * derives a 15s rolling Wh/mi and a run-average Wh/mi, and persists
 * completed runs to localStorage.
 *
 * `packetUpdatedAt` should be the cloud packet's server-side updated_at
 * (from useTelemetry()'s cloudPacketStatus) so repeated polls of the same
 * still-fresh packet don't get double-integrated as if time had passed.
 */
export function useEfficiencyTestRun(
  telemetry: TelemetryData | null,
  packetUpdatedAt?: string | null
) {
  const [status, setStatus] = useState<EfficiencyRunStatus>('idle')
  const [targetSpeedMph, setTargetSpeedMph] = useState(defaultTargetSpeedMph)
  const [targetDistanceMiles, setTargetDistanceMiles] = useState(
    defaultTargetDistanceMiles
  )
  const [liveSnapshot, setLiveSnapshot] =
    useState<EfficiencyLiveSnapshot>(initialLiveSnapshot)
  const [liveChartPoints, setLiveChartPoints] = useState<TestRunChartPoint[]>([])
  const [completedRun, setCompletedRun] = useState<EfficiencyTestRun | null>(null)
  const [runHistory, setRunHistory] = useState<EfficiencyTestRun[]>([])

  const runRef = useRef<RunAccumulator | null>(null)
  const telemetryRef = useRef<TelemetryData | null>(telemetry)
  const targetSpeedRef = useRef(targetSpeedMph)
  const targetDistanceRef = useRef(targetDistanceMiles)
  const lastProcessedUpdatedAtRef = useRef<string | null>(null)

  useEffect(() => {
    telemetryRef.current = telemetry
  }, [telemetry])

  useEffect(() => {
    targetSpeedRef.current = targetSpeedMph
  }, [targetSpeedMph])

  useEffect(() => {
    targetDistanceRef.current = targetDistanceMiles
  }, [targetDistanceMiles])

  useEffect(() => {
    setRunHistory(readRunHistory())
  }, [])

  // Core accumulation loop. Runs whenever telemetry or its packet identity
  // changes; no-ops unless a run is active (runRef.current !== null).
  useEffect(() => {
    const acc = runRef.current
    if (!telemetry || !acc) return

    const dedupeKey = packetUpdatedAt ?? null
    const isDuplicatePacket =
      dedupeKey !== null && dedupeKey === lastProcessedUpdatedAtRef.current

    if (isDuplicatePacket) return

    lastProcessedUpdatedAtRef.current = dedupeKey

    const nowMs = Date.now()
    const speedMph = firstFiniteNumber(telemetry.gpsSpeed, telemetry.speedMph) ?? 0
    const powerW =
      firstFiniteNumber(
        multiplyIfFinite(telemetry.batteryVoltage, telemetry.batteryCurrent),
        telemetry.batteryPowerWatts
      ) ?? 0

    if (acc.startingMotorTempC === undefined && Number.isFinite(telemetry.motorTempC)) {
      acc.startingMotorTempC = telemetry.motorTempC
    }
    if (
      acc.startingControllerTempC === undefined &&
      Number.isFinite(telemetry.controllerTempC)
    ) {
      acc.startingControllerTempC = telemetry.controllerTempC
    }
    if (Number.isFinite(telemetry.motorTempC)) acc.latestMotorTempC = telemetry.motorTempC
    if (Number.isFinite(telemetry.controllerTempC)) {
      acc.latestControllerTempC = telemetry.controllerTempC
    }

    const previousSampleAtMs = acc.lastSampleAtMs
    acc.lastSampleAtMs = nowMs
    acc.speedSumMph += speedMph
    acc.speedSampleCount += 1
    acc.powerSumW += powerW
    acc.powerSampleCount += 1

    if (previousSampleAtMs !== null) {
      const deltaMs = nowMs - previousSampleAtMs

      if (Number.isFinite(deltaMs) && deltaMs > 0) {
        const deltaHours = deltaMs / 3_600_000
        const isLowSpeed = speedMph < lowSpeedThresholdMph

        // Pause accumulation (both distance and energy) below the low-speed
        // threshold, per spec -- but never stop the run or drop prior data.
        if (!isLowSpeed) {
          const deltaDistanceMiles = speedMph * deltaHours
          const deltaEnergyWhNet = powerW * deltaHours
          const deltaEnergyConsumedWh = Math.max(0, deltaEnergyWhNet)

          acc.totalDistanceMiles += deltaDistanceMiles
          acc.netEnergyWh += deltaEnergyWhNet
          acc.totalEnergyWh += deltaEnergyConsumedWh

          acc.rollingBuffer.push({
            atMs: nowMs,
            deltaEnergyWh: deltaEnergyConsumedWh,
            deltaDistanceMiles,
          })
        }

        const rollingCutoffMs = nowMs - rollingWindowMs
        while (
          acc.rollingBuffer.length > 0 &&
          acc.rollingBuffer[0].atMs < rollingCutoffMs
        ) {
          acc.rollingBuffer.shift()
        }
      }
    }

    const shouldPushChartPoint = nowMs - acc.lastChartPushAtMs >= chartPointIntervalMs
    if (!shouldPushChartPoint) return

    acc.lastChartPushAtMs = nowMs

    const rollingWhPerMile = rollingWhPerMileFrom(acc)
    const runAverageWhPerMile =
      acc.totalDistanceMiles > 0 ? acc.totalEnergyWh / acc.totalDistanceMiles : null

    const point: TestRunChartPoint = {
      timestamp: nowMs,
      elapsedSeconds: Math.max(0, Math.round((nowMs - acc.startedAtMs) / 1000)),
      distanceMiles: acc.totalDistanceMiles,
      speedMph,
      powerW,
      rollingWhPerMile,
      runAverageWhPerMile,
    }

    acc.chartPoints.push(point)
    setLiveChartPoints([...acc.chartPoints])
    setLiveSnapshot({
      elapsedSeconds: point.elapsedSeconds,
      distanceMiles: acc.totalDistanceMiles,
      rollingWhPerMile,
      runAverageWhPerMile,
    })
    // Accumulation reads runRef/refs directly; only telemetry identity and
    // packet freshness should re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetry, packetUpdatedAt])

  const startRun = useCallback(() => {
    const nowMs = Date.now()
    const currentTelemetry = telemetryRef.current

    runRef.current = {
      id: createRunId(),
      startedAtMs: nowMs,
      lastSampleAtMs: null,
      totalDistanceMiles: 0,
      totalEnergyWh: 0,
      netEnergyWh: 0,
      speedSumMph: 0,
      speedSampleCount: 0,
      powerSumW: 0,
      powerSampleCount: 0,
      startingMotorTempC: finiteOrUndefined(currentTelemetry?.motorTempC),
      latestMotorTempC: finiteOrUndefined(currentTelemetry?.motorTempC),
      startingControllerTempC: finiteOrUndefined(currentTelemetry?.controllerTempC),
      latestControllerTempC: finiteOrUndefined(currentTelemetry?.controllerTempC),
      rollingBuffer: [],
      chartPoints: [],
      lastChartPushAtMs: 0,
    }
    lastProcessedUpdatedAtRef.current = null

    setStatus('running')
    setCompletedRun(null)
    setLiveChartPoints([])
    setLiveSnapshot(initialLiveSnapshot)
  }, [])

  const endRun = useCallback(() => {
    const acc = runRef.current
    if (!acc) return

    const nowMs = Date.now()
    const elapsedSeconds = Math.max(0, Math.round((nowMs - acc.startedAtMs) / 1000))
    const averageSpeedMph =
      acc.speedSampleCount > 0 ? acc.speedSumMph / acc.speedSampleCount : 0
    const averagePowerW =
      acc.powerSampleCount > 0 ? acc.powerSumW / acc.powerSampleCount : 0
    const averageWhPerMile =
      acc.totalDistanceMiles > 0 ? acc.totalEnergyWh / acc.totalDistanceMiles : 0

    const completed: EfficiencyTestRun = {
      id: acc.id,
      targetSpeedMph: targetSpeedRef.current,
      targetDistanceMiles: targetDistanceRef.current,
      startedAt: new Date(acc.startedAtMs).toISOString(),
      endedAt: new Date(nowMs).toISOString(),
      elapsedSeconds,
      actualDistanceMiles: acc.totalDistanceMiles,
      totalEnergyWh: acc.totalEnergyWh,
      netEnergyWh: acc.netEnergyWh,
      averageSpeedMph,
      averagePowerW,
      averageWhPerMile,
      startingMotorTempC: acc.startingMotorTempC,
      endingMotorTempC: acc.latestMotorTempC,
      startingControllerTempC: acc.startingControllerTempC,
      endingControllerTempC: acc.latestControllerTempC,
      chartPoints: acc.chartPoints,
    }

    runRef.current = null
    setStatus('completed')
    setCompletedRun(completed)
    setRunHistory((previous) => {
      const next = [completed, ...previous]
      writeRunHistory(next)
      return next
    })
  }, [])

  const resetRun = useCallback(() => {
    if (status === 'running') {
      const confirmed =
        typeof window === 'undefined' ||
        window.confirm('A run is currently active. Reset and discard it?')

      if (!confirmed) return
    }

    runRef.current = null
    setStatus('idle')
    setCompletedRun(null)
    setLiveChartPoints([])
    setLiveSnapshot(initialLiveSnapshot)
  }, [status])

  const deleteHistoryRun = useCallback((runId: string) => {
    setRunHistory((previous) => {
      const next = previous.filter((run) => run.id !== runId)
      writeRunHistory(next)
      return next
    })
  }, [])

  const chartPoints =
    status === 'completed' && completedRun ? completedRun.chartPoints : liveChartPoints

  return {
    status,
    targetSpeedMph,
    setTargetSpeedMph,
    targetDistanceMiles,
    setTargetDistanceMiles,
    liveSnapshot,
    chartPoints,
    completedRun,
    runHistory,
    startRun,
    endRun,
    resetRun,
    deleteHistoryRun,
  }
}

function rollingWhPerMileFrom(acc: RunAccumulator): number | null {
  if (acc.rollingBuffer.length === 0) return null

  let energyWh = 0
  let distanceMiles = 0

  for (const sample of acc.rollingBuffer) {
    energyWh += sample.deltaEnergyWh
    distanceMiles += sample.deltaDistanceMiles
  }

  return distanceMiles > 0 ? energyWh / distanceMiles : null
}

export function firstFiniteNumber(...values: Array<number | undefined>) {
  return values.find((value) => typeof value === 'number' && Number.isFinite(value))
}

export function multiplyIfFinite(left: unknown, right: unknown) {
  return typeof left === 'number' &&
    Number.isFinite(left) &&
    typeof right === 'number' &&
    Number.isFinite(right)
    ? left * right
    : undefined
}

function finiteOrUndefined(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function createRunId() {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readRunHistory(): EfficiencyTestRun[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(runHistoryStorageKey)
    return raw ? (JSON.parse(raw) as EfficiencyTestRun[]) : []
  } catch {
    return []
  }
}

function writeRunHistory(history: EfficiencyTestRun[]) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(runHistoryStorageKey, JSON.stringify(history))
  } catch {
    // Ignore storage failures (e.g. private browsing).
  }
}
