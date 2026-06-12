import type { RaceDay, RouteSegment } from '@/data/raceRoute'
import type { TelemetryHistorySample } from '@/hooks/useTelemetry'
import {
  buildDeterministicStrategyRecommendation,
  type StrategyRecommendation,
} from '@/lib/deterministicStrategyRecommendation'
import { rx2Config } from '@/lib/race/rx2Config'
import {
  buildRacePrediction,
  type PredictionConfidence,
  type RacePrediction,
} from '@/lib/racePrediction'
import type { RaceScheduleForecastMode } from '@/lib/raceSchedule'
import {
  planBatterySwap,
  validateRaceBatteryState,
  type RaceBatteryState,
  type SwapRecommendation,
} from '@/lib/raceBatteryStrategy'
import {
  analyzeRouteIntelligence,
  type RouteIntelligenceSummary,
  type RouteRisk,
  type TraileringOption,
} from '@/lib/routeIntelligence'
import type {
  TelemetryConnectionStatus,
  TelemetryData,
  TelemetrySource,
} from '@/types/telemetry'

export type MissionStatus =
  | 'ON_TARGET'
  | 'CONSERVE'
  | 'DATA_UNCERTAIN'
  | 'SWAP_RECOMMENDED'
  | 'CRITICAL_ENERGY'
  | 'TRAILERING_RECOMMENDED'
  | 'FINISH_PUSH'

export type RaceHealthLabel =
  | 'Excellent'
  | 'Good'
  | 'Caution'
  | 'Recovery'
  | 'Critical'

export type RaceHealthBreakdown = {
  baseScore: number
  healthBasis: string
  primaryHealthSocPercent: number
  secondaryForecastSocPercent: number
  socMarginPercent: number
  socMarginBonus: number
  swapPenalty: number
  traileringPenalty: number
  nextOpportunityPenalty: number
  fullDayEnergyCautionPenalty: number
  routeRiskPenalty: number
  telemetryPenalty: number
  confidencePenalty: number
  warningPenalty: number
  strategyPenalty: number
  sparePackPenalty: number
  highestRouteSeverity: RouteRisk['severity']
  isFinalDay: boolean
  activeReserveSocPercent: number
  finalDayTargetReserveSocPercent: number
  absoluteMinimumSocPercent: number
  endgameModeActive: boolean
  finalScore: number
}

export type RaceHealthSummary = {
  score: number
  label: RaceHealthLabel
  breakdown: RaceHealthBreakdown
}

export type AuthoritativeStrategyState = {
  timestamp: number
  prediction: RacePrediction
  swapRecommendation: SwapRecommendation
  strategyRecommendation: StrategyRecommendation
  missionStatus: MissionStatus
  raceHealth: RaceHealthSummary
  routeIntelligence: RouteIntelligenceSummary
  traileringRecommendation?: TraileringOption
  alerts: string[]
  warnings: string[]
  recommendedSpeedMph?: number
  projectedNextStopSocPercent?: number
  projectedEndDaySocPercent?: number
  predictionConfidence: PredictionConfidence
}

