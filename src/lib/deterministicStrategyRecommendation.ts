import { rx2Config } from '@/lib/race/rx2Config'
import {
  freshTelemetryWindowSeconds,
  type RacePrediction,
  type PredictionConfidence,
} from '@/lib/racePrediction'
import {
  forceSwapSocPercent,
  meaningfulSpareAdvantagePercent,
  planSwapSocPercent,
  validateRaceBatteryState,
  type RaceBatteryState,
  type SwapRecommendation,
} from '@/lib/raceBatteryStrategy'
import type { TelemetryData } from '@/types/telemetry'

export type StrategyCommand =
  | 'hold_pace'
  | 'reduce_speed'
  | 'increase_speed_allowed'
  | 'plan_swap'
  | 'swap_now'
  | 'prioritize_charging'

export type StrategySeverity = 'normal' | 'caution' | 'urgent'

export type StrategyRecommendation = {
  timestamp: number
  command: StrategyCommand
  confidence: PredictionConfidence
  severity: StrategySeverity
  title: string
  reason: string
  recommendedSpeedMph?: number
  targetWhPerMile: {
    min: number
    max: number
  }
  supportingData: {
    currentWhPerMile?: number
    predictedWhPerMile?: number
    currentSocPercent?: number
    projectedNextStopSocPercent?: number
    projectedEndDaySocPercent?: number
    activePackSocPercent?: number
    sparePackSocPercent?: number
    predictedMpptWatts?: number
    netPowerWatts?: number
    telemetryAgeSeconds?: number
  }
  warnings: string[]
}

