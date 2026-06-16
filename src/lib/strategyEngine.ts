import type { RaceDay, RiskLevel, RouteSegment, SegmentType } from '@/data/raceRoute'
import elevationImpactReport from '@/data/elevationImpactReport.json'
import mappedRaceSegments from '@/data/mappedRaceSegments.json'
import routeData from '@/data/routeData.json'
import {
  adviseBatterySwap,
  type BatteryState,
  type SwapRecommendation,
} from '@/lib/batterySwapAdvisor'
import type { EnergySimulationResult } from '@/lib/energy'
import { rx2Config, type Rx2VehicleConfig } from '@/lib/race/rx2Config'
import {
  analyzeRouteIntelligence,
  type RouteIntelligenceSummary,
} from '@/lib/routeIntelligence'
import {
  getRawTelemetryWhPerMile,
  getSafeWhPerMile,
} from '@/lib/safeWhPerMile'
import { getSafeStrategySoc } from '@/lib/safeSoc'
import { calculateDrivenOverlapMiles } from '@/lib/routeMileage'
import type { TelemetryData, TelemetrySource } from '@/types/telemetry'

export type RaceMode = 'Conserve' | 'Normal' | 'Attack'

export type StrategyRecommendation = {
  title: string
  action: string
  severity: 'info' | 'warning' | 'danger'
}

export type PredictiveStrategyResult = {
  isFinalDay: boolean
  activeReserveSocPercent: number
  finalDayTargetReserveSocPercent: number
  absoluteMinimumSocPercent: number
  endgameModeActive: boolean
  projectedFinishSoc: number
  rawTelemetrySocPercent?: number
  safeStrategySocPercent: number
  usingFallbackStrategySoc: boolean
  strategySocFallbackReason?: string
  rawTelemetryWhPerMile?: number
  safeStrategyWhPerMile: number
  usingFallbackStrategyWhPerMile: boolean
  strategyWhPerMileFallbackReason?: string
  currentWhPerMile: number
  modelWhPerMile: number
  efficiencyDeltaPercent: number
  thermalRisk: 'Low' | 'Watch' | 'Critical'
  recommendedSpeedMph: number
  raceMode: RaceMode
  driverAction: string
  chaseAction: string
  swapAdvice: SwapRecommendation
  routeIntelligence: RouteIntelligenceSummary
  elevationAdjusted: boolean
  elevationEnergyWh?: number
  elevationSocCostPercent?: number
  elevationWarnings?: string[]
  recommendations: StrategyRecommendation[]
}

export type SegmentEnergyEstimate = {
  expectedWh: number
  expectedWhPerMile: number
  energyMultiplier: number
  elevationAdjusted: boolean
  elevationEnergyWh?: number
  elevationSocCostPercent?: number
  elevationWarnings?: string[]
}

export type SegmentElevationImpact = {
  elevationEnergyWh: number
  elevationSocCostPercent: number
  elevationWarnings: string[]
  mappingConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
  matchedSegmentTitle: string
  matchBasis: 'title' | 'mile-overlap'
}

type OperationalOpportunity = {
  type:
    | 'checkpoint'
    | 'official-trailer-segment'
    | 'current-segment-end'
    | 'mapped-segment-end'
    | 'day-finish'
  mile: number
}

const riskEnergyMultiplier: Record<RiskLevel, number> = {
  low: 1,
  medium: 1.1,
  high: 1.25,
  severe: 1.4,
}

const segmentTypeEnergyMultiplier: Record<SegmentType, number> = {
  drive: 1,
  flat: 1,
  climb: 1.18,
  descent: 0.82,
  town: 1.12,
  caution: 1.08,
  stop: 1.15,
  controlled_stop: 1.15,
  mandatory_trailer: 0,
}

const elevationAdjustmentCapPercent = 0.35
const severeElevationAdjustmentCapPercent = 0.5
const softenedHeuristicWeightWithElevation = 0.45
const majorElevationSocCostPercent = 5

