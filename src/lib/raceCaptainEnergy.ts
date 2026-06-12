import SunCalc from 'suncalc'
import type { RaceDay, RiskLevel, RouteSegment } from '@/data/raceRoute'
import type { TelemetryHistorySample } from '@/hooks/useTelemetry'
import type { AuthoritativeStrategyState } from '@/lib/authoritativeStrategyState'
import type { CarSetup, EnergySimulationResult } from '@/lib/energy'
import type { PredictiveStrategyResult } from '@/lib/strategyEngine'
import type { TelemetryData } from '@/types/telemetry'

export const rollingWindowMiles = 10
export const rollingFallbackWindowMs = 10 * 60 * 1000
export const minimumRollingDistanceMiles = 0.1
export const minimumRollingSpeedMph = 3
export const minimumRollingDurationMs = 30 * 1000
export const maxReasonableRollingWhPerMile = 500

export type EnergyTimelineSegment = {
  label: string
  detail: string
  color: string
  barColor: string
}

export type RollingWhPerMileResult = {
  value: number | null
  label: 'Rolling 10 mi' | 'Rolling partial' | 'Rolling estimated'
  mode: 'distance' | 'partial' | 'estimated' | 'insufficient'
}

export type RaceCaptainEnergyModel = {
  currentSocPercent: number
  currentSocIsSimulated: boolean
  activeBatteryKwh: number
  reserveBatterySocPercent: number
  reserveBatteryKwh: number
  combinedEnergyKwh: number
  combinedInventoryPercent: number
  currentWhPerMile: number
  requiredWhPerMile: number
  currentWhIsSimulated: boolean
  rollingWhPerMile: RollingWhPerMileResult
  solarInputWatts: number
  solarInputIsSimulated: boolean
  solarInputIsEstimated: boolean
  solarCapturedKwh: number
  solarCapturedIsEstimated: boolean
  solarCapturedUnavailable: boolean
  energyUsedKwh: number
  solarOffsetPercent: number
  netEnergyLossKwh: number
  netPowerWatts: number
  batteryEnergyWh: number
  energyConsumedWh: number
  energyRecoveredWh: number
  nextStopDistance: number
  projectedArrivalSoc: number
  projectedFinishSoc: number
  projectedFinishLabel: string
  routeSocPoints: Array<{ x: number; y: number; soc: number }>
  upcomingTimelineSegments: EnergyTimelineSegment[]
  timeToSunset: string
}

