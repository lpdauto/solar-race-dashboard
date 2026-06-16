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
import type { TraileringOption } from '@/lib/routeIntelligence'
import type { TelemetryData } from '@/types/telemetry'

export type StrategyCommand =
  | 'hold_pace'
  | 'reduce_speed'
  | 'increase_speed_allowed'
  | 'plan_swap'
  | 'swap_now'
  | 'prioritize_charging'
  | 'trailer_now'
  | 'consider_trailering'

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
  diagnostics?: {
    triggerRule: string
    thresholdDetail: string
    confidenceFactors: string[]
    criticalReason?: string
    traileringCommandTrigger?: string
    finalCommandPriority: number
  }
  warnings: string[]
}

export function buildDeterministicStrategyRecommendation({
  prediction,
  swapRecommendation,
  batteryState,
  telemetry,
  telemetryAgeSeconds,
  traileringRecommendation,
  isTraileringActive = false,
  now = Date.now(),
}: {
  prediction: RacePrediction
  swapRecommendation: SwapRecommendation
  batteryState: RaceBatteryState
  telemetry: TelemetryData | null
  telemetryAgeSeconds?: number
  traileringRecommendation?: TraileringOption
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
  const spareMeaningfullyHigher =
    spareAdvantage >= meaningfulSpareAdvantagePercent
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
  const confidenceFactors = [
    prediction.confidence === 'low' ? 'prediction confidence low' : '',
    telemetryStale ? 'telemetry stale' : '',
    mpptFallback ? 'MPPT fallback' : '',
    prediction.predictedMpptWatts <= 0 ? 'MPPT zero' : '',
    prediction.batteryProjectionSource !== 'telemetry_energy'
      ? `battery source: ${prediction.batteryProjectionSource}`
      : '',
  ].filter(Boolean)
  const traileringAction = traileringRecommendation?.action
  const traileringRequired = traileringAction === 'TRAILER_REQUIRED'
  const traileringRecommended = traileringAction === 'TRAILER_RECOMMENDED'

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

  const diagnostics = ({
    triggerRule,
    thresholdDetail,
    finalCommandPriority,
    criticalReason,
    traileringCommandTrigger,
  }: {
    triggerRule: string
    thresholdDetail: string
    finalCommandPriority: number
    criticalReason?: string
    traileringCommandTrigger?: string
  }) => ({
    triggerRule,
    thresholdDetail,
    confidenceFactors,
    criticalReason,
    traileringCommandTrigger,
    finalCommandPriority,
  })

  const criticalEnergyProjection =
    swapRecommendation.action === 'swap_now' ||
    activePackSocPercent < forceSwapSocPercent ||
    below(projectedNextStopSocPercent, forceSwapSocPercent) ||
    below(projectedEndSegmentSocPercent, forceSwapSocPercent)
  const trueCriticalEnergyProjection =
    swapRecommendation.action === 'swap_now' ||
    below(projectedNextStopSocPercent, rx2Config.absoluteMinimumSocPercent) ||
    below(projectedEndSegmentSocPercent, rx2Config.absoluteMinimumSocPercent)
  const criticalReason = criticalProjectionReason({
    projectedNextStopSocPercent,
    projectedEndSegmentSocPercent,
    activePackSocPercent,
  })

  if (trueCriticalEnergyProjection && !spareMeaningfullyHigher) {
    return {
      ...shared,
      command: 'reduce_speed',
      severity: 'urgent',
      title: 'Protect Reserve',
      reason:
        criticalReason +
        ' Spare pack is not meaningfully higher than active pack; reduce speed and reassess at the next stop instead of swapping.',
      recommendedSpeedMph: reduceSpeed(currentSpeedMph),
      diagnostics: diagnostics({
        triggerRule: 'trueCriticalEnergyProjection && !spareMeaningfullyHigher',
        thresholdDetail: `absolute minimum ${rx2Config.absoluteMinimumSocPercent}% or swap_now`,
        finalCommandPriority: 1,
        criticalReason,
      }),
    }
  }

  if (criticalEnergyProjection && spareMeaningfullyHigher) {
    return {
      ...shared,
      command: 'swap_now',
      severity: 'urgent',
      title: 'Swap Now',
      reason:
        criticalReason +
        ' Spare pack is meaningfully higher than active pack; swap now.',
      recommendedSpeedMph: reduceSpeed(currentSpeedMph),
      diagnostics: diagnostics({
        triggerRule: 'criticalEnergyProjection && spareMeaningfullyHigher',
        thresholdDetail: `force swap ${forceSwapSocPercent}% / absolute minimum ${rx2Config.absoluteMinimumSocPercent}%`,
        finalCommandPriority: 1,
        criticalReason,
      }),
    }
  }

  if (traileringRequired) {
    return {
      ...shared,
      command: 'trailer_now',
      severity: 'urgent',
      title: 'Trailer Now',
      reason:
        'Route intelligence recommends trailering this segment due to energy/risk tradeoff. ' +
        (traileringRecommendation?.reason ?? ''),
      recommendedSpeedMph: rx2Config.minimumRaceSpeedMph,
      diagnostics: diagnostics({
        triggerRule: 'traileringRecommendation.action === TRAILER_REQUIRED',
        thresholdDetail: 'route intelligence classified trailering as required',
        finalCommandPriority: 2,
        traileringCommandTrigger: traileringAction,
      }),
    }
  }

  if (criticalEnergyProjection && !spareMeaningfullyHigher) {
    return {
      ...shared,
      command: 'reduce_speed',
      severity: 'urgent',
      title: 'Protect Reserve',
      reason:
        criticalReason +
        ' Spare pack is not meaningfully higher than active pack; reduce speed and reassess at the next stop instead of swapping.',
      recommendedSpeedMph: reduceSpeed(currentSpeedMph),
      diagnostics: diagnostics({
        triggerRule: 'criticalEnergyProjection && !spareMeaningfullyHigher',
        thresholdDetail: `force swap ${forceSwapSocPercent}%`,
        finalCommandPriority: 3,
        criticalReason,
      }),
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
      diagnostics: diagnostics({
        triggerRule: 'swapRecommendation.action === plan_swap || planning SOC band',
        thresholdDetail: `active/next-stop SOC below ${planSwapSocPercent}% with spare advantage >= ${meaningfulSpareAdvantagePercent}%`,
        finalCommandPriority: 4,
      }),
    }
  }

  if (traileringRecommended) {
    return {
      ...shared,
      command: 'consider_trailering',
      severity: 'caution',
      title: 'Consider Trailering',
      reason:
        'Route intelligence recommends trailering this segment due to energy/risk tradeoff. ' +
        (traileringRecommendation?.reason ?? ''),
      recommendedSpeedMph: currentSpeedMph,
      diagnostics: diagnostics({
        triggerRule: 'traileringRecommendation.action === TRAILER_RECOMMENDED',
        thresholdDetail: 'route intelligence classified trailering as recommended',
        finalCommandPriority: 5,
        traileringCommandTrigger: traileringAction,
      }),
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
      diagnostics: diagnostics({
        triggerRule: 'efficiency/projection/thermal reduce-speed rule',
        thresholdDetail: `Wh/mi > 55 or next stop < ${planSwapSocPercent}% or end day < reserve`,
        finalCommandPriority: 3,
      }),
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
      diagnostics: diagnostics({
        triggerRule: 'stoppedOrTrailering && low active SOC && MPPT available',
        thresholdDetail: `active SOC < ${planSwapSocPercent}% and stopped/trailering solar available`,
        finalCommandPriority: 6,
      }),
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
      diagnostics: diagnostics({
        triggerRule: 'lowConfidence',
        thresholdDetail: 'prediction confidence low or telemetry stale',
        finalCommandPriority: 7,
      }),
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
      diagnostics: diagnostics({
        triggerRule: 'increase-speed energy margin gate',
        thresholdDetail: `Wh/mi < 35, end-day SOC > reserve + 20%, active > 50%, spare >= ${planSwapSocPercent}%`,
        finalCommandPriority: 8,
      }),
    }
  }

  return {
    ...shared,
    command: 'hold_pace',
    severity: 'normal',
    title: 'Hold Pace',
    reason: 'Current pace is within RX2 target efficiency range.',
    recommendedSpeedMph: currentSpeedMph,
    diagnostics: diagnostics({
      triggerRule: 'default hold pace',
      thresholdDetail: 'no higher-priority deterministic strategy rule matched',
      finalCommandPriority: 9,
    }),
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

function criticalProjectionReason({
  projectedNextStopSocPercent,
  projectedEndSegmentSocPercent,
  activePackSocPercent,
}: {
  projectedNextStopSocPercent?: number
  projectedEndSegmentSocPercent?: number
  activePackSocPercent: number
}) {
  if (activePackSocPercent < forceSwapSocPercent) {
    return 'Active pack SOC is below force-swap reserve threshold.'
  }

  if (below(projectedNextStopSocPercent, forceSwapSocPercent)) {
    return 'Projected next-stop SOC is below reserve threshold.'
  }

  if (below(projectedEndSegmentSocPercent, forceSwapSocPercent)) {
    return 'Projected end-segment SOC is below reserve threshold.'
  }

  return 'Critical energy projection threshold was crossed.'
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