export function estimateSegmentEnergy({
  segment,
  raceDay,
  telemetry,
  vehicleConfig,
  baselineWhPerMile,
  distanceMiles = segmentDistanceMiles(segment),
  segmentStartMile = segment.mileStart,
  segmentEndMile = segment.mileEnd,
}: {
  segment: RouteSegment
  raceDay?: RaceDay
  telemetry: TelemetryData | null
  vehicleConfig: Rx2VehicleConfig
  baselineWhPerMile?: number
  distanceMiles?: number
  segmentStartMile?: number
  segmentEndMile?: number
}): SegmentEnergyEstimate {
  if (segment.type === 'mandatory_trailer') {
    return {
      expectedWh: 0,
      expectedWhPerMile: 0,
      energyMultiplier: 0,
      elevationAdjusted: false,
      elevationEnergyWh: 0,
      elevationSocCostPercent: 0,
      elevationWarnings: [],
    }
  }

  const rawEnergyMultiplier = getSegmentEnergyMultiplier(segment)
  const configBaselineWhPerMile = estimateVehicleBaselineWhPerMile(vehicleConfig)
  const routeBaselineWhPerMile = getSafeWhPerMile(
    baselineWhPerMile ?? getRawTelemetryWhPerMile(telemetry),
    configBaselineWhPerMile
  ).value
  const safeDistanceMiles = Math.max(0, distanceMiles)
  const baselineWh = safeDistanceMiles * routeBaselineWhPerMile
  const elevationImpact = raceDay
    ? getElevationImpactForSegment({
        raceDay,
        segment,
        segmentStartMile,
        segmentEndMile,
        vehicleConfig,
      })
    : null

  if (!elevationImpact) {
    const expectedWhPerMile = routeBaselineWhPerMile * rawEnergyMultiplier

    // Future elevation data can plug in here as per-segment gain/loss Wh adjustments.
    // Future wind forecasts can plug in here as headwind/crosswind multipliers.
    // Live telemetry can influence estimates through the baseline Wh/mi input.
    return {
      expectedWh: baselineWh * rawEnergyMultiplier,
      expectedWhPerMile,
      energyMultiplier: rawEnergyMultiplier,
      elevationAdjusted: false,
    }
  }

  const softenedEnergyMultiplier =
    1 + (rawEnergyMultiplier - 1) * softenedHeuristicWeightWithElevation
  const heuristicWh = baselineWh * softenedEnergyMultiplier
  const capPercent =
    segment.risk === 'severe'
      ? severeElevationAdjustmentCapPercent
      : elevationAdjustmentCapPercent
  const maxElevationAdjustmentWh = baselineWh * capPercent
  const requestedElevationWh = Math.max(0, elevationImpact.elevationEnergyWh)
  const cappedElevationWh = Math.min(
    requestedElevationWh,
    maxElevationAdjustmentWh
  )
  const capWarning =
    requestedElevationWh > cappedElevationWh
      ? [
          `Elevation adjustment capped at ${(capPercent * 100).toFixed(0)}% of baseline segment energy.`,
        ]
      : []
  const majorElevationWarning =
    elevationImpact.elevationSocCostPercent > majorElevationSocCostPercent
      ? [
          `Major elevation cost: ${elevationImpact.elevationSocCostPercent.toFixed(1)}% SOC on mapped segment.`,
        ]
      : []
  const expectedWh = Math.max(0, heuristicWh + cappedElevationWh)
  const expectedWhPerMile =
    safeDistanceMiles > 0 ? expectedWh / safeDistanceMiles : 0
  const energyMultiplier =
    baselineWh > 0 ? expectedWh / baselineWh : softenedEnergyMultiplier

  return {
    expectedWh,
    expectedWhPerMile,
    energyMultiplier,
    elevationAdjusted: true,
    elevationEnergyWh: cappedElevationWh,
    elevationSocCostPercent: elevationImpact.elevationSocCostPercent,
    elevationWarnings: [
      ...majorElevationWarning,
      ...capWarning,
      ...elevationImpact.elevationWarnings,
    ],
  }
}