export function buildRaceCaptainEnergyModel({
  raceDay,
  currentMile,
  distanceRemaining,
  telemetry,
  telemetryHistory,
  energySimulation,
  authoritativeStrategy,
  predictiveStrategy,
  carSetup,
  now,
}: {
  raceDay: RaceDay
  currentMile: number
  distanceRemaining: number
  telemetry: TelemetryData | null
  telemetryHistory: TelemetryHistorySample[]
  energySimulation: EnergySimulationResult
  authoritativeStrategy?: AuthoritativeStrategyState
  predictiveStrategy?: PredictiveStrategyResult
  carSetup: CarSetup
  now: Date
}): RaceCaptainEnergyModel {
  const currentSocPercent =
    authoritativeStrategy?.prediction.currentSocPercent ??
    predictiveStrategy?.safeStrategySocPercent ??
    telemetry?.batterySocPercent ??
    0
  const activeBatteryKwh = (carSetup.batteryKwh * currentSocPercent) / 100
  const reserveBatterySocPercent = carSetup.spareBatterySocPercent
  const reserveBatteryKwh = (carSetup.batteryKwh * reserveBatterySocPercent) / 100
  const combinedEnergyKwh = activeBatteryKwh + reserveBatteryKwh
  const combinedInventoryPercent =
    carSetup.batteryKwh > 0 ? (combinedEnergyKwh / carSetup.batteryKwh) * 100 : 0
  const solarInput = getSolarInputWatts({ telemetry, carSetup })
  const solarCaptured = getSolarCapturedKwh({
    telemetry,
    telemetryHistory,
    energySimulation,
  })
  const energyUsedKwh = (energySimulation.flatRoadWh + energySimulation.climbWh) / 1000
  const solarOffsetPercent = energyUsedKwh > 0 ? (solarCaptured.value / energyUsedKwh) * 100 : 0
  const currentWhPerMile =
    authoritativeStrategy?.prediction.predictedWhPerMile ??
    predictiveStrategy?.currentWhPerMile ??
    energySimulation.estimatedWhPerMile
  const requiredWhPerMile =
    authoritativeStrategy?.strategyRecommendation.targetWhPerMile.max ??
    predictiveStrategy?.modelWhPerMile ??
    energySimulation.estimatedWhPerMile
  const projectedFinishSoc =
    authoritativeStrategy?.prediction.projectedEndDaySocPercent ??
    predictiveStrategy?.projectedFinishSoc ??
    energySimulation.predictedFinishSocPercent
  const nextStopDistance =
    authoritativeStrategy?.prediction.nextStopMiles ??
    (predictiveStrategy
      ? (predictiveStrategy.swapAdvice.recommendedSwapMile ??
        predictiveStrategy.swapAdvice.debug.nextOperationalOpportunityMile) - currentMile
      : Math.max(0, distanceRemaining))
  const projectedArrivalSoc =
    authoritativeStrategy?.prediction.projectedNextStopSocPercent ??
    predictiveStrategy?.swapAdvice.projectedSocIfContinue ??
    projectedFinishSoc
  const routeSocPoints = buildRouteSocProjection({
    currentSocPercent,
    projectedFinishSoc,
    segments: raceDay.segments,
    currentMile,
  })

  return {
    currentSocPercent,
    currentSocIsSimulated:
      authoritativeStrategy === undefined
        ? predictiveStrategy?.usingFallbackStrategySoc ?? true
        : authoritativeStrategy.prediction.warnings.some((warning) =>
          warning.toLowerCase().includes('estimated from soc')
        ),
    activeBatteryKwh,
    reserveBatterySocPercent,
    reserveBatteryKwh,
    combinedEnergyKwh,
    combinedInventoryPercent,
    currentWhPerMile,
    requiredWhPerMile,
    currentWhIsSimulated:
      authoritativeStrategy === undefined
        ? predictiveStrategy?.usingFallbackStrategyWhPerMile ?? true
        : authoritativeStrategy.prediction.warnings.some((warning) =>
          warning.toLowerCase().includes('configured wh/mi fallback')
        ),
    rollingWhPerMile: calculateRollingWhPerMile(telemetryHistory),
    solarInputWatts: solarInput.value,
    solarInputIsSimulated: solarInput.source === 'setup',
    solarInputIsEstimated: solarInput.source === 'setup',
    solarCapturedKwh: solarCaptured.value,
    solarCapturedIsEstimated: solarCaptured.source === 'setup-estimate',
    solarCapturedUnavailable: solarCaptured.source === 'unavailable',
    energyUsedKwh,
    solarOffsetPercent,
    netEnergyLossKwh: energySimulation.netKwh,
    netPowerWatts: telemetry?.netPowerWatts ?? 0,
    batteryEnergyWh: telemetry?.batteryEnergyWh ?? 0,
    energyConsumedWh: telemetry?.energyConsumedWh ?? 0,
    energyRecoveredWh: telemetry?.energyRecoveredWh ?? 0,
    nextStopDistance: Math.max(0, nextStopDistance),
    projectedArrivalSoc,
    projectedFinishSoc,
    projectedFinishLabel: finishSocStatusLabel(projectedFinishSoc),
    routeSocPoints,
    upcomingTimelineSegments: buildEnergyTimelineSegments({
      raceDay,
      currentMile,
    }),
    timeToSunset: calculateTimeToSunset({
      raceDay,
      currentMile,
      telemetry,
      now,
    }),
  }
}

export function calculateRollingWhPerMile(
  history: TelemetryHistorySample[]
): RollingWhPerMileResult {
  const validSamples = history
    .filter(
      (sample) =>
        Number.isFinite(sample.timestamp) &&
        sample.speedMph >= minimumRollingSpeedMph
    )
    .sort((left, right) => left.timestamp - right.timestamp)

  if (validSamples.length < 2) return insufficientRollingWhPerMile()

  const distanceResult = calculateDistanceRollingWhPerMile(validSamples)
  if (distanceResult) return distanceResult

  const timeEstimate = calculateTimeWindowRollingWhPerMile(validSamples)
  return timeEstimate ?? insufficientRollingWhPerMile()
}

