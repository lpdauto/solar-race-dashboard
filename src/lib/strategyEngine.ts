import type { RaceDay, RouteSegment } from '@/data/raceRoute'
import type { EnergySimulationResult } from '@/lib/energy'
import type { TelemetryData } from '@/types/telemetry'

export type RaceMode = 'Conserve' | 'Normal' | 'Attack'

export type StrategyRecommendation = {
  title: string
  action: string
  severity: 'info' | 'warning' | 'danger'
}

export type PredictiveStrategyResult = {
  projectedFinishSoc: number
  currentWhPerMile: number
  modelWhPerMile: number
  efficiencyDeltaPercent: number
  thermalRisk: 'Low' | 'Watch' | 'Critical'
  recommendedSpeedMph: number
  raceMode: RaceMode
  driverAction: string
  chaseAction: string
  recommendations: StrategyRecommendation[]
}

export function generatePredictiveStrategy({
  raceDay,
  currentMile,
  currentSegment,
  energySimulation,
  telemetry,
}: {
  raceDay: RaceDay
  currentMile: number
  currentSegment: RouteSegment | null
  energySimulation: EnergySimulationResult
  telemetry: TelemetryData | null
}): PredictiveStrategyResult {
  const currentWhPerMile =
    telemetry?.efficiencyWhPerMile ?? energySimulation.estimatedWhPerMile
  const modelWhPerMile = Math.max(1, energySimulation.estimatedWhPerMile)
  const efficiencyDeltaPercent =
    ((currentWhPerMile - modelWhPerMile) / modelWhPerMile) * 100
  const remainingMiles = Math.max(0, raceDay.distanceMiles - currentMile)
  const batteryCapacityWh =
    energySimulation.netWh > 0 && energySimulation.batteryPercentUsed > 0
      ? energySimulation.netWh / (energySimulation.batteryPercentUsed / 100)
      : 4992
  const currentSoc =
    telemetry?.batterySocPercent ?? energySimulation.predictedFinishSocPercent
  const projectedUseWh = currentWhPerMile * remainingMiles
  const projectedFinishSoc = Number.isFinite(projectedUseWh / batteryCapacityWh)
    ? Math.max(
        0,
        Math.min(100, currentSoc - (projectedUseWh / batteryCapacityWh) * 100)
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
    efficiencyDeltaPercent,
    upcomingHighRiskClimb,
  })
  const raceMode = classifyRaceMode({
    projectedFinishSoc,
    efficiencyDeltaPercent,
    thermalRisk,
    currentSegment,
  })
  const recommendedSpeedMph = recommendSpeed({
    raceMode,
    currentSegment,
    telemetry,
    efficiencyDeltaPercent,
    projectedFinishSoc,
  })

  return {
    projectedFinishSoc,
    currentWhPerMile,
    modelWhPerMile,
    efficiencyDeltaPercent,
    thermalRisk,
    recommendedSpeedMph,
    raceMode,
    driverAction: driverActionForMode(raceMode, currentSegment),
    chaseAction: chaseActionForMode(raceMode, upcomingHighRiskClimb),
    recommendations: recommendations.slice(0, 3),
  }
}

function buildRecommendations({
  currentSegment,
  telemetry,
  projectedFinishSoc,
  efficiencyDeltaPercent,
  upcomingHighRiskClimb,
}: {
  currentSegment: RouteSegment | null
  telemetry: TelemetryData | null
  projectedFinishSoc: number
  efficiencyDeltaPercent: number
  upcomingHighRiskClimb: RouteSegment | null
}) {
  const recommendations: StrategyRecommendation[] = []

  if (projectedFinishSoc < 15) {
    recommendations.push({
      title: 'SOC projection critical',
      action:
        'Slow down heavily, reduce acceleration, and prepare trailer-risk decision points.',
      severity: 'danger',
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
  if (telemetry.controllerTempC > 85 || telemetry.motorTempC > 95) return 'Critical'
  if (telemetry.controllerTempC > 75 || telemetry.motorTempC > 85) return 'Watch'
  return 'Low'
}

function classifyRaceMode({
  projectedFinishSoc,
  efficiencyDeltaPercent,
  thermalRisk,
  currentSegment,
}: {
  projectedFinishSoc: number
  efficiencyDeltaPercent: number
  thermalRisk: 'Low' | 'Watch' | 'Critical'
  currentSegment: RouteSegment | null
}): RaceMode {
  if (
    projectedFinishSoc < 30 ||
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
  const currentSpeed = telemetry?.speedMph ?? 28
  let target = currentSpeed

  if (raceMode === 'Conserve') target -= 4
  if (raceMode === 'Attack') target += 2
  if (efficiencyDeltaPercent >= 15) target -= 3
  if (projectedFinishSoc < 15) target -= 5
  if (currentSegment?.type === 'climb') target -= 3
  if (currentSegment?.type === 'descent') target = Math.min(target, 30)
  if (currentSegment?.type === 'town' || currentSegment?.type === 'caution') {
    target = Math.min(target, 24)
  }

  return Math.max(18, Math.min(38, Math.round(target)))
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