export function buildAuthoritativeStrategyState({
  raceDay,
  currentMile,
  currentSegment,
  telemetry,
  telemetryHistory,
  telemetryTimestampMs,
  telemetryAgeSeconds,
  telemetrySource,
  telemetryStatus,
  connectionStatus,
  raceBatteryState,
  isTraileringActive = false,
  forecastMode = 'normal',
  now = Date.now(),
}: {
  raceDay: RaceDay
  currentMile: number
  currentSegment?: RouteSegment | null
  telemetry: TelemetryData | null
  telemetryHistory: TelemetryHistorySample[]
  telemetryTimestampMs?: number
  telemetryAgeSeconds?: number
  telemetrySource: TelemetrySource
  telemetryStatus: TelemetryConnectionStatus
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  raceBatteryState: RaceBatteryState
  isTraileringActive?: boolean
  forecastMode?: RaceScheduleForecastMode
  now?: number
}): AuthoritativeStrategyState {
  const batteryState = validateRaceBatteryState({
    state: raceBatteryState,
    now,
  })
  const activePack = batteryState.packs[batteryState.activePackId]
  const prediction = buildRacePrediction({
    telemetry,
    telemetryHistory,
    raceDay,
    currentSegment,
    currentMile,
    telemetryTimestampMs,
    forecastMode,
    now,
  })
  const swapRecommendation = planBatterySwap({
    batteryState,
    prediction,
  })
  const sparePack =
    batteryState.packs[batteryState.activePackId === 'A' ? 'B' : 'A']
  const routeSocPercent =
    swapRecommendation.action === 'swap_now' &&
    sparePack.socPercent > activePack.socPercent
      ? sparePack.socPercent
      : activePack.socPercent
  const routeIntelligence = analyzeRouteIntelligence({
    raceDay,
    currentMile,
    currentSocPercent: routeSocPercent,
    baselineWhPerMile: prediction.predictedWhPerMile,
    reserveSocPercent: rx2Config.reserveSocPercent,
    absoluteMinimumSocPercent: rx2Config.absoluteMinimumSocPercent,
    isFinalDay: isFinalRaceDay(raceDay),
    isTraileringActive,
  })
  const traileringRecommendation = routeIntelligence.traileringOption
  const strategyRecommendation = buildDeterministicStrategyRecommendation({
    prediction,
    swapRecommendation,
    batteryState,
    telemetry,
    telemetryAgeSeconds,
    isTraileringActive:
      isTraileringActive ||
      traileringRecommendation.action === 'TRAILER_REQUIRED' ||
      traileringRecommendation.action === 'TRAILER_RECOMMENDED',
    now,
  })
  const warnings = dedupe([
    ...prediction.warnings,
    ...(batteryState.warnings ?? []),
    ...strategyRecommendation.warnings,
  ])
  const missionStatus = classifyMissionStatusFromCurrentChain({
    raceDay,
    prediction,
    swapRecommendation,
    strategyRecommendation,
    traileringRecommendation,
  })
  const raceHealth = calculateRaceHealthFromCurrentChain({
    raceDay,
    prediction,
    swapRecommendation,
    strategyRecommendation,
    batteryState,
    traileringRecommendation,
    telemetrySource,
    telemetryStatus,
    connectionStatus,
    warnings,
  })
  const alerts = buildAlerts({
    missionStatus,
    raceHealth,
    prediction,
    swapRecommendation,
    strategyRecommendation,
    traileringRecommendation,
  })

  return {
    timestamp: now,
    prediction,
    swapRecommendation,
    strategyRecommendation,
    missionStatus,
    raceHealth,
    routeIntelligence,
    traileringRecommendation,
    alerts,
    warnings,
    recommendedSpeedMph: strategyRecommendation.recommendedSpeedMph,
    projectedNextStopSocPercent: prediction.projectedNextStopSocPercent,
    projectedEndDaySocPercent: prediction.projectedEndDaySocPercent,
    predictionConfidence: prediction.confidence,
  }
}

export function classifyMissionStatusFromCurrentChain({
  raceDay,
  prediction,
  swapRecommendation,
  strategyRecommendation,
  traileringRecommendation,
}: {
  raceDay: RaceDay
  prediction: RacePrediction
  swapRecommendation: SwapRecommendation
  strategyRecommendation: StrategyRecommendation
  traileringRecommendation?: TraileringOption
}): MissionStatus {
  if (
    strategyRecommendation.command === 'swap_now' ||
    swapRecommendation.action === 'swap_now' ||
    below(prediction.projectedNextStopSocPercent, rx2Config.absoluteMinimumSocPercent) ||
    below(prediction.projectedEndSegmentSocPercent, rx2Config.absoluteMinimumSocPercent)
  ) {
    return 'CRITICAL_ENERGY'
  }

  if (
    strategyRecommendation.command === 'plan_swap' ||
    swapRecommendation.action === 'plan_swap'
  ) {
    return 'SWAP_RECOMMENDED'
  }

  if (prediction.confidence === 'low') {
    return 'DATA_UNCERTAIN'
  }

  if (
    traileringRecommendation?.action === 'TRAILER_REQUIRED' ||
    traileringRecommendation?.action === 'TRAILER_RECOMMENDED'
  ) {
    return 'TRAILERING_RECOMMENDED'
  }

  if (
    strategyRecommendation.command === 'reduce_speed' ||
    strategyRecommendation.command === 'prioritize_charging'
  ) {
    return 'CONSERVE'
  }

  if (
    isFinalRaceDay(raceDay) &&
    strategyRecommendation.command === 'increase_speed_allowed' &&
    above(prediction.projectedEndDaySocPercent, rx2Config.absoluteMinimumSocPercent)
  ) {
    return 'FINISH_PUSH'
  }

  return 'ON_TARGET'
}

