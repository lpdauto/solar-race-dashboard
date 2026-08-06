'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TelemetryData } from '@/types/telemetry'
import type {
  EfficiencyRunStatus,
  EfficiencyTestRun,
  TestRunChartPoint,
  TestTelemetrySample,
} from '@/types/efficiencyTest'
import { nullableBoolean, nullableNumber } from '@/lib/testModeFormat'

const runHistoryStorageKey = 'rx2-testmode-efficiency-runs-v1'

// Below this speed we pause the *efficiency* accumulation (distance/energy/
// chart) entirely -- idle/stopped time should not pollute a cruise baseline.
// Raw sample logging is NOT gated by this; it always runs while active.
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
  name: string
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
  samples: TestTelemetrySample[]
  lastChartPushAtMs: number
}

export type EfficiencyLiveSnapshot = {
  elapsedSeconds: number
  distanceMiles: number
  rollingWhPerMile: number | null
  runAverageWhPerMile: number | null
  sampleCount: number
}

const initialLiveSnapshot: EfficiencyLiveSnapshot = {
  elapsedSeconds: 0,
  distanceMiles: 0,
  rollingWhPerMile: null,
  runAverageWhPerMile: null,
  sampleCount: 0,
}

/**
 * Drives the unified Test Mode "baseline efficiency" feature: one Start/End/
 * Reset flow that both (a) logs every raw telemetry sample unconditionally,
 * for later CSV/JSON export, and (b) accumulates energy/distance -- paused
 * below 5 mph -- to derive a 15s rolling Wh/mi and a run-average Wh/mi.
 *
 * Reuses the existing telemetry stream (no separate polling). `packetUpdatedAt`
 * should be the cloud packet's server-side updated_at (from useTelemetry()'s
 * cloudPacketStatus) so repeated polls of the same still-fresh packet don't
 * get double-logged/double-integrated as if time had passed.
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

  // Core loop. Runs whenever telemetry or its packet identity changes;
  // no-ops unless a run is active (runRef.current !== null).
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

    // 1. Raw sample logging -- unconditional, regardless of speed.
    acc.samples.push(buildRawSample(telemetry, nowMs))

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

    // 2. Efficiency accumulation -- gated on speed and on having a real time
    // delta to integrate over. Pauses (doesn't stop) below the low-speed
    // threshold, per spec.
    if (previousSampleAtMs !== null) {
      const deltaMs = nowMs - previousSampleAtMs
      const isLowSpeed = speedMph < lowSpeedThresholdMph

      if (Number.isFinite(deltaMs) && deltaMs > 0 && !isLowSpeed) {
        const deltaHours = deltaMs / 3_600_000
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

        const rollingCutoffMs = nowMs - rollingWindowMs
        while (
          acc.rollingBuffer.length > 0 &&
          acc.rollingBuffer[0].atMs < rollingCutoffMs
        ) {
          acc.rollingBuffer.shift()
        }

        // Only plot chart points once the efficiency conditions are
        // actually met (moving, actively accumulating) -- never while
        // paused below the low-speed threshold.
        if (nowMs - acc.lastChartPushAtMs >= chartPointIntervalMs) {
          acc.lastChartPushAtMs = nowMs

          acc.chartPoints.push({
            timestamp: nowMs,
            elapsedSeconds: Math.max(0, Math.round((nowMs - acc.startedAtMs) / 1000)),
            distanceMiles: acc.totalDistanceMiles,
            speedMph,
            powerW,
            rollingWhPerMile: rollingWhPerMileFrom(acc),
            runAverageWhPerMile:
              acc.totalDistanceMiles > 0
                ? acc.totalEnergyWh / acc.totalDistanceMiles
                : null,
          })
          setLiveChartPoints([...acc.chartPoints])
        }
      }
    }

    // Live snapshot (status-strip + metric-card values) updates every
    // processed sample regardless of low-speed pause, so elapsed time and
    // sample count stay live even while efficiency accumulation is paused.
    setLiveSnapshot({
      elapsedSeconds: Math.max(0, Math.round((nowMs - acc.startedAtMs) / 1000)),
      distanceMiles: acc.totalDistanceMiles,
      rollingWhPerMile: rollingWhPerMileFrom(acc),
      runAverageWhPerMile:
        acc.totalDistanceMiles > 0 ? acc.totalEnergyWh / acc.totalDistanceMiles : null,
      sampleCount: acc.samples.length,
    })
    // Accumulation reads runRef/refs directly; only telemetry identity and
    // packet freshness should re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetry, packetUpdatedAt])

  const startRun = useCallback((name: string) => {
    const nowMs = Date.now()
    const currentTelemetry = telemetryRef.current

    runRef.current = {
      id: createRunId(),
      name,
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
      samples: [],
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
      name: acc.name,
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
      samples: acc.samples,
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

function buildRawSample(telemetry: TelemetryData, nowMs: number): TestTelemetrySample {
  const location = telemetry.location

  return {
    timestamp: nowMs,
    gpsLat: nullableNumber(location?.latitude ?? telemetry.gpsLat),
    gpsLng: nullableNumber(location?.longitude ?? telemetry.gpsLng),
    gpsLatitude: nullableNumber(location?.latitude ?? telemetry.gpsLat),
    gpsLongitude: nullableNumber(location?.longitude ?? telemetry.gpsLng),
    gpsSpeedMps: nullableNumber(location?.speedMps ?? telemetry.gpsSpeed),
    gpsSpeedMph: nullableNumber(location?.speedMph ?? telemetry.speedMph),
    gpsHeading: nullableNumber(location?.heading ?? telemetry.gpsHeading),
    gpsAltitudeMeters: nullableNumber(location?.altitudeMeters),
    gpsAltitudeFeet: nullableNumber(location?.altitudeFeet ?? telemetry.gpsElevationFt),
    gpsAccuracyMeters: nullableNumber(location?.accuracyMeters ?? telemetry.gpsAccuracy),
    gpsClientTimestamp: nullableNumber(location?.clientTimestamp),
    gpsServerTimestamp: nullableNumber(location?.serverTimestamp),
    gpsAgeMs: nullableNumber(location?.ageMs ?? telemetry.gpsAgeMs),
    gpsStatus: location?.status ?? null,
    gpsProviderName: location?.providerName ?? null,
    gpsSource: location?.source ?? null,
    speedMph: nullableNumber(telemetry.speedMph),
    distanceMiles: nullableNumber(telemetry.distanceMiles ?? telemetry.odometerMiles),
    batterySocPercent: nullableNumber(telemetry.batterySocPercent),
    batteryVoltage: nullableNumber(telemetry.batteryVoltage),
    batteryCurrent: nullableNumber(telemetry.batteryCurrent),
    batteryPowerWatts: nullableNumber(telemetry.batteryPowerWatts),
    whPerMile: nullableNumber(telemetry.efficiencyWhPerMile ?? telemetry.whPerMile),
    motorTempC: nullableNumber(telemetry.motorTempC),
    controllerTempC: nullableNumber(telemetry.controllerTempC),
    controllerSpeedMph: nullableNumber(telemetry.controllerSpeedMph),
    motorRpm: nullableNumber(telemetry.motorRpm),
    throttlePercent: nullableNumber(telemetry.throttlePercent),
    throttleVoltage: nullableNumber(telemetry.throttleVoltage),
    phaseA: nullableNumber(telemetry.phaseA),
    phaseC: nullableNumber(telemetry.phaseC),
    modulation: nullableNumber(telemetry.modulation),
    gear: nullableNumber(telemetry.gear),
    controllerSerial: telemetry.controllerSerial ?? null,
    controllerFaultCode: nullableNumber(telemetry.controllerFaultCode),
    controllerState: telemetry.controllerState ?? null,
    bleConnected: nullableBoolean(telemetry.bleConnected),
    packetRateHz: nullableNumber(telemetry.packetRateHz),
    solarPowerWatts: nullableNumber(telemetry.solarPowerWatts),
    mpptPowerWatts: nullableNumber(
      telemetry.mpptPowerWatts ?? telemetry.mpptPvPowerWatts ?? telemetry.mpptChargePowerWatts
    ),
    bmsConnected: nullableBoolean(telemetry.bmsConnected),
    bmsAddress: telemetry.bmsAddress ?? null,
    bmsVoltage: nullableNumber(telemetry.bmsVoltage),
    bmsCurrent: nullableNumber(telemetry.bmsCurrent),
    bmsPowerWatts: nullableNumber(telemetry.bmsPowerWatts),
    bmsSocPercent: nullableNumber(telemetry.bmsSocPercent),
    avgCellVoltage: nullableNumber(telemetry.avgCellVoltage),
    cellMinVoltage: nullableNumber(telemetry.cellMinVoltage),
    cellMaxVoltage: nullableNumber(telemetry.cellMaxVoltage),
    cellDeltaMv: nullableNumber(telemetry.cellDeltaMv),
    batteryTemp1C: nullableNumber(telemetry.batteryTemp1C),
    batteryTemp2C: nullableNumber(telemetry.batteryTemp2C),
    mosTempC: nullableNumber(telemetry.mosTempC),
  }
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
