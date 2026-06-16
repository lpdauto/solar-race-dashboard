import type { RaceDay, RouteSegment } from '@/data/raceRoute'
import type { TelemetryHistorySample } from '@/hooks/useTelemetry'
import { rx2Config } from '@/lib/race/rx2Config'
import type { RaceBatteryState } from '@/lib/raceBatteryStrategy'
import {
  estimateElevationEnergyWh,
  getRaceDayElevationWindow,
  type RaceDayElevationWindow,
} from '@/lib/elevationEnergy'
import {
  buildRaceSchedule,
  forecastRaceScheduleEnergy,
  type RaceScheduleEvent,
  type RaceScheduleEventType,
  type RaceScheduleForecastMode,
} from '@/lib/raceSchedule'
import { calculateScoringMilesRemaining } from '@/lib/routeMileage'
import { getRawTelemetryWhPerMile } from '@/lib/safeWhPerMile'
import type { TelemetryData } from '@/types/telemetry'

export type PredictionConfidence = 'high' | 'medium' | 'low'

export type BatteryProjectionSource =
  | 'telemetry_energy'
  | 'telemetry_soc'
  | 'race_battery_state'
  | 'unavailable_fallback'

export type RacePrediction = {
  timestamp: number
  confidence: PredictionConfidence
  warnings: string[]
  predictedWhPerMile: number
  predictedWhPerMileBeforeTerrain?: number
  terrainAdjustedWhPerMile?: number
  predictedMpptWatts: number
  currentBatteryEnergyWh: number
  currentSocPercent: number
  projectedEndSegmentSocPercent?: number
  projectedNextStopSocPercent?: number
  projectedAfterNextStopSocPercent?: number
  projectedEndDaySocPercent?: number
  projectedEndSegmentSocPercentBeforeTerrain?: number
  projectedNextStopSocPercentBeforeTerrain?: number
  projectedEndDaySocPercentBeforeTerrain?: number
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
  projectedEndDayEnergyWh?: number
  batteryProjectionSource: BatteryProjectionSource
  telemetryNullFallbackSource?: 'raceBatteryState.activePack' | 'unavailable'
  raceBatteryStateProjectionFallbackUsed: boolean
  energyMarginSource: 'projectedEndDayEnergyWh'
  energyMarginFormula: string
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
  terrainWindowStartMile?: number
  terrainWindowEndMile?: number
  terrainAppliedWindowStartMile?: number
  terrainAppliedWindowEndMile?: number
  climbEnergyWh?: number
  descentRecoveryWh?: number
  netTerrainWh?: number
  terrainEnergyWh?: number
  terrainAdjustmentDistanceMiles?: number
  terrainAdjustmentApplied?: boolean
  terrainAdjustmentWeight?: number
  terrainAdjustmentSource?: ValueSource | 'disabled' | 'unavailable'
  terrainAdjustmentReason?: string
  terrainDataWarnings?: string[]
}

type ValueSource = 'live' | 'rolling' | 'fallback'
type TerrainAdjustmentMode = 'enabled' | 'disabled'