export function buildDeterministicStrategyRecommendation({
  prediction,
  swapRecommendation,
  batteryState,
  telemetry,
  telemetryAgeSeconds,
  isTraileringActive = false,
  now = Date.now(),
}: {
  prediction: RacePrediction
  swapRecommendation: SwapRecommendation
  batteryState: RaceBatteryState
  telemetry: TelemetryData | null
  telemetryAgeSeconds?: number
  isTraileringActive?: boolean
  now?: number
}): StrategyRecommendation {
  const safeBatteryState = validateRaceBatteryState({
    state: batteryState,
    now,
  })
  const warnings = [...prediction.warnings, ...(safeBatteryState.warnings ?? [])]
  const activePack = safeBatteryState.packs[safeBatteryState.activePackId]
  const sparePack =
    safeBatteryState.packs[safeBatteryState.activePackId === 'A' ? 'B' : 'A']
  const currentSpeedMph =
    finiteNumber(telemetry?.speedMph) ?? rx2Config.defaultTargetSpeedMph
  const currentWhPerMile =
    finiteNumber(telemetry?.efficiencyWhPerMile) ??
    finiteNumber(telemetry?.whPerMile)
  const effectiveWhPerMile =
    currentWhPerMile ?? prediction.predictedWhPerMile
  const projectedNextStopSocPercent = sanitizeSocProjection({
    label: 'projected next stop SOC',
    value: prediction.projectedNextStopSocPercent,
    warnings,
  })
  const projectedEndDaySocPercent = sanitizeSocProjection({
    label: 'projected end-day SOC',
    value: prediction.projectedEndDaySocPercent,
    warnings,
  })
  const projectedEndSegmentSocPercent =
    sanitizeSocProjection({
      label: 'projected end-segment SOC',
      value: prediction.projectedEndSegmentSocPercent,
      warnings,
    })
  const activePackSocPercent = activePack.socPercent
  const sparePackSocPercent = sparePack.socPercent
  const spareAdvantage = sparePackSocPercent - activePackSocPercent
  const thermalHigh =
    (telemetry?.controllerTempC ?? 0) > 85 ||
    (telemetry?.motorTempC ?? 0) > 95
  const stoppedOrTrailering =
    isTraileringActive || (telemetry?.speedMph ?? currentSpeedMph) <= 1
  const telemetryStale =
    telemetryAgeSeconds !== undefined &&
    telemetryAgeSeconds > freshTelemetryWindowSeconds
  const mpptFallback = prediction.warnings.some((warning) =>
    warning.toLowerCase().includes('solar fallback')
  )
  const mpptAvailable = prediction.predictedMpptWatts > 0 && !mpptFallback
  const effectiveConfidence: PredictionConfidence =
    telemetryStale || prediction.confidence === 'low'
      ? 'low'
      : prediction.confidence
  const lowConfidence = effectiveConfidence === 'low'

  if (telemetryStale) {
    warnings.push('Telemetry stale. Strategy confidence reduced.')
  }
  if (prediction.predictedMpptWatts <= 0) {
    warnings.push('MPPT input is zero; strategy is using conservative solar recovery.')
  }
  if (mpptFallback) {
    warnings.push('MPPT input is unavailable; speed increase is blocked.')
  }

  const shared = {
    timestamp: now,
    confidence: effectiveConfidence,
    targetWhPerMile: {
      min: 30,
      max: 45,
    },
    supportingData: {
      currentWhPerMile,
      predictedWhPerMile: prediction.predictedWhPerMile,
      currentSocPercent: prediction.currentSocPercent,
      projectedNextStopSocPercent,
      projectedEndDaySocPercent,
      activePackSocPercent,
      sparePackSocPercent,
      predictedMpptWatts: prediction.predictedMpptWatts,
      netPowerWatts: finiteNumber(telemetry?.netPowerWatts),
      telemetryAgeSeconds,
    },
    warnings: dedupeWarnings(warnings),
  }

  if (
    swapRecommendation.action === 'swap_now' ||
    activePackSocPercent < forceSwapSocPercent ||
    below(projectedNextStopSocPercent, forceSwapSocPercent) ||
    below(projectedEndSegmentSocPercent, forceSwapSocPercent)
  ) {
    return {
      ...shared,
      command: 'swap_now',
      severity: 'urgent',
      title: 'Swap Now',
      reason:
        'Active pack is below reserve or projected to fall below reserve before the next safe stop.',
      recommendedSpeedMph: reduceSpeed(currentSpeedMph),
    }
  }

  if (
    swapRecommendation.action === 'plan_swap' ||
    ((between(activePackSocPercent, forceSwapSocPercent, planSwapSocPercent) ||
      below(projectedNextStopSocPercent, planSwapSocPercent)) &&
      spareAdvantage >= meaningfulSpareAdvantagePercent)
  ) {
    return {
      ...shared,
      command: 'plan_swap',
      severity: 'caution',
      title: 'Plan Swap',
      reason:
        'Plan a swap at the next stop. Active pack is projected near reserve.',
      recommendedSpeedMph: currentSpeedMph,
    }
  }

  if (
    (effectiveWhPerMile > 55 ||
      below(projectedEndDaySocPercent, rx2Config.reserveSocPercent) ||
      below(projectedNextStopSocPercent, planSwapSocPercent) ||
      thermalHigh)
  ) {
    return {
      ...shared,
      command: 'reduce_speed',
      severity: thermalHigh ? 'urgent' : 'caution',
      title: thermalHigh ? 'Reduce Speed: Thermal Protection' : 'Reduce Speed',
      reason: thermalHigh
        ? 'Motor temperature approaching limit. Reduce speed to protect drivetrain.'
        : 'Energy use is above target. Reduce speed to bring Wh/mi back under control.',
      recommendedSpeedMph: reduceSpeed(currentSpeedMph),
    }
  }

  if (
    stoppedOrTrailering &&
    activePackSocPercent < planSwapSocPercent &&
    mpptAvailable &&
    ((prediction.projectedSolarRecoveredStoppedWh ?? 0) > 0 ||
      (prediction.projectedSolarRecoveredTraileringWh ?? 0) > 0 ||
      (telemetry?.netPowerWatts ?? 0) > 0)
  ) {
    return {
      ...shared,
      command: 'prioritize_charging',
      severity: 'caution',
      title: 'Prioritize Charging',
      reason: 'Use available stopped time for charging before continuing.',
      recommendedSpeedMph: rx2Config.minimumRaceSpeedMph,
    }
  }

  if (lowConfidence) {
    return {
      ...shared,
      command: 'hold_pace',
      severity: 'caution',
      title: 'Hold Pace',
      reason: telemetryStale
        ? 'Telemetry stale. Strategy confidence reduced. Hold pace or reduce speed until telemetry is fresh.'
        : 'Prediction confidence is low. Maintaining conservative strategy. Hold pace or reduce speed until telemetry is fresh.',
      recommendedSpeedMph: currentSpeedMph,
    }
  }

  if (
    effectiveWhPerMile < 35 &&
    above(projectedEndDaySocPercent, rx2Config.reserveSocPercent + 20) &&
    activePackSocPercent > 50 &&
    sparePackSocPercent >= planSwapSocPercent &&
    mpptAvailable &&
    prediction.predictedMpptWatts >= rx2Config.expectedSolarStationWatts * 0.75 &&
    !thermalHigh
  ) {
    return {
      ...shared,
      command: 'increase_speed_allowed',
      severity: 'normal',
      title: 'Increase Speed Allowed',
      reason: 'Energy margin is strong. A small speed increase is allowed.',
      recommendedSpeedMph: increaseSpeed(currentSpeedMph),
    }
  }

  return {
    ...shared,
    command: 'hold_pace',
    severity: 'normal',
    title: 'Hold Pace',
    reason: 'Current pace is within RX2 target efficiency range.',
    recommendedSpeedMph: currentSpeedMph,
  }
}

function reduceSpeed(currentSpeedMph: number) {
  return Math.max(
    rx2Config.minimumRaceSpeedMph,
    Math.round(currentSpeedMph - 3)
  )
}

function increaseSpeed(currentSpeedMph: number) {
  return Math.min(
    rx2Config.maxRecommendedSpeedMph,
    Math.round(currentSpeedMph + 2)
  )
}

function below(value: number | undefined, threshold: number) {
  return value !== undefined && Number.isFinite(value) && value < threshold
}

function above(value: number | undefined, threshold: number) {
  return value !== undefined && Number.isFinite(value) && value > threshold
}

function between(value: number, minInclusive: number, maxExclusive: number) {
  return value >= minInclusive && value < maxExclusive
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

function sanitizeSocProjection({
  label,
  value,
  warnings,
}: {
  label: string
  value: number | undefined
  warnings: string[]
}) {
  if (value === undefined) return undefined

  if (!Number.isFinite(value) || value < 0 || value > 100) {
    warnings.push(`${label} was outside 0-100% and was clamped.`)
  }

  return clamp(value, 0, 100)
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min

  return Math.min(max, Math.max(min, value))
}

function dedupeWarnings(warnings: string[]) {
  return [...new Set(warnings)]
}