export function getSolarInputWatts({
  telemetry,
  carSetup,
}: {
  telemetry: TelemetryData | null
  carSetup: CarSetup
}) {
  if (typeof telemetry?.mpptChargePowerWatts === 'number') {
    return { value: telemetry.mpptChargePowerWatts, source: 'mppt-charge' as const }
  }
  if (typeof telemetry?.mpptPowerWatts === 'number') {
    return { value: telemetry.mpptPowerWatts, source: 'mppt-power' as const }
  }
  if (typeof telemetry?.mpptPvPowerWatts === 'number') {
    return { value: telemetry.mpptPvPowerWatts, source: 'mppt-pv' as const }
  }
  if (typeof telemetry?.solarPowerWatts === 'number') {
    return { value: telemetry.solarPowerWatts, source: 'legacy-solar' as const }
  }

  return { value: carSetup.solarWatts, source: 'setup' as const }
}

export function getSolarCapturedKwh({
  telemetry,
  telemetryHistory,
  energySimulation,
}: {
  telemetry: TelemetryData | null
  telemetryHistory: TelemetryHistorySample[]
  energySimulation: EnergySimulationResult
}) {
  if (typeof telemetry?.mpptDailyEnergyWh === 'number') {
    return {
      value: Math.max(0, telemetry.mpptDailyEnergyWh) / 1000,
      source: 'mppt-daily' as const,
    }
  }

  const integratedWh = integrateMpptChargeEnergyWh(telemetryHistory)

  if (integratedWh !== null) {
    return {
      value: integratedWh / 1000,
      source: 'mppt-integrated' as const,
    }
  }

  if (energySimulation.solarWh > 0) {
    return {
      value: energySimulation.solarWh / 1000,
      source: 'setup-estimate' as const,
    }
  }

  return {
    value: 0,
    source: 'unavailable' as const,
  }
}

export function buildTargetRows({
  nextStopDistance,
  distanceRemaining,
  projectedArrivalSoc,
  projectedFinishSoc,
  timeToSunset,
}: {
  nextStopDistance: number
  distanceRemaining: number
  projectedArrivalSoc: number
  projectedFinishSoc: number
  timeToSunset: string
}) {
  return [
    { label: 'NEXT STOP (REST)', value: `${nextStopDistance.toFixed(0)} mi`, color: 'text-sky-300' },
    { label: 'DISTANCE TO FINISH', value: `${distanceRemaining.toFixed(0)} mi`, color: 'text-white' },
    { label: 'PROJECTED ARRIVAL SOC', value: `${projectedArrivalSoc.toFixed(0)}%`, color: statusValueColor(projectedArrivalSoc) },
    { label: 'PROJECTED FINISH SOC', value: formatSignedPercent(projectedFinishSoc), color: statusValueColor(projectedFinishSoc) },
    { label: 'TIME TO SUNSET', value: timeToSunset, color: timeToSunset === '--' ? 'text-slate-400' : 'text-amber-300' },
  ]
}

export function buildRouteSocProjection({
  currentSocPercent,
  projectedFinishSoc,
  segments,
  currentMile,
}: {
  currentSocPercent: number
  projectedFinishSoc: number
  segments: RouteSegment[]
  currentMile: number
}) {
  const upcomingSegments = segments
    .filter((segment) => segment.mileEnd > currentMile)
    .slice(0, 5)
  const pointCount = Math.max(2, upcomingSegments.length + 1)

  return Array.from({ length: pointCount }).map((_, index) => {
    const progress = index / (pointCount - 1)
    const soc =
      currentSocPercent + (projectedFinishSoc - currentSocPercent) * progress

    return {
      x: progress * 100,
      y: Math.min(95, Math.max(5, soc)),
      soc: Math.min(100, Math.max(0, soc)),
    }
  })
}

export function buildEnergyTimelineSegments({
  raceDay,
  currentMile,
}: {
  raceDay: RaceDay
  currentMile: number
}): EnergyTimelineSegment[] {
  const upcomingSegments = raceDay.segments
    .filter((segment) => segment.mileEnd > currentMile)
    .slice(0, 5)
  const fallbackSegment: EnergyTimelineSegment = {
    label: 'Finish',
    detail: `${Math.max(0, raceDay.distanceMiles - currentMile).toFixed(0)} mi`,
    color: 'text-slate-300',
    barColor: 'bg-slate-500',
  }
  const mappedSegments = upcomingSegments.map((segment) => ({
    label: segment.title.split(':')[0].slice(0, 16),
    detail: `${Math.max(0, segment.mileEnd - Math.max(currentMile, segment.mileStart)).toFixed(0)} mi`,
    ...timelineRiskStyle(segment.risk),
  }))

  return [...mappedSegments, fallbackSegment].slice(0, 5)
}

