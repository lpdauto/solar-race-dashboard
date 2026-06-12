import type { RaceDay, RouteSegment } from '@/data/raceRoute'
import type { TelemetryHistorySample } from '@/hooks/useTelemetry'
import { rx2Config } from '@/lib/race/rx2Config'
import {
  buildRaceSchedule,
  forecastRaceScheduleEnergy,
  type RaceScheduleEvent,
  type RaceScheduleEventType,
  type RaceScheduleForecastMode,
} from '@/lib/raceSchedule'
import { getRawTelemetryWhPerMile } from '@/lib/safeWhPerMile'
import type { TelemetryData } from '@/types/telemetry'

export type PredictionConfidence = 'high' | 'medium' | 'low'

export type RacePrediction = {
  timestamp: number
  confidence: PredictionConfidence
  warnings: string[]
  predictedWhPerMile: number
  predictedMpptWatts: number
  currentBatteryEnergyWh: number
  currentSocPercent: number
  projectedEndSegmentSocPercent?: number
  projectedNextStopSocPercent?: number
  projectedAfterNextStopSocPercent?: number
  projectedEndDaySocPercent?: number
  projectedDriveEnergyWh?: number
  projectedSolarRecoveredDrivingWh?: number
  projectedSolarRecoveredStoppedWh?: number
  projectedSolarRecoveredTraileringWh?: number
  projectedSolarRecoveredPostFinishWh?: number
  projectedSolarRecoveredMorningWh?: number
  projectedSolarRecoveredWh?: number
  usableSolarRecoveryWh?: number
  wastedSolarRecoveryWh?: number
  projectedNetEnergyWh?: number
  forecastMode?: RaceScheduleForecastMode
  usesDefaultScheduleAssumptions?: boolean
  defaultScheduleWarningCount?: number
  postFinishSolarRecoveryIncluded?: boolean
  morningSolarRecoveryIncluded?: boolean
  reserveEnergyWh: number
  reserveMarginPercent?: number
  energyMarginWh?: number
  energyMarginKWh?: number
  remainingSegmentMiles?: number
  remainingDayMiles?: number
  nextStopMiles?: number
  nextScheduleEventLabel?: string
  nextScheduleEventType?: RaceScheduleEventType
}

type ValueSource = 'live' | 'rolling' | 'fallback'

export const freshTelemetryWindowSeconds = 10
export const minPredictionWhPerMile = 25
export const maxPredictionWhPerMile = 75