export function getElevationImpactForSegment({
  raceDay,
  segment,
  segmentStartMile = segment.mileStart,
  segmentEndMile = segment.mileEnd,
  vehicleConfig = rx2Config,
}: {
  raceDay: RaceDay
  segment: RouteSegment
  segmentStartMile?: number
  segmentEndMile?: number
  vehicleConfig?: Rx2VehicleConfig
}): SegmentElevationImpact | null {
  const reportSegments = elevationImpactReport.segments.filter(
    (reportSegment) => reportSegment.day === raceDay.day
  )
  const normalizedSegmentTitle = normalizeSegmentTitle(segment.title)
  const titleMatch = reportSegments.find(
    (reportSegment) =>
      normalizeSegmentTitle(reportSegment.appSegmentTitle) === normalizedSegmentTitle
  )
  const mileOverlapMatch =
    titleMatch ??
    reportSegments
      .map((reportSegment) => ({
        reportSegment,
        overlapMiles: rangeOverlapMiles({
          leftStart: segmentStartMile,
          leftEnd: segmentEndMile,
          rightStart: reportSegment.appMileStart,
          rightEnd: reportSegment.appMileEnd,
        }),
      }))
      .filter((candidate) => candidate.overlapMiles > 0)
      .sort((left, right) => right.overlapMiles - left.overlapMiles)[0]
      ?.reportSegment

  if (!mileOverlapMatch) return null

  const matchBasis: SegmentElevationImpact['matchBasis'] = titleMatch
    ? 'title'
    : 'mile-overlap'
  const reportSegmentMiles = Math.max(
    0,
    mileOverlapMatch.appMileEnd - mileOverlapMatch.appMileStart
  )
  const overlapMiles = rangeOverlapMiles({
    leftStart: segmentStartMile,
    leftEnd: segmentEndMile,
    rightStart: mileOverlapMatch.appMileStart,
    rightEnd: mileOverlapMatch.appMileEnd,
  })
  const prorateFactor =
    reportSegmentMiles > 0 ? Math.min(1, overlapMiles / reportSegmentMiles) : 1
  const elevationEnergyWh =
    Math.max(0, mileOverlapMatch.netElevationEnergyWh) * prorateFactor
  const elevationSocCostPercent =
    vehicleConfig.mainBatteryUsableWh > 0
      ? (elevationEnergyWh / vehicleConfig.mainBatteryUsableWh) * 100
      : Math.max(0, mileOverlapMatch.estimatedSocCostPercent) * prorateFactor

  return {
    elevationEnergyWh,
    elevationSocCostPercent,
    elevationWarnings: mileOverlapMatch.dataQualityWarnings ?? [],
    mappingConfidence: mileOverlapMatch.mappingConfidence as
      | 'HIGH'
      | 'MEDIUM'
      | 'LOW',
    matchedSegmentTitle: mileOverlapMatch.appSegmentTitle,
    matchBasis,
  }
}