export function calculateTimeToSunset({
  raceDay,
  currentMile,
  telemetry,
  now,
}: {
  raceDay: RaceDay
  currentMile: number
  telemetry: TelemetryData | null
  now: Date
}) {
  const location = getSunsetLocation({ raceDay, currentMile, telemetry })
  const raceDate = parseCentralRaceDate(raceDay.date)

  if (!location || !raceDate) return '--'

  const sunsetTime = SunCalc.getTimes(
    raceDate,
    location.lat,
    location.lng
  ).sunset

  if (!(sunsetTime instanceof Date) || Number.isNaN(sunsetTime.getTime())) {
    return '--'
  }

  const remainingMs = sunsetTime.getTime() - now.getTime()
  if (remainingMs <= 0) return 'Sunset passed'

  const totalMinutes = Math.floor(remainingMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${hours}h ${minutes}m`
}

export function getSunsetLocation({
  raceDay,
  currentMile,
  telemetry,
}: {
  raceDay: RaceDay
  currentMile: number
  telemetry: TelemetryData | null
}) {
  if (
    typeof telemetry?.gpsLat === 'number' &&
    Number.isFinite(telemetry.gpsLat) &&
    typeof telemetry.gpsLng === 'number' &&
    Number.isFinite(telemetry.gpsLng)
  ) {
    return {
      lat: telemetry.gpsLat,
      lng: telemetry.gpsLng,
    }
  }

  const routePoint = raceDay.routePoints
    .filter(
      (point) =>
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng) &&
        Number.isFinite(point.mile)
    )
    .sort(
      (left, right) =>
        Math.abs(left.mile - currentMile) - Math.abs(right.mile - currentMile)
    )[0]

  return routePoint ? { lat: routePoint.lat, lng: routePoint.lng } : null
}

export function parseCentralRaceDate(dateLabel: string) {
  const parsed = Date.parse(`${dateLabel} 12:00:00 GMT-0500`)
  return Number.isFinite(parsed) ? new Date(parsed) : null
}

export function formatSignedPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`
}

export function statusValueColor(value: number) {
  if (value < 15) return 'text-red-300'
  if (value < 30) return 'text-yellow-200'
  return 'text-emerald-200'
}

export function finishSocStatusLabel(value: number) {
  if (value < 15) return 'Danger'
  if (value < 30) return 'Caution'
  if (value < 45) return 'Good Margin'
  return 'Excellent Margin'
}

export function formatSwapAction(action: PredictiveStrategyResult['swapAdvice']['action']) {
  if (action === 'DELAY_SWAP') return 'Delay Swap'
  if (action === 'SWAP_AT_NEXT_STOP') return 'Prepare Swap'
  if (action === 'SWAP_NOW') return 'Swap Now'
  return 'Continue'
}

function calculateDistanceRollingWhPerMile(
  samples: TelemetryHistorySample[]
): RollingWhPerMileResult | null {
  const distanceSamples = samples.filter(
    (sample): sample is TelemetryHistorySample & { distanceMiles: number } =>
      typeof sample.distanceMiles === 'number' &&
      Number.isFinite(sample.distanceMiles)
  )
  const latest = distanceSamples[distanceSamples.length - 1]

  if (!latest) return null

  const windowStartDistance = latest.distanceMiles - rollingWindowMiles
  const windowSamples = distanceSamples.filter(
    (sample) => sample.distanceMiles >= windowStartDistance
  )
  const distanceMiles =
    latest.distanceMiles - (windowSamples[0]?.distanceMiles ?? latest.distanceMiles)

  if (distanceMiles < minimumRollingDistanceMiles) return null

  const energyWh = integrateEnergyWh(windowSamples)
  const value = clampRollingWhPerMile(energyWh / distanceMiles)

  if (value === null) return null

  return {
    value,
    label: distanceMiles >= rollingWindowMiles ? 'Rolling 10 mi' : 'Rolling partial',
    mode: distanceMiles >= rollingWindowMiles ? 'distance' : 'partial',
  }
}

function calculateTimeWindowRollingWhPerMile(
  samples: TelemetryHistorySample[]
): RollingWhPerMileResult | null {
  const latest = samples[samples.length - 1]
  const windowStartTimestamp = latest.timestamp - rollingFallbackWindowMs
  const windowSamples = samples.filter(
    (sample) =>
      sample.timestamp >= windowStartTimestamp &&
      typeof sample.batteryPowerWatts === 'number' &&
      Number.isFinite(sample.batteryPowerWatts)
  )

  if (windowSamples.length < 2) return null

  const durationMs =
    windowSamples[windowSamples.length - 1].timestamp - windowSamples[0].timestamp

  if (durationMs < minimumRollingDurationMs) return null

  const energyWh = integrateEnergyWh(windowSamples)
  const distanceMiles = integrateDistanceMiles(windowSamples)

  if (distanceMiles < minimumRollingDistanceMiles) return null

  const value = clampRollingWhPerMile(energyWh / distanceMiles)

  if (value === null) return null

  return {
    value,
    label: 'Rolling estimated',
    mode: 'estimated',
  }
}

function integrateEnergyWh(samples: TelemetryHistorySample[]) {
  let energyWh = 0

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    const deltaHours = Math.max(0, current.timestamp - previous.timestamp) / 3_600_000
    const previousEnergy = previous.batteryEnergyUsedWh
    const currentEnergy = current.batteryEnergyUsedWh

    if (
      typeof previousEnergy === 'number' &&
      Number.isFinite(previousEnergy) &&
      typeof currentEnergy === 'number' &&
      Number.isFinite(currentEnergy) &&
      currentEnergy >= previousEnergy
    ) {
      energyWh += currentEnergy - previousEnergy
      continue
    }

    const averagePowerWatts =
      ((previous.batteryPowerWatts ?? 0) + (current.batteryPowerWatts ?? 0)) / 2

    energyWh += Math.max(0, averagePowerWatts) * deltaHours
  }

  return energyWh
}