export function calculateRaceHealthFromCurrentChain({
  raceDay,
  prediction,
  swapRecommendation,
  strategyRecommendation,
  batteryState,
  traileringRecommendation,
  telemetrySource,
  telemetryStatus,
  connectionStatus,
  warnings,
}: {
  raceDay: RaceDay
  prediction: RacePrediction
  swapRecommendation: SwapRecommendation
  strategyRecommendation: StrategyRecommendation
  batteryState: RaceBatteryState
  traileringRecommendation?: TraileringOption
  telemetrySource: TelemetrySource
  telemetryStatus: TelemetryConnectionStatus
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  warnings: string[]
}): RaceHealthSummary {
  const activePack = batteryState.packs[batteryState.activePackId]
  const sparePack =
    batteryState.packs[batteryState.activePackId === 'A' ? 'B' : 'A']
  const baseScore = 72
  const primaryHealthSocPercent =
    prediction.projectedNextStopSocPercent ??
    prediction.projectedEndSegmentSocPercent ??
    activePack.socPercent
  const secondaryForecastSocPercent =
    prediction.projectedEndDaySocPercent ?? primaryHealthSocPercent
  const activeReserveSocPercent = rx2Config.reserveSocPercent
  const finalDayTargetReserveSocPercent = rx2Config.finalDayTargetReserveSocPercent
  const absoluteMinimumSocPercent = rx2Config.absoluteMinimumSocPercent
  const isFinalDay = isFinalRaceDay(raceDay)
  const endgameModeActive =
    isFinalDay &&
    secondaryForecastSocPercent >= absoluteMinimumSocPercent
  const reserveForMargin = isFinalDay
    ? finalDayTargetReserveSocPercent
    : activeReserveSocPercent
  const socMarginPercent = primaryHealthSocPercent - reserveForMargin
  const socMarginBonus = socMarginBonusForOperationalMargin(socMarginPercent)
  const highestRouteSeverity = routeSeverityFromTrailering(traileringRecommendation)
  const swapPenalty = swapRecommendationPenalty(swapRecommendation)
  const traileringPenaltyValue = traileringRecommendationPenalty(
    traileringRecommendation?.action,
    isFinalDay
  )
  const nextOpportunityPenaltyValue = projectionPenalty({
    projectedSocPercent: primaryHealthSocPercent,
    reserveSocPercent: reserveForMargin,
    absoluteMinimumSocPercent,
    isFinalDay,
  })
  const fullDayEnergyCautionPenaltyValue = projectionPenalty({
    projectedSocPercent: secondaryForecastSocPercent,
    reserveSocPercent: reserveForMargin,
    absoluteMinimumSocPercent,
    isFinalDay,
  })
  const routeRiskPenalty = routeSeverityPenalty(highestRouteSeverity)
  const telemetryPenalty = telemetryHealthPenalty(
    telemetrySource,
    telemetryStatus,
    connectionStatus
  )
  const confidencePenalty = predictionConfidencePenalty(prediction.confidence)
  const warningPenalty = Math.min(12, warnings.length * 2)
  const strategyPenalty = strategySeverityPenalty(strategyRecommendation.severity)
  const sparePackPenalty =
    sparePack.socPercent < rx2Config.reserveSocPercent ? 6 : 0
  const finalScore = Math.round(
    clampScore(
      baseScore +
        socMarginBonus -
        swapPenalty -
        traileringPenaltyValue -
        nextOpportunityPenaltyValue -
        fullDayEnergyCautionPenaltyValue -
        routeRiskPenalty -
        telemetryPenalty -
        confidencePenalty -
        warningPenalty -
        strategyPenalty -
        sparePackPenalty
    )
  )

  return {
    score: finalScore,
    breakdown: {
      baseScore,
      healthBasis: 'Current Prediction Chain',
      primaryHealthSocPercent,
      secondaryForecastSocPercent,
      socMarginPercent,
      socMarginBonus,
      swapPenalty,
      traileringPenalty: traileringPenaltyValue,
      nextOpportunityPenalty: nextOpportunityPenaltyValue,
      fullDayEnergyCautionPenalty: fullDayEnergyCautionPenaltyValue,
      routeRiskPenalty,
      telemetryPenalty,
      confidencePenalty,
      warningPenalty,
      strategyPenalty,
      sparePackPenalty,
      highestRouteSeverity,
      isFinalDay,
      activeReserveSocPercent,
      finalDayTargetReserveSocPercent,
      absoluteMinimumSocPercent,
      endgameModeActive,
      finalScore,
    },
    label:
      finalScore >= 90
        ? 'Excellent'
        : finalScore >= 75
          ? 'Good'
          : finalScore >= 60
            ? 'Caution'
            : finalScore >= 35
              ? 'Recovery'
              : 'Critical',
  }
}