export function generatePredictiveStrategy({
  raceDay,
  currentMile,
  currentSegment,
  energySimulation,
  telemetry,
  telemetrySource,
  startingSocPercent = 100,
  spareBatterySocPercent = 100,
  isTraileringActive = false,
}: {
  raceDay: RaceDay
  currentMile: number
  currentSegment: RouteSegment | null
  energySimulation: EnergySimulationResult
  telemetry: TelemetryData | null
  telemetrySource?: TelemetrySource
  startingSocPercent?: number
  spareBatterySocPercent?: number
  isTraileringActive?: boolean
}): PredictiveStrategyResult {
  // RX2 vehicle configuration source
  const rawTelemetryWhPerMile = getRawTelemetryWhPerMile(telemetry)
  const safeStrategyWhPerMile = getSafeWhPerMile(
    rawTelemetryWhPerMile ?? energySimulation.estimatedWhPerMile,
    rx2Config.defaultRaceWhPerMile
  )
  const safeModelWhPerMile = getSafeWhPerMile(
    energySimulation.estimatedWhPerMile,
    rx2Config.defaultRaceWhPerMile
  )
  const currentWhPerMile = safeStrategyWhPerMile.value
  const modelWhPerMile = safeModelWhPerMile.value
  const isFinalDay = raceDay.day === 5
  const activeReserveSocPercent = isFinalDay
    ? rx2Config.finalDayTargetReserveSocPercent
    : rx2Config.reserveSocPercent
  const endgameModeActive = isFinalDay
  const efficiencyDeltaPercent =
    ((currentWhPerMile - modelWhPerMile) / modelWhPerMile) * 100
  const batteryCapacityWh =
    energySimulation.netWh > 0 && energySimulation.batteryPercentUsed > 0
      ? energySimulation.netWh / (energySimulation.batteryPercentUsed / 100)
      : rx2Config.mainBatteryUsableWh
  const rawTelemetrySocPercent = getRawTelemetrySocPercent(telemetry)
  const safeSoc = getSafeStrategySoc({
    rawValue: rawTelemetrySocPercent,
    telemetrySource,
    fallbackSocPercent: startingSocPercent,
  })
  const currentSoc = safeSoc.value
  const projectedUse = estimateRemainingRouteEnergyDetails({
    raceDay,
    currentMile,
    telemetry,
    vehicleConfig: rx2Config,
    baselineWhPerMile: currentWhPerMile,
  })
  const projectedUseWh = projectedUse.totalWh
  const projectedFinishSoc = Number.isFinite(projectedUseWh / batteryCapacityWh)
    ? Math.max(
        0,
        Math.min(100, currentSoc - (projectedUseWh / batteryCapacityWh) * 100)
      )
    : currentSoc
  const nextOperationalOpportunity = findNextOperationalOpportunity({
    raceDay,
    currentMile,
    currentSegment,
  })
  const estimatedWhToNextOperationalOpportunity = estimateRemainingRouteEnergyWh({
    raceDay,
    currentMile,
    telemetry,
    vehicleConfig: rx2Config,
    baselineWhPerMile: currentWhPerMile,
    stopMile: nextOperationalOpportunity.mile,
  })
  const projectedNextOpportunitySoc =
    batteryCapacityWh > 0
      ? Math.max(
          0,
          Math.min(
            100,
            currentSoc -
              (estimatedWhToNextOperationalOpportunity / batteryCapacityWh) * 100
          )
        )
      : currentSoc
  const thermalRisk = classifyThermalRisk(telemetry)
  const upcomingHighRiskClimb = findUpcomingHighRiskClimb(
    raceDay.segments,
    currentMile
  )
  const recommendations = buildRecommendations({
    currentSegment,
    telemetry,
    projectedFinishSoc,
    projectedNextOpportunitySoc,
    efficiencyDeltaPercent,
    upcomingHighRiskClimb,
    activeReserveSocPercent,
    absoluteMinimumSocPercent: rx2Config.absoluteMinimumSocPercent,
    isFinalDay,
  })
  const raceMode = classifyRaceMode({
    projectedFinishSoc,
    projectedNextOpportunitySoc,
    efficiencyDeltaPercent,
    thermalRisk,
    currentSegment,
    activeReserveSocPercent,
    absoluteMinimumSocPercent: rx2Config.absoluteMinimumSocPercent,
    isFinalDay,
  })
  const recommendedSpeedMph = recommendSpeed({
    raceMode,
    currentSegment,
    telemetry,
    efficiencyDeltaPercent,
    projectedFinishSoc,
  })
  const swapAdvice = adviseBatterySwap({
    inCarBattery: buildInCarBatteryState(telemetry, currentSoc, telemetrySource),
    spareBattery: buildSpareBatteryState(spareBatterySocPercent),
    currentDay: raceDay,
    currentMile,
    distanceToNextStop: distanceToNextStop(raceDay, currentMile),
    estimatedWhToNextStop: estimateEnergyToNextStop({
      raceDay,
      currentMile,
      telemetry,
      baselineWhPerMile: currentWhPerMile,
    }),
    estimatedWhToNextOperationalOpportunity,
    estimatedWhToFinishDay: projectedUseWh,
    nextOperationalOpportunityType: nextOperationalOpportunity.type,
    nextOperationalOpportunityMile: nextOperationalOpportunity.mile,
    reserveSocPercent: activeReserveSocPercent,
    expectedSwapMinutes: 10,
  })
  const routeIntelligence = analyzeRouteIntelligence({
    raceDay,
    currentMile,
    currentSocPercent: currentSoc,
    baselineWhPerMile: currentWhPerMile,
    batteryCapacityWh,
    reserveSocPercent: activeReserveSocPercent,
    absoluteMinimumSocPercent: rx2Config.absoluteMinimumSocPercent,
    isFinalDay,
    isTraileringActive,
    elevationAdjusted: projectedUse.elevationAdjusted,
    elevationWarnings: projectedUse.elevationWarnings,
  })

  return {
    isFinalDay,
    activeReserveSocPercent,
    finalDayTargetReserveSocPercent: rx2Config.finalDayTargetReserveSocPercent,
    absoluteMinimumSocPercent: rx2Config.absoluteMinimumSocPercent,
    endgameModeActive,
    projectedFinishSoc,
    rawTelemetrySocPercent,
    safeStrategySocPercent: safeSoc.value,
    usingFallbackStrategySoc: safeSoc.fallbackUsed,
    strategySocFallbackReason: safeSoc.reason,
    rawTelemetryWhPerMile,
    safeStrategyWhPerMile: safeStrategyWhPerMile.value,
    usingFallbackStrategyWhPerMile: safeStrategyWhPerMile.fallbackUsed,
    strategyWhPerMileFallbackReason: safeStrategyWhPerMile.reason,
    currentWhPerMile,
    modelWhPerMile,
    efficiencyDeltaPercent,
    thermalRisk,
    recommendedSpeedMph,
    raceMode,
    driverAction: driverActionForMode(raceMode, currentSegment),
    chaseAction: chaseActionForMode(raceMode, upcomingHighRiskClimb),
    swapAdvice,
    routeIntelligence,
    elevationAdjusted: projectedUse.elevationAdjusted,
    elevationEnergyWh: projectedUse.elevationEnergyWh,
    elevationSocCostPercent: projectedUse.elevationSocCostPercent,
    elevationWarnings: projectedUse.elevationWarnings,
    recommendations: recommendations.slice(0, 3),
  }
}