function integrateMpptChargeEnergyWh(samples: TelemetryHistorySample[]) {
  const chargeSamples = samples
    .filter(
      (sample) =>
        Number.isFinite(sample.timestamp) &&
        typeof sample.mpptChargePowerWatts === 'number' &&
        Number.isFinite(sample.mpptChargePowerWatts)
    )
    .sort((left, right) => left.timestamp - right.timestamp)

  if (chargeSamples.length < 2) return null

  let energyWh = 0

  for (let index = 1; index < chargeSamples.length; index += 1) {
    const previous = chargeSamples[index - 1]
    const current = chargeSamples[index]
    const deltaHours = Math.max(0, current.timestamp - previous.timestamp) / 3_600_000
    const averagePowerWatts =
      ((previous.mpptChargePowerWatts ?? 0) + (current.mpptChargePowerWatts ?? 0)) / 2

    energyWh += Math.max(0, averagePowerWatts) * deltaHours
  }

  return energyWh > 0 ? energyWh : null
}

function integrateDistanceMiles(samples: TelemetryHistorySample[]) {
  let distanceMiles = 0

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    const deltaHours = Math.max(0, current.timestamp - previous.timestamp) / 3_600_000
    const averageSpeedMph = (previous.speedMph + current.speedMph) / 2

    if (averageSpeedMph >= minimumRollingSpeedMph) {
      distanceMiles += averageSpeedMph * deltaHours
    }
  }

  return distanceMiles
}

function clampRollingWhPerMile(value: number) {
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.min(maxReasonableRollingWhPerMile, value)
}

function insufficientRollingWhPerMile(): RollingWhPerMileResult {
  return {
    value: null,
    label: 'Rolling partial',
    mode: 'insufficient',
  }
}

function timelineRiskStyle(risk: RiskLevel) {
  if (risk === 'low') {
    return { color: 'text-emerald-200', barColor: 'bg-emerald-400' }
  }
  if (risk === 'medium') {
    return { color: 'text-yellow-200', barColor: 'bg-yellow-300' }
  }
  if (risk === 'high') {
    return { color: 'text-orange-300', barColor: 'bg-orange-400' }
  }

  return { color: 'text-red-300', barColor: 'bg-red-500' }
}