type TerrainCorrection = {
  windowStartMile: number
  windowEndMile: number
  appliedWindowStartMile: number
  appliedWindowEndMile: number
  climbEnergyWh: number
  descentRecoveryWh: number
  netTerrainWh: number
  terrainEnergyWh: number
  adjustmentWeight: number
  source: ValueSource | 'disabled' | 'unavailable'
  reason: string
  warnings: string[]
  dataAvailable: boolean
  applied: boolean
}

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
  raceBatteryState,
  scheduleEvents,
  forecastMode = 'normal',
  terrainAdjustmentMode = 'enabled',
  now = Date.now(),
}: {
  telemetry: TelemetryData | null
  telemetryHistory: TelemetryHistorySample[]
  raceDay: RaceDay
  currentSegment?: RouteSegment | null
  currentMile: number
  telemetryTimestampMs?: number
  raceBatteryState?: RaceBatteryState | null
  scheduleEvents?: RaceScheduleEvent[]
  forecastMode?: RaceScheduleForecastMode
  terrainAdjustmentMode?: TerrainAdjustmentMode
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
    raceBatteryState,
    batteryCapacityWh: rx2Config.mainBatteryUsableWh,
  })
  const routeKnown = Boolean(raceDay && currentSegment)
  const remainingDayMiles = Math.max(0, raceDay.distanceMiles - currentMile)
  const remainingDrivingMiles = calculateScoringMilesRemaining({
    raceDay,
    currentMile,
  })
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
  const endSegmentTerrain = terrainCorrectionForWindow({
    mode: terrainAdjustmentMode,
    raceDay,
    currentMile,
    endMile:
      remainingSegmentMiles !== undefined
        ? currentMile + remainingSegmentMiles
        : currentMile,
    source: wh.source,
    rollingHorizonMiles: wh.rollingHorizonMiles,
  })
  const nextStopTerrain = terrainCorrectionForWindow({
    mode: terrainAdjustmentMode,
    raceDay,
    currentMile,
    endMile:
      nextStopMiles !== undefined
        ? currentMile + nextStopMiles
        : currentMile,
    source: wh.source,
    rollingHorizonMiles: wh.rollingHorizonMiles,
  })
  const endDayTerrain = terrainCorrectionForWindow({
    mode: terrainAdjustmentMode,
    raceDay,
    currentMile,
    endMile: raceDay.distanceMiles,
    source: wh.source,
    rollingHorizonMiles: wh.rollingHorizonMiles,
  })
  const terrainAdjustedWhPerMile = terrainAdjustedWhPerMileForWindow({
    baseWhPerMile: wh.value,
    miles: remainingDrivingMiles,
    terrainEnergyWh: endDayTerrain.terrainEnergyWh,
  })
  const scheduleForecast = forecastRaceScheduleEnergy({
    events: raceScheduleEvents,
    currentMile,
    currentBatteryEnergyWh: battery.value,
    predictedWhPerMile: terrainAdjustedWhPerMile,
    predictedMpptWatts: mppt.value,
    driveSpeedMph: speedForPredictionMph,
    batteryCapacityWh: rx2Config.mainBatteryUsableWh,
    defaultTrailerSpeedMph: rx2Config.defaultTrailerSpeedMph,
    forecastMode,
  })
  const scheduleForecastBeforeTerrain = terrainAdjustmentMode === 'enabled'
    ? forecastRaceScheduleEnergy({
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
    : scheduleForecast

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
  if (battery.source === 'telemetry_soc') {
    warnings.push('Battery energy is estimated from SOC.')
  } else if (battery.source === 'race_battery_state') {
    warnings.push(
      'Battery telemetry is unavailable; using race battery state active pack for projection.'
    )
  } else if (battery.source === 'unavailable_fallback') {
    warnings.push(
      'Battery energy is unavailable; using an uncertainty fallback for projection.'
    )
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
  if (terrainAdjustmentMode === 'enabled' && !endDayTerrain.dataAvailable) {
    warnings.push(
      'Elevation data is unavailable for this projection window; terrain correction is disabled.'
    )
  }
  if (terrainAdjustmentMode === 'enabled') {
    for (const warning of endDayTerrain.warnings) {
      warnings.push(`Terrain data: ${warning}`)
    }
  }

  const endSegment =
    remainingSegmentMiles !== undefined
      ? projectEnergy({
          currentBatteryEnergyWh: battery.value,
          miles: remainingSegmentMiles,
          predictedWhPerMile: wh.value,
          terrainAdjustmentWh: endSegmentTerrain.terrainEnergyWh,
          predictedMpptWatts: mppt.value,
          speedMph: speedForPredictionMph,
          batteryCapacityWh: rx2Config.mainBatteryUsableWh,
        })
      : null
  const endSegmentBeforeTerrain =
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
          terrainAdjustmentWh: nextStopTerrain.terrainEnergyWh,
          predictedMpptWatts: mppt.value,
          speedMph: speedForPredictionMph,
          batteryCapacityWh: rx2Config.mainBatteryUsableWh,
        })
      : null
  const nextStopBeforeTerrain =
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
    terrainAdjustmentWh: endDayTerrain.terrainEnergyWh,
    predictedMpptWatts: mppt.value,
    speedMph: speedForPredictionMph,
    batteryCapacityWh: rx2Config.mainBatteryUsableWh,
  })
  const endDayBeforeTerrain = projectEnergy({
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
  const projectedEndDaySocPercentBeforeTerrain =
    scheduleForecastBeforeTerrain.scheduleKnown
      ? scheduleForecastBeforeTerrain.projectedEndDaySocPercent
      : endDayBeforeTerrain.socPercent
  const projectedEndDayEnergyWh =
    (projectedEndDaySocPercent / 100) * rx2Config.mainBatteryUsableWh
  const energyMarginWh = projectedEndDayEnergyWh - reserveEnergyWh

  return {
    timestamp: now,
    confidence: confidenceLevel({
      staleTelemetry,
      routeKnown,
      missingBatteryEnergy: battery.source !== 'telemetry_energy',
      fallbackCount: [wh.source, mppt.source].filter(
        (source) => source === 'fallback'
      ).length,
      zeroMppt: mppt.value <= 0,
      scheduleKnown: scheduleForecast.scheduleKnown,
      usesDefaultScheduleAssumptions:
        scheduleForecast.usesDefaultDurations ||
        scheduleForecast.usesEstimatedDurations,
      terrainDataUnavailable:
        terrainAdjustmentMode === 'enabled' && !endDayTerrain.dataAvailable,
    }),
    warnings: dedupeWarnings(warnings),
    predictedWhPerMile: terrainAdjustedWhPerMile,
    predictedWhPerMileBeforeTerrain: wh.value,
    terrainAdjustedWhPerMile,
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
    projectedEndSegmentSocPercentBeforeTerrain:
      endSegmentBeforeTerrain?.socPercent,
    projectedNextStopSocPercentBeforeTerrain:
      scheduleForecastBeforeTerrain.projectedNextScheduleEventSocPercent ??
      nextStopBeforeTerrain?.socPercent,
    projectedEndDaySocPercentBeforeTerrain,
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
    projectedEndDayEnergyWh,
    batteryProjectionSource: battery.source,
    telemetryNullFallbackSource: !telemetry
      ? battery.source === 'race_battery_state'
        ? 'raceBatteryState.activePack'
        : 'unavailable'
      : undefined,
    raceBatteryStateProjectionFallbackUsed:
      battery.source === 'race_battery_state',
    energyMarginSource: 'projectedEndDayEnergyWh',
    energyMarginFormula:
      'projectedEndDaySocPercent / 100 * batteryCapacityWh - reserveEnergyWh',
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
    terrainWindowStartMile: endDayTerrain.windowStartMile,
    terrainWindowEndMile: endDayTerrain.windowEndMile,
    terrainAppliedWindowStartMile: endDayTerrain.appliedWindowStartMile,
    terrainAppliedWindowEndMile: endDayTerrain.appliedWindowEndMile,
    climbEnergyWh: endDayTerrain.climbEnergyWh,
    descentRecoveryWh: endDayTerrain.descentRecoveryWh,
    netTerrainWh: endDayTerrain.netTerrainWh,
    terrainEnergyWh: endDayTerrain.terrainEnergyWh,
    terrainAdjustmentDistanceMiles: remainingDrivingMiles,
    terrainAdjustmentApplied: endDayTerrain.applied,
    terrainAdjustmentWeight: endDayTerrain.adjustmentWeight,
    terrainAdjustmentSource: endDayTerrain.source,
    terrainAdjustmentReason: endDayTerrain.reason,
    terrainDataWarnings: endDayTerrain.warnings,
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
  const rawValue = rollingWh?.value ?? liveWh
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
    rollingHorizonMiles: rollingWh?.horizonMiles,
  }
}

function terrainCorrectionForWindow({
  mode,
  raceDay,
  currentMile,
  endMile,
  source,
  rollingHorizonMiles,
}: {
  mode: TerrainAdjustmentMode
  raceDay: RaceDay
  currentMile: number
  endMile: number
  source: ValueSource
  rollingHorizonMiles?: number
}): TerrainCorrection {
  const windowStartMile = clamp(
    Math.min(currentMile, endMile),
    0,
    raceDay.distanceMiles
  )
  const windowEndMile = clamp(
    Math.max(currentMile, endMile),
    0,
    raceDay.distanceMiles
  )

  if (mode === 'disabled' || windowEndMile <= windowStartMile) {
    return emptyTerrainCorrection({
      windowStartMile,
      windowEndMile,
      source: mode === 'disabled' ? 'disabled' : source,
      reason:
        mode === 'disabled'
          ? 'Terrain adjustment disabled for baseline projection.'
          : 'Terrain window has no remaining distance.',
    })
  }

  const rollingCoveredMiles =
    source === 'rolling' ? Math.max(0, rollingHorizonMiles ?? 0) : 0
  const appliedWindowStartMile = clamp(
    windowStartMile + rollingCoveredMiles,
    windowStartMile,
    windowEndMile
  )
  const appliedWindowEndMile = windowEndMile
  const window = getRaceDayElevationWindow({
    day: raceDay.day,
    startMile: appliedWindowStartMile,
    endMile: appliedWindowEndMile,
  })
  const dataAvailable = terrainWindowHasData(window)

  if (!dataAvailable) {
    return emptyTerrainCorrection({
      windowStartMile,
      windowEndMile,
      appliedWindowStartMile,
      appliedWindowEndMile,
      source: 'unavailable',
      reason: 'Elevation data unavailable; projection used the non-terrain baseline.',
      warnings: window.dataQualityWarnings,
      dataAvailable: false,
    })
  }

  const estimate = estimateElevationEnergyWh({
    elevationGainFt: window.elevationGainFt,
    elevationLossFt: window.elevationLossFt,
    vehicleWeightLbs: rx2Config.estimatedRaceWeightLbs,
    distanceMiles: window.distanceMiles,
  })
  const adjustmentWeight = terrainAdjustmentWeight(source)
  const terrainEnergyWh = roundWh(estimate.netElevationEnergyWh * adjustmentWeight)

  return {
    windowStartMile,
    windowEndMile,
    appliedWindowStartMile,
    appliedWindowEndMile,
    climbEnergyWh: estimate.climbEnergyWh,
    descentRecoveryWh: estimate.descentRecoveryWh,
    netTerrainWh: estimate.netElevationEnergyWh,
    terrainEnergyWh,
    adjustmentWeight,
    source,
    reason: terrainAdjustmentReason({
      source,
      rollingCoveredMiles,
      adjustmentWeight,
    }),
    warnings: window.dataQualityWarnings,
    dataAvailable,
    applied: terrainEnergyWh !== 0,
  }
}

function terrainAdjustedWhPerMileForWindow({
  baseWhPerMile,
  miles,
  terrainEnergyWh,
}: {
  baseWhPerMile: number
  miles: number
  terrainEnergyWh: number
}) {
  if (miles <= 0) return baseWhPerMile

  return clamp(
    baseWhPerMile + terrainEnergyWh / miles,
    minPredictionWhPerMile,
    maxPredictionWhPerMile
  )
}

function terrainAdjustmentWeight(source: ValueSource) {
  if (source === 'rolling') return 0.35
  if (source === 'live') return 0.6
  return 1
}

function terrainAdjustmentReason({
  source,
  rollingCoveredMiles,
  adjustmentWeight,
}: {
  source: ValueSource
  rollingCoveredMiles: number
  adjustmentWeight: number
}) {
  if (source === 'rolling') {
    return `Rolling Wh/mi is primary; terrain correction starts ${rollingCoveredMiles.toFixed(1)} mi ahead of the rolling horizon and is weighted at ${(adjustmentWeight * 100).toFixed(0)}%.`
  }

  if (source === 'live') {
    return `Live Wh/mi is primary; upcoming terrain is advisory and weighted at ${(adjustmentWeight * 100).toFixed(0)}%.`
  }

  return 'No rolling telemetry is available; terrain correction is fully applied to the configured Wh/mi baseline.'
}

function terrainWindowHasData(window: RaceDayElevationWindow) {
  return !window.dataQualityWarnings.some((warning) =>
    warning.toLowerCase().includes('no elevation')
  )
}

function emptyTerrainCorrection({
  windowStartMile,
  windowEndMile,
  appliedWindowStartMile = windowStartMile,
  appliedWindowEndMile = windowEndMile,
  source,
  reason,
  warnings = [],
  dataAvailable = true,
}: {
  windowStartMile: number
  windowEndMile: number
  appliedWindowStartMile?: number
  appliedWindowEndMile?: number
  source: TerrainCorrection['source']
  reason: string
  warnings?: string[]
  dataAvailable?: boolean
}): TerrainCorrection {
  return {
    windowStartMile,
    windowEndMile,
    appliedWindowStartMile,
    appliedWindowEndMile,
    climbEnergyWh: 0,
    descentRecoveryWh: 0,
    netTerrainWh: 0,
    terrainEnergyWh: 0,
    adjustmentWeight: 0,
    source,
    reason,
    warnings,
    dataAvailable,
    applied: false,
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
  raceBatteryState,
  batteryCapacityWh,
}: {
  telemetry: TelemetryData | null
  raceBatteryState?: RaceBatteryState | null
  batteryCapacityWh: number
}) {
  const telemetryEnergy = finitePositiveNumber(telemetry?.batteryEnergyWh)
  const telemetrySocPercent = finiteNumber(telemetry?.batterySocPercent)
  const activePack =
    raceBatteryState?.packs?.[raceBatteryState.activePackId]
  const activePackEnergyWh = finiteNumber(activePack?.energyWh)
  const activePackSocPercent = finiteNumber(activePack?.socPercent)
  const fallbackSocPercent = 100
  const source: BatteryProjectionSource =
    telemetryEnergy !== undefined
      ? 'telemetry_energy'
      : telemetrySocPercent !== undefined
        ? 'telemetry_soc'
        : activePackEnergyWh !== undefined ||
            activePackSocPercent !== undefined
          ? 'race_battery_state'
          : 'unavailable_fallback'
  const socPercent = clamp(
    telemetrySocPercent ??
      activePackSocPercent ??
      fallbackSocPercent,
    0,
    100
  )
  const value =
    telemetryEnergy ??
    activePackEnergyWh ??
    clamp((socPercent / 100) * batteryCapacityWh, 0, batteryCapacityWh)
  const clampedValue = clamp(value, 0, batteryCapacityWh)

  return {
    value: clampedValue,
    socPercent:
      batteryCapacityWh > 0
        ? clamp((clampedValue / batteryCapacityWh) * 100, 0, 100)
        : socPercent,
    source,
  }
}

function projectEnergy({
  currentBatteryEnergyWh,
  miles,
  predictedWhPerMile,
  terrainAdjustmentWh = 0,
  predictedMpptWatts,
  speedMph,
  batteryCapacityWh,
}: {
  currentBatteryEnergyWh: number
  miles: number
  predictedWhPerMile: number
  terrainAdjustmentWh?: number
  predictedMpptWatts: number
  speedMph: number
  batteryCapacityWh: number
}) {
  const driveEnergyWh = Math.max(
    0,
    Math.max(0, miles) * predictedWhPerMile + terrainAdjustmentWh
  )
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

  return {
    value: energyWh / distanceMiles,
    horizonMiles: distanceMiles,
  }
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
  terrainDataUnavailable,
}: {
  staleTelemetry: boolean
  routeKnown: boolean
  missingBatteryEnergy: boolean
  fallbackCount: number
  zeroMppt: boolean
  scheduleKnown: boolean
  usesDefaultScheduleAssumptions: boolean
  terrainDataUnavailable: boolean
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
  if (
    fallbackCount > 0 ||
    zeroMppt ||
    usesDefaultScheduleAssumptions ||
    terrainDataUnavailable
  ) {
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

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
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

function roundWh(value: number) {
  return Number(value.toFixed(1))
}

function dedupeWarnings(warnings: string[]) {
  return [...new Set(warnings)]
}