export function buildRacePrediction({
  telemetry,
  telemetryHistory,
  raceDay,
  currentSegment,
  currentMile,
  telemetryTimestampMs,
  scheduleEvents,
  forecastMode = 'normal',
  now = Date.now(),
}: {
  telemetry: TelemetryData | null
  telemetryHistory: TelemetryHistorySample[]
  raceDay: RaceDay
  currentSegment?: RouteSegment | null
  currentMile: number
  telemetryTimestampMs?: number
  scheduleEvents?: RaceScheduleEvent[]
  forecastMode?: RaceScheduleForecastMode
  now?: number
}): RacePrediction {
  const warnings: string[] = []
  const telemetryAgeSeconds = telemetry
    ? packetAgeSeconds({
        telemetry,
        telemetryTimestampMs,
        now,
      })
    : null
  const staleTelemetry =
    telemetryAgeSeconds === null ||
    telemetryAgeSeconds > freshTelemetryWindowSeconds
  const wh = predictedWhPerMile({
    telemetry,
    telemetryHistory,
  })
  const mppt = predictedMpptWatts(telemetry)
  const battery = currentBatteryEnergy({
    telemetry,
    batteryCapacityWh: rx2Config.mainBatteryUsableWh,
  })
  const routeKnown = Boolean(raceDay && currentSegment)
  const remainingDayMiles = Math.max(0, raceDay.distanceMiles - currentMile)
  const remainingSegmentMiles = currentSegment
    ? Math.max(0, currentSegment.mileEnd - currentMile)
    : undefined
  const nextStopMiles = nextStopDistance({
    raceDay,
    currentMile,
  })
  const speedForPredictionMph =
    telemetry && telemetry.speedMph > 1
      ? telemetry.speedMph
      : rx2Config.defaultTargetSpeedMph
  const raceScheduleEvents = scheduleEvents ?? buildRaceSchedule({ raceDay })
  const reserveSocPercent = isFinalRaceDay(raceDay)
    ? rx2Config.finalDayTargetReserveSocPercent
    : rx2Config.reserveSocPercent
  const reserveEnergyWh =
    (reserveSocPercent / 100) * rx2Config.mainBatteryUsableWh
  const scheduleForecast = forecastRaceScheduleEnergy({
    events: raceScheduleEvents,
    currentMile,
    currentBatteryEnergyWh: battery.value,
    predictedWhPerMile: wh.value,
    predictedMpptWatts: mppt.value,
    driveSpeedMph: speedForPredictionMph,
    batteryCapacityWh: rx2Config.mainBatteryUsableWh,
    defaultTrailerSpeedMph: rx2Config.defaultTrailerSpeedMph,
    forecastMode,
  })

  if (staleTelemetry) {
    warnings.push('Telemetry is stale; prediction confidence is low.')
  }
  if (!routeKnown) {
    warnings.push('Route segment is unavailable; segment projection is limited.')
  }
  if (wh.source === 'fallback') {
    warnings.push('Using configured Wh/mi fallback for prediction.')
  }
  if (wh.clamped) {
    warnings.push('Measured Wh/mi was clamped for prediction stability.')
  }
  if (mppt.source === 'fallback') {
    warnings.push('Using configured solar fallback for MPPT prediction.')
  }
  if (mppt.value <= 0) {
    warnings.push(
      'MPPT input is zero; solar recovery is unavailable and prediction confidence is reduced.'
    )
  }
  if (
    typeof telemetry?.batteryEnergyWh === 'number' &&
    (telemetry.batteryEnergyWh < 0 ||
      telemetry.batteryEnergyWh > rx2Config.mainBatteryUsableWh)
  ) {
    warnings.push('Battery energy telemetry was outside usable capacity and was clamped.')
  }
  if (
    typeof telemetry?.batterySocPercent === 'number' &&
    (telemetry.batterySocPercent < 0 || telemetry.batterySocPercent > 100)
  ) {
    warnings.push('Battery SOC telemetry was outside 0-100% and was clamped.')
  }
  if (battery.source !== 'telemetry') {
    warnings.push('Battery energy is estimated from SOC.')
  }
  if (!scheduleForecast.scheduleKnown) {
    warnings.push(
      'Race schedule is unavailable; prediction excludes stop and trailer recovery.'
    )
  }
  if (scheduleForecast.usesDefaultDurations) {
    warnings.push(
      `Schedule uses ${scheduleForecast.defaultDurationEventCount} default stop/trailer duration estimate(s).`
    )
  }
  if (scheduleForecast.usesEstimatedDurations) {
    warnings.push(
      `Schedule uses ${scheduleForecast.estimatedDurationEventCount} estimated trailer duration(s).`
    )
  }
  if (!scheduleForecast.postFinishSolarRecoveryIncluded) {
    warnings.push(
      'No explicit post-finish charging window is configured; post-finish solar recovery is excluded.'
    )
  }
  if (!scheduleForecast.morningSolarRecoveryIncluded) {
    warnings.push(
      'No explicit morning charging window is configured; morning solar recovery is excluded.'
    )
  }

  const endSegment =
    remainingSegmentMiles !== undefined
      ? projectEnergy({
          currentBatteryEnergyWh: battery.value,
          miles: remainingSegmentMiles,
          predictedWhPerMile: wh.value,
          predictedMpptWatts: mppt.value,
          speedMph: speedForPredictionMph,
          batteryCapacityWh: rx2Config.mainBatteryUsableWh,
        })
      : null
  const nextStop =
    nextStopMiles !== undefined
      ? projectEnergy({
          currentBatteryEnergyWh: battery.value,
          miles: nextStopMiles,
          predictedWhPerMile: wh.value,
          predictedMpptWatts: mppt.value,
          speedMph: speedForPredictionMph,
          batteryCapacityWh: rx2Config.mainBatteryUsableWh,
        })
      : null
  const endDay = projectEnergy({
    currentBatteryEnergyWh: battery.value,
    miles: remainingDayMiles,
    predictedWhPerMile: wh.value,
    predictedMpptWatts: mppt.value,
    speedMph: speedForPredictionMph,
    batteryCapacityWh: rx2Config.mainBatteryUsableWh,
  })
  const projectedDriveEnergyWh = scheduleForecast.scheduleKnown
    ? scheduleForecast.projectedDriveEnergyWh
    : endDay.driveEnergyWh
  const projectedSolarRecoveredWh = scheduleForecast.scheduleKnown
    ? scheduleForecast.projectedSolarRecoveredWh
    : endDay.solarRecoveredWh
  const usableSolarRecoveryWh = scheduleForecast.scheduleKnown
    ? scheduleForecast.usableSolarRecoveryWh
    : endDay.usableSolarRecoveryWh
  const wastedSolarRecoveryWh = scheduleForecast.scheduleKnown
    ? scheduleForecast.wastedSolarRecoveryWh
    : endDay.wastedSolarRecoveryWh
  const projectedEndDaySocPercent = scheduleForecast.scheduleKnown
    ? scheduleForecast.projectedEndDaySocPercent
    : endDay.socPercent
  const energyMarginWh =
    battery.value +
    projectedSolarRecoveredWh -
    projectedDriveEnergyWh -
    reserveEnergyWh

  return {
    timestamp: now,
    confidence: confidenceLevel({
      staleTelemetry,
      routeKnown,
      missingBatteryEnergy: battery.source !== 'telemetry',
      fallbackCount: [wh.source, mppt.source].filter(
        (source) => source === 'fallback'
      ).length,
      zeroMppt: mppt.value <= 0,
      scheduleKnown: scheduleForecast.scheduleKnown,
      usesDefaultScheduleAssumptions:
        scheduleForecast.usesDefaultDurations ||
        scheduleForecast.usesEstimatedDurations,
    }),
    warnings: dedupeWarnings(warnings),
    predictedWhPerMile: wh.value,
    predictedMpptWatts: mppt.value,
    currentBatteryEnergyWh: battery.value,
    currentSocPercent: battery.socPercent,
    projectedEndSegmentSocPercent: endSegment?.socPercent,
    projectedNextStopSocPercent:
      scheduleForecast.projectedNextScheduleEventSocPercent ??
      nextStop?.socPercent,
    projectedAfterNextStopSocPercent:
      scheduleForecast.projectedAfterNextStopSocPercent,
    projectedEndDaySocPercent,
    projectedDriveEnergyWh,
    projectedSolarRecoveredDrivingWh:
      scheduleForecast.projectedSolarRecoveredDrivingWh,
    projectedSolarRecoveredStoppedWh:
      scheduleForecast.projectedSolarRecoveredStoppedWh,
    projectedSolarRecoveredTraileringWh:
      scheduleForecast.projectedSolarRecoveredTraileringWh,
    projectedSolarRecoveredPostFinishWh:
      scheduleForecast.projectedSolarRecoveredPostFinishWh,
    projectedSolarRecoveredMorningWh:
      scheduleForecast.projectedSolarRecoveredMorningWh,
    projectedSolarRecoveredWh,
    usableSolarRecoveryWh,
    wastedSolarRecoveryWh,
    projectedNetEnergyWh: scheduleForecast.scheduleKnown
      ? scheduleForecast.projectedNetEnergyWh
      : endDay.netEnergyWh,
    forecastMode: scheduleForecast.forecastMode,
    usesDefaultScheduleAssumptions:
      scheduleForecast.usesDefaultDurations ||
      scheduleForecast.usesEstimatedDurations,
    defaultScheduleWarningCount:
      scheduleForecast.defaultDurationEventCount +
      scheduleForecast.estimatedDurationEventCount,
    postFinishSolarRecoveryIncluded:
      scheduleForecast.postFinishSolarRecoveryIncluded,
    morningSolarRecoveryIncluded:
      scheduleForecast.morningSolarRecoveryIncluded,
    reserveEnergyWh,
    reserveMarginPercent:
      projectedEndDaySocPercent !== undefined
        ? projectedEndDaySocPercent - reserveSocPercent
        : undefined,
    energyMarginWh,
    energyMarginKWh: energyMarginWh / 1000,
    remainingSegmentMiles,
    remainingDayMiles,
    nextStopMiles,
    nextScheduleEventLabel: scheduleForecast.nextScheduleEventLabel,
    nextScheduleEventType: scheduleForecast.nextScheduleEventType,
  }
}