function buildRecommendations({
  currentSegment,
  telemetry,
  projectedFinishSoc,
  projectedNextOpportunitySoc,
  efficiencyDeltaPercent,
  upcomingHighRiskClimb,
  activeReserveSocPercent,
  absoluteMinimumSocPercent,
  isFinalDay,
}: {
  currentSegment: RouteSegment | null
  telemetry: TelemetryData | null
  projectedFinishSoc: number
  projectedNextOpportunitySoc: number
  efficiencyDeltaPercent: number
  upcomingHighRiskClimb: RouteSegment | null
  activeReserveSocPercent: number
  absoluteMinimumSocPercent: number
  isFinalDay: boolean
}) {
  const recommendations: StrategyRecommendation[] = []

  if (
    (isFinalDay ? projectedNextOpportunitySoc : projectedFinishSoc) <
    absoluteMinimumSocPercent
  ) {
    recommendations.push({
      title: 'SOC projection critical',
      action:
        'Slow down heavily, reduce acceleration, and prepare trailer-risk decision points.',
      severity: 'danger',
    })
  } else if (isFinalDay && projectedNextOpportunitySoc >= activeReserveSocPercent) {
    recommendations.push({
      title: 'Final-day energy available',
      action:
        'Use available pack energy to maximize completion and official mileage while staying above final-day minimums.',
      severity: 'info',
    })
  }

  if (efficiencyDeltaPercent >= 15) {
    recommendations.push({
      title: 'Efficiency below model',
      action:
        'Reduce cruise speed until live Wh/mile returns within 15 percent of the model.',
      severity: 'warning',
    })
  }

  if ((telemetry?.controllerTempC ?? 0) > 85) {
    recommendations.push({
      title: 'Controller temperature critical',
      action:
        'Reduce throttle immediately and monitor cooling response over the next mile.',
      severity: 'danger',
    })
  }

  if ((telemetry?.motorTempC ?? 0) > 95) {
    recommendations.push({
      title: 'Motor overheating risk',
      action:
        'Reduce torque demand, avoid surge acceleration, and brief chase on thermal risk.',
      severity: 'danger',
    })
  }

  if (currentSegment?.type === 'descent') {
    recommendations.push({
      title: 'Descent regen opportunity',
      action:
        'Use regen carefully on the descent and avoid aggressive regen if SOC is high.',
      severity: 'info',
    })
  }

  if (upcomingHighRiskClimb) {
    recommendations.push({
      title: 'High-risk climb ahead',
      action: `Prepare for ${upcomingHighRiskClimb.title} at mile ${upcomingHighRiskClimb.mileStart}. Reduce speed before the grade.`,
      severity: 'warning',
    })
  }

  if (currentSegment?.type === 'flat' && currentSegment.risk === 'low') {
    recommendations.push({
      title: 'Stable flat segment',
      action:
        'Maintain steady aero-efficient speed and avoid unnecessary acceleration.',
      severity: 'info',
    })
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: 'Strategy stable',
      action:
        'Hold normal race pace, keep telemetry cadence steady, and protect SOC on the next transition.',
      severity: 'info',
    })
  }

  return recommendations
}

function classifyThermalRisk(telemetry: TelemetryData | null) {
  if (!telemetry) return 'Low'
  const controllerTempC = telemetry.controllerTempC ?? 0
  const motorTempC = telemetry.motorTempC ?? 0

  if (controllerTempC > 85 || motorTempC > 95) return 'Critical'
  if (controllerTempC > 75 || motorTempC > 85) return 'Watch'
  return 'Low'
}