function buildAlerts({
  missionStatus,
  raceHealth,
  prediction,
  swapRecommendation,
  strategyRecommendation,
  traileringRecommendation,
}: {
  missionStatus: MissionStatus
  raceHealth: RaceHealthSummary
  prediction: RacePrediction
  swapRecommendation: SwapRecommendation
  strategyRecommendation: StrategyRecommendation
  traileringRecommendation?: TraileringOption
}) {
  return dedupe([
    missionStatus === 'CRITICAL_ENERGY'
      ? 'Critical energy condition. Follow the command card before continuing.'
      : '',
    raceHealth.score < 60
      ? `Race health is ${raceHealth.label}. Verify telemetry and energy margin.`
      : '',
    prediction.confidence === 'low'
      ? 'Prediction confidence is low. Avoid aggressive strategy changes.'
      : '',
    swapRecommendation.action !== 'no_swap'
      ? `Battery swap: ${swapRecommendation.action.replaceAll('_', ' ')}.`
      : '',
    strategyRecommendation.severity !== 'normal'
      ? `${strategyRecommendation.title}: ${strategyRecommendation.reason}`
      : '',
    traileringRecommendation?.action === 'TRAILER_REQUIRED' ||
    traileringRecommendation?.action === 'TRAILER_RECOMMENDED'
      ? `Trailering advisory: ${traileringRecommendation.action.replaceAll('_', ' ')}.`
      : '',
  ].filter(Boolean))
}

function isFinalRaceDay(raceDay: RaceDay) {
  return raceDay.day >= 5
}

function below(value: number | undefined, threshold: number) {
  return value !== undefined && Number.isFinite(value) && value < threshold
}

function above(value: number | undefined, threshold: number) {
  return value !== undefined && Number.isFinite(value) && value > threshold
}

function socMarginBonusForOperationalMargin(marginPercent: number) {
  if (marginPercent > 30) return 28
  if (marginPercent > 20) return 20
  if (marginPercent > 10) return 12
  if (marginPercent > 5) return 6
  if (marginPercent > 0) return 2
  return 0
}

function swapRecommendationPenalty(recommendation: SwapRecommendation) {
  if (recommendation.action === 'swap_now') return 28
  if (recommendation.action === 'plan_swap') return 16
  return 0
}

function traileringRecommendationPenalty(
  action: TraileringOption['action'] | undefined,
  isFinalDay: boolean
) {
  if (action === 'TRAILER_REQUIRED') return 30
  if (action === 'TRAILER_RECOMMENDED') return 22
  if (isFinalDay && (action === 'TRAILER_OPTIONAL' || action === 'CONSERVE_AND_DRIVE')) {
    return 0
  }
  if (action === 'TRAILER_OPTIONAL') return 10
  if (action === 'CONSERVE_AND_DRIVE') return 6
  return 0
}

function projectionPenalty({
  projectedSocPercent,
  reserveSocPercent,
  absoluteMinimumSocPercent,
  isFinalDay,
}: {
  projectedSocPercent: number
  reserveSocPercent: number
  absoluteMinimumSocPercent: number
  isFinalDay: boolean
}) {
  const marginPercent = projectedSocPercent - reserveSocPercent

  if (projectedSocPercent < absoluteMinimumSocPercent) return isFinalDay ? 18 : 24
  if (marginPercent < -10) return 18
  if (marginPercent < -5) return 12
  if (marginPercent < 0) return 6
  return 0
}

function routeSeverityFromTrailering(
  traileringRecommendation: TraileringOption | undefined
): RouteRisk['severity'] {
  if (!traileringRecommendation) return 'LOW'
  if (traileringRecommendation.action === 'TRAILER_REQUIRED') return 'SEVERE'
  if (traileringRecommendation.action === 'TRAILER_RECOMMENDED') return 'HIGH'
  if (
    traileringRecommendation.action === 'TRAILER_OPTIONAL' ||
    traileringRecommendation.action === 'CONSERVE_AND_DRIVE'
  ) {
    return 'MEDIUM'
  }
  return 'LOW'
}

function routeSeverityPenalty(severity: RouteRisk['severity']) {
  if (severity === 'SEVERE') return 18
  if (severity === 'HIGH') return 10
  if (severity === 'MEDIUM') return 4
  return 0
}

function telemetryHealthPenalty(
  telemetrySource: TelemetrySource,
  telemetryStatus: TelemetryConnectionStatus,
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
) {
  if (telemetryStatus === 'error' || connectionStatus === 'error') return 12
  if (telemetrySource === 'simulator' || telemetrySource === 'mock-esp32') return 0
  if (telemetrySource === 'manual') return 0
  if (telemetryStatus === 'disconnected' || connectionStatus === 'disconnected') {
    return 6
  }
  if (connectionStatus === 'connecting') return 3
  return 0
}

function predictionConfidencePenalty(confidence: PredictionConfidence) {
  if (confidence === 'low') return 14
  if (confidence === 'medium') return 6
  return 0
}

function strategySeverityPenalty(severity: StrategyRecommendation['severity']) {
  if (severity === 'urgent') return 12
  if (severity === 'caution') return 6
  return 0
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score))
}

function dedupe(values: string[]) {
  return [...new Set(values)]
}