function isFinalRaceDay(raceDay: RaceDay) {
  return raceDay.day >= 5
}

function predictedWhPerMile({
  telemetry,
  telemetryHistory,
}: {
  telemetry: TelemetryData | null
  telemetryHistory: TelemetryHistorySample[]
}) {
  const rollingWh = rollingRecentWhPerMile(telemetryHistory)
  const liveWh = finitePositiveNumber(getRawTelemetryWhPerMile(telemetry))
  const rawValue = rollingWh ?? liveWh
  const fallbackUsed = rawValue === undefined
  const unclampedValue = rawValue ?? rx2Config.defaultRaceWhPerMile
  const value = clamp(
    unclampedValue,
    minPredictionWhPerMile,
    maxPredictionWhPerMile
  )

  return {
    value,
    source: rollingWh !== undefined
      ? 'rolling' as ValueSource
      : fallbackUsed
        ? 'fallback' as ValueSource
        : 'live' as ValueSource,
    clamped: value !== unclampedValue,
  }
}

function predictedMpptWatts(telemetry: TelemetryData | null) {
  const liveValue = firstFiniteNumber(
    telemetry?.mpptChargePowerWatts,
    telemetry?.mpptPowerWatts,
    telemetry?.solarPowerWatts
  )
  const rawValue = liveValue ?? rx2Config.expectedSolarStationWatts

  return {
    value: clamp(rawValue, 0, rx2Config.solarStationMaxWatts),
    source: liveValue !== undefined
      ? 'live' as ValueSource
      : 'fallback' as ValueSource,
  }
}