function classifyRaceMode({
  projectedFinishSoc,
  projectedNextOpportunitySoc,
  efficiencyDeltaPercent,
  thermalRisk,
  currentSegment,
  activeReserveSocPercent,
  absoluteMinimumSocPercent,
  isFinalDay,
}: {
  projectedFinishSoc: number
  projectedNextOpportunitySoc: number
  efficiencyDeltaPercent: number
  thermalRisk: 'Low' | 'Watch' | 'Critical'
  currentSegment: RouteSegment | null
  activeReserveSocPercent: number
  absoluteMinimumSocPercent: number
  isFinalDay: boolean
}): RaceMode {
  if (
    isFinalDay &&
    projectedNextOpportunitySoc >= activeReserveSocPercent &&
    efficiencyDeltaPercent < 15 &&
    thermalRisk !== 'Critical'
  ) {
    return 'Normal'
  }

  if (
    (isFinalDay
      ? projectedNextOpportunitySoc < absoluteMinimumSocPercent
      : projectedFinishSoc < 30) ||
    efficiencyDeltaPercent >= 15 ||
    thermalRisk === 'Critical'
  ) {
    return 'Conserve'
  }

  if (
    projectedFinishSoc > 55 &&
    efficiencyDeltaPercent < 5 &&
    thermalRisk === 'Low' &&
    currentSegment?.risk === 'low' &&
    currentSegment.type === 'flat'
  ) {
    return 'Attack'
  }

  return 'Normal'
}

function recommendSpeed({
  raceMode,
  currentSegment,
  telemetry,
  efficiencyDeltaPercent,
  projectedFinishSoc,
}: {
  raceMode: RaceMode
  currentSegment: RouteSegment | null
  telemetry: TelemetryData | null
  efficiencyDeltaPercent: number
  projectedFinishSoc: number
}) {
  // RX2 vehicle configuration source
  const currentSpeed = telemetry?.speedMph ?? rx2Config.defaultTargetSpeedMph
  let target = currentSpeed

  if (raceMode === 'Conserve') target -= 4
  if (raceMode === 'Attack') target += 2
  if (efficiencyDeltaPercent >= 15) target -= 3
  if (projectedFinishSoc < 15) target -= 5
  if (currentSegment?.type === 'climb') target -= 3
  if (currentSegment?.type === 'descent') {
    target = Math.min(target, rx2Config.defaultTargetSpeedMph + 6)
  }
  if (currentSegment?.type === 'town' || currentSegment?.type === 'caution') {
    target = Math.min(target, rx2Config.defaultTargetSpeedMph)
  }

  return Math.max(
    rx2Config.minimumRaceSpeedMph,
    Math.min(rx2Config.maxRecommendedSpeedMph, Math.round(target))
  )
}

type RouteEnergyEstimate = {
  totalWh: number
  elevationAdjusted: boolean
  elevationEnergyWh: number
  elevationSocCostPercent: number
  elevationWarnings: string[]
}

function estimateRemainingRouteEnergyDetails({
  raceDay,
  currentMile,
  telemetry,
  vehicleConfig,
  baselineWhPerMile,
  stopMile = raceDay.distanceMiles,
}: {
  raceDay: RaceDay
  currentMile: number
  telemetry: TelemetryData | null
  vehicleConfig: Rx2VehicleConfig
  baselineWhPerMile: number
  stopMile?: number
}): RouteEnergyEstimate {
  const remainingSegments = raceDay.segments.filter(
    (segment) => segment.mileEnd > currentMile && segment.mileStart < stopMile
  )

  if (remainingSegments.length === 0) {
    return {
      totalWh: 0,
      elevationAdjusted: false,
      elevationEnergyWh: 0,
      elevationSocCostPercent: 0,
      elevationWarnings: [],
    }
  }

  const routeWeightedMultiplier = weightedRouteEnergyMultiplier(raceDay.segments)

  return remainingSegments.reduce<RouteEnergyEstimate>((total, segment) => {
    const segmentStart = Math.max(segment.mileStart, currentMile)
    const segmentEnd = Math.min(segment.mileEnd, stopMile)
    const remainingSegmentMiles = calculateDrivenOverlapMiles({
      segment,
      raceDay,
      startMile: segmentStart,
      endMile: segmentEnd,
    })
    const estimate = estimateSegmentEnergy({
      segment,
      raceDay,
      telemetry,
      vehicleConfig,
      baselineWhPerMile,
      distanceMiles: remainingSegmentMiles,
      segmentStartMile: segmentStart,
      segmentEndMile: segmentEnd,
    })
    const normalizedWh =
      !estimate.elevationAdjusted && routeWeightedMultiplier > 0
        ? estimate.expectedWh / routeWeightedMultiplier
        : estimate.expectedWh

    return {
      totalWh: total.totalWh + normalizedWh,
      elevationAdjusted: total.elevationAdjusted || estimate.elevationAdjusted,
      elevationEnergyWh:
        total.elevationEnergyWh + (estimate.elevationEnergyWh ?? 0),
      elevationSocCostPercent:
        total.elevationSocCostPercent + (estimate.elevationSocCostPercent ?? 0),
      elevationWarnings: mergeWarnings([
        ...total.elevationWarnings,
        ...(estimate.elevationWarnings ?? []),
      ]),
    }
  }, {
    totalWh: 0,
    elevationAdjusted: false,
    elevationEnergyWh: 0,
    elevationSocCostPercent: 0,
    elevationWarnings: [],
  })
}