function currentBatteryEnergy({
  telemetry,
  batteryCapacityWh,
}: {
  telemetry: TelemetryData | null
  batteryCapacityWh: number
}) {
  const telemetryEnergy = finitePositiveNumber(telemetry?.batteryEnergyWh)
  const socPercent = clamp(telemetry?.batterySocPercent ?? 0, 0, 100)
  const value =
    telemetryEnergy ??
    clamp((socPercent / 100) * batteryCapacityWh, 0, batteryCapacityWh)
  const clampedValue = clamp(value, 0, batteryCapacityWh)

  return {
    value: clampedValue,
    socPercent:
      batteryCapacityWh > 0
        ? clamp((clampedValue / batteryCapacityWh) * 100, 0, 100)
        : socPercent,
    source: telemetryEnergy === undefined
      ? 'soc' as const
      : 'telemetry' as const,
  }
}

function projectEnergy({
  currentBatteryEnergyWh,
  miles,
  predictedWhPerMile,
  predictedMpptWatts,
  speedMph,
  batteryCapacityWh,
}: {
  currentBatteryEnergyWh: number
  miles: number
  predictedWhPerMile: number
  predictedMpptWatts: number
  speedMph: number
  batteryCapacityWh: number
}) {
  const driveEnergyWh = Math.max(0, miles) * predictedWhPerMile
  const driveHours = speedMph > 1 ? Math.max(0, miles) / speedMph : 0
  const solarRecoveredWh = predictedMpptWatts * driveHours
  const netEnergyWh = driveEnergyWh - solarRecoveredWh
  const rawProjectedEnergyWh =
    currentBatteryEnergyWh - driveEnergyWh + solarRecoveredWh
  const wastedSolarRecoveryWh = Math.max(0, rawProjectedEnergyWh - batteryCapacityWh)
  const usableSolarRecoveryWh = Math.max(
    0,
    solarRecoveredWh - wastedSolarRecoveryWh
  )
  const projectedEnergyWh = clamp(
    rawProjectedEnergyWh,
    0,
    batteryCapacityWh
  )

  return {
    driveEnergyWh,
    solarRecoveredWh,
    usableSolarRecoveryWh,
    wastedSolarRecoveryWh,
    netEnergyWh,
    socPercent:
      batteryCapacityWh > 0
        ? clamp(projectedEnergyWh / batteryCapacityWh * 100, 0, 100)
        : 0,
  }
}

function rollingRecentWhPerMile(history: TelemetryHistorySample[]) {
  const samples = history
    .filter(
      (sample) =>
        Number.isFinite(sample.timestamp) &&
        Number.isFinite(sample.distanceMiles) &&
        Number.isFinite(sample.batteryEnergyUsedWh)
    )
    .sort((left, right) => left.timestamp - right.timestamp)

  if (samples.length < 2) return undefined

  const latest = samples[samples.length - 1]
  const earliest = [...samples]
    .reverse()
    .find(
      (sample) =>
        latest.distanceMiles !== undefined &&
        sample.distanceMiles !== undefined &&
        latest.distanceMiles - sample.distanceMiles >= 1
    ) ?? samples[0]
  const distanceMiles =
    (latest.distanceMiles ?? 0) - (earliest.distanceMiles ?? 0)
  const energyWh =
    (latest.batteryEnergyUsedWh ?? 0) - (earliest.batteryEnergyUsedWh ?? 0)

  if (distanceMiles < 1 || energyWh <= 0) return undefined

  return energyWh / distanceMiles
}

function nextStopDistance({
  raceDay,
  currentMile,
}: {
  raceDay: RaceDay
  currentMile: number
}) {
  const nextRoutePoint = raceDay.routePoints
    .filter((point) => point.mile > currentMile)
    .sort((left, right) => left.mile - right.mile)[0]
  const nextStopSegment = raceDay.segments
    .filter((segment) => segment.type === 'stop' && segment.mileStart > currentMile)
    .sort((left, right) => left.mileStart - right.mileStart)[0]
  const nextStopMile =
    nextRoutePoint?.mile ??
    nextStopSegment?.mileStart ??
    raceDay.distanceMiles

  return Math.max(0, nextStopMile - currentMile)
}

function packetAgeSeconds({
  telemetry,
  telemetryTimestampMs,
  now,
}: {
  telemetry: TelemetryData
  telemetryTimestampMs?: number
  now: number
}) {
  const timestamp =
    telemetryTimestampMs ??
    parseCloudTimestamp(telemetry.cloudUpdatedAt) ??
    (telemetry.timestamp > 1_000_000_000_000 ? telemetry.timestamp : undefined)

  return timestamp === undefined ? null : Math.max(0, (now - timestamp) / 1000)
}

function confidenceLevel({
  staleTelemetry,
  routeKnown,
  missingBatteryEnergy,
  fallbackCount,
  zeroMppt,
  scheduleKnown,
  usesDefaultScheduleAssumptions,
}: {
  staleTelemetry: boolean
  routeKnown: boolean
  missingBatteryEnergy: boolean
  fallbackCount: number
  zeroMppt: boolean
  scheduleKnown: boolean
  usesDefaultScheduleAssumptions: boolean
}): PredictionConfidence {
  if (
    staleTelemetry ||
    !routeKnown ||
    missingBatteryEnergy ||
    !scheduleKnown ||
    fallbackCount >= 2
  ) {
    return 'low'
  }
  if (fallbackCount > 0 || zeroMppt || usesDefaultScheduleAssumptions) {
    return 'medium'
  }

  return 'high'
}

function parseCloudTimestamp(value?: string) {
  if (!value) return undefined

  const timestamp = Date.parse(value)

  return Number.isFinite(timestamp) ? timestamp : undefined
}

function firstFiniteNumber(...values: Array<number | undefined>) {
  return values.find((value) => typeof value === 'number' && Number.isFinite(value))
}

function finitePositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min

  return Math.min(max, Math.max(min, value))
}

function dedupeWarnings(warnings: string[]) {
  return [...new Set(warnings)]
}