function estimateRemainingRouteEnergyWh({
  raceDay,
  currentMile,
  telemetry,
  vehicleConfig,
  baselineWhPerMile,
  stopMile = raceDay.distanceMiles,
}: {
  raceDay: RaceDay
  currentMile: number
  telemetry: TelemetryData | null
  vehicleConfig: Rx2VehicleConfig
  baselineWhPerMile: number
  stopMile?: number
}) {
  return estimateRemainingRouteEnergyDetails({
    raceDay,
    currentMile,
    telemetry,
    vehicleConfig,
    baselineWhPerMile,
    stopMile,
  }).totalWh
}

function estimateEnergyToNextStop({
  raceDay,
  currentMile,
  telemetry,
  baselineWhPerMile,
}: {
  raceDay: RaceDay
  currentMile: number
  telemetry: TelemetryData | null
  baselineWhPerMile: number
}) {
  return estimateRemainingRouteEnergyWh({
    raceDay,
    currentMile,
    telemetry,
    vehicleConfig: rx2Config,
    baselineWhPerMile,
    stopMile: nextStopMile(raceDay, currentMile),
  })
}

function findUpcomingHighRiskClimb(
  segments: RouteSegment[],
  currentMile: number
) {
  return (
    segments.find(
      (segment) =>
        segment.type === 'climb' &&
        (segment.risk === 'high' || segment.risk === 'severe') &&
        segment.mileStart > currentMile &&
        segment.mileStart <= currentMile + 5
    ) ?? null
  )
}

function buildInCarBatteryState(
  telemetry: TelemetryData | null,
  fallbackSocPercent: number,
  telemetrySource?: TelemetrySource
): BatteryState {
  return {
    id: 'A',
    socPercent: getSafeStrategySoc({
      rawValue: getRawTelemetrySocPercent(telemetry),
      telemetrySource,
      fallbackSocPercent,
    }).value,
    usableWh: rx2Config.mainBatteryUsableWh,
    location: 'car',
  }
}

function buildSpareBatteryState(spareBatterySocPercent: number): BatteryState {
  return {
    id: 'B',
    socPercent: clampSoc(spareBatterySocPercent),
    usableWh: rx2Config.mainBatteryUsableWh,
    location: 'trailer',
    chargingWatts: rx2Config.expectedSolarStationWatts,
  }
}

function distanceToNextStop(raceDay: RaceDay, currentMile: number) {
  return Math.max(0, nextStopMile(raceDay, currentMile) - currentMile)
}

function nextStopMile(raceDay: RaceDay, currentMile: number) {
  const nextRouteStop = raceDay.routePoints.find((point) => point.mile > currentMile)
  const nextStopSegment = raceDay.segments.find(
    (segment) => segment.type === 'stop' && segment.mileStart > currentMile
  )
  const candidates = [
    nextRouteStop?.mile,
    nextStopSegment?.mileStart,
    raceDay.distanceMiles,
  ].filter((mile): mile is number => typeof mile === 'number')

  return Math.min(...candidates)
}

function findNextOperationalOpportunity({
  raceDay,
  currentMile,
  currentSegment,
}: {
  raceDay: RaceDay
  currentMile: number
  currentSegment: RouteSegment | null
}): OperationalOpportunity {
  const candidates: OperationalOpportunity[] = []
  const nextRoutePoint = raceDay.routePoints.find(
    (point) => point.mile > currentMile
  )

  if (nextRoutePoint) {
    candidates.push({
      type: 'checkpoint',
      mile: nextRoutePoint.mile,
    })
  }

  const nextTrailerStartMile = nextOfficialTrailerStartMile(raceDay, currentMile)

  if (nextTrailerStartMile !== null) {
    candidates.push({
      type: 'official-trailer-segment',
      mile: nextTrailerStartMile,
    })
  }

  if (currentSegment && currentSegment.mileEnd > currentMile) {
    candidates.push({
      type: 'current-segment-end',
      mile: currentSegment.mileEnd,
    })
  }

  const mappedSegmentEnd = nextMappedSegmentEndMile(raceDay, currentMile)

  if (mappedSegmentEnd !== null) {
    candidates.push({
      type: 'mapped-segment-end',
      mile: mappedSegmentEnd,
    })
  }

  candidates.push({
    type: 'day-finish',
    mile: raceDay.distanceMiles,
  })

  return (
    candidates
    .filter((candidate) => candidate.mile > currentMile)
      .sort((left, right) => left.mile - right.mile)[0] ?? {
      type: 'day-finish',
      mile: raceDay.distanceMiles,
    }
  )
}

function nextOfficialTrailerStartMile(raceDay: RaceDay, currentMile: number) {
  const dayRouteSegments = routeData.segments.filter(
    (segment) => segment.day === raceDay.day
  )
  const daySummary = mappedRaceSegments.daySummaries.find(
    (summary) => summary.day === raceDay.day
  )

  if (!daySummary || daySummary.kmlDrivingMiles <= 0) return null

  let drivingMilesBeforeSegment = 0

  for (const segment of dayRouteSegments) {
    if (segment.segmentType === 'trailer') {
      const appMile =
        (drivingMilesBeforeSegment / daySummary.kmlDrivingMiles) *
        raceDay.distanceMiles

      if (appMile > currentMile) return Math.min(raceDay.distanceMiles, appMile)
    }

    if (segment.segmentType === 'driving') {
      drivingMilesBeforeSegment += segment.segmentMiles
    }
  }

  return null
}

function nextMappedSegmentEndMile(raceDay: RaceDay, currentMile: number) {
  const mappedSegment = mappedRaceSegments.mappedSegments.find(
    (segment) => segment.day === raceDay.day && segment.appMileEnd > currentMile
  )

  return mappedSegment?.appMileEnd ?? null
}

function getSegmentEnergyMultiplier(segment: RouteSegment) {
  return riskEnergyMultiplier[segment.risk] * segmentTypeEnergyMultiplier[segment.type]
}

function weightedRouteEnergyMultiplier(segments: RouteSegment[]) {
  const totalMiles = segments.reduce(
    (total, segment) => total + segmentDistanceMiles(segment),
    0
  )

  if (totalMiles <= 0) return 1

  return (
    segments.reduce(
      (total, segment) =>
        total + segmentDistanceMiles(segment) * getSegmentEnergyMultiplier(segment),
      0
    ) / totalMiles
  )
}

function segmentDistanceMiles(segment: RouteSegment) {
  return Math.max(0, segment.mileEnd - segment.mileStart)
}

function normalizeSegmentTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function rangeOverlapMiles({
  leftStart,
  leftEnd,
  rightStart,
  rightEnd,
}: {
  leftStart: number
  leftEnd: number
  rightStart: number
  rightEnd: number
}) {
  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart))
}

function mergeWarnings(warnings: string[]) {
  return Array.from(new Set(warnings)).slice(0, 6)
}

function estimateVehicleBaselineWhPerMile(vehicleConfig: Rx2VehicleConfig) {
  return vehicleConfig.defaultRaceWhPerMile
}

function clampSoc(value: number) {
  if (!Number.isFinite(value)) return 100

  return Math.min(100, Math.max(0, value))
}

function getRawTelemetrySocPercent(telemetry: TelemetryData | null) {
  if (!telemetry) return undefined
  if (telemetry.batterySocPercentValid === false) return undefined

  return telemetry.batterySocPercent
}

function driverActionForMode(
  raceMode: RaceMode,
  currentSegment: RouteSegment | null
) {
  if (raceMode === 'Conserve') {
    return 'Ease speed down now, smooth throttle inputs, and protect battery reserve.'
  }

  if (raceMode === 'Attack') {
    return 'Pace can increase slightly if traffic and wind stay stable.'
  }

  if (currentSegment?.type === 'descent') {
    return 'Keep the car settled and use regen gently.'
  }

  return 'Hold target pace and keep acceleration smooth.'
}

function chaseActionForMode(
  raceMode: RaceMode,
  upcomingHighRiskClimb: RouteSegment | null
) {
  if (upcomingHighRiskClimb) {
    return `Brief driver before ${upcomingHighRiskClimb.title}; watch current and temperatures through the crest.`
  }

  if (raceMode === 'Conserve') {
    return 'Call energy split every mile and prepare trailer-risk thresholds.'
  }

  if (raceMode === 'Attack') {
    return 'Confirm SOC margin and keep aerodynamic spacing clean.'
  }

  return 'Monitor telemetry trend and keep navigator calls calm and early.'
}
