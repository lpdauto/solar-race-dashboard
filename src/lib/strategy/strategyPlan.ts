import type { RaceDay, RouteSegment } from '@/data/raceRoute'
import { calculateDrivenOverlapMiles, segmentDistanceMiles } from '@/lib/routeMileage'

export type StrategyPlanPack = 'A' | 'B'

export type StrategyPlanSegmentType =
  | 'drive'
  | 'trailer'
  | 'mandatory_stop'
  | 'lunch'
  | 'evening_charge'
  | 'morning_charge'

export type StrategyPlanSegment = {
  id: string
  name: string
  type: StrategyPlanSegmentType
  distanceMiles?: number
  durationMinutes?: number
  chargingAllowed: boolean
  swapAllowed: boolean
}

export type StrategyPlanDay = {
  dayNumber: number
  segments: StrategyPlanSegment[]
}

export type StrategyPlanInputs = {
  batteryCapacityWh: number
  initialSocA: number
  initialSocB: number
  activePack: StrategyPlanPack
  conservativeWhPerMile: number
  solarArrayWatts: number
  solarDerateFactor: number
  chargeEfficiency: number
  minimumFinalSocTarget: number
  idealFinalSocTarget: number
  maximumFinalSocTarget: number
  raceDays: StrategyPlanDay[]
}

export type StrategyPlanFinalStatus =
  | 'ON_TARGET'
  | 'TOO_CONSERVATIVE'
  | 'TOO_AGGRESSIVE'

export type StrategyPlanSegmentForecast = {
  dayNumber: number
  segmentId: string
  segmentName: string
  segmentType: StrategyPlanSegmentType
  socABefore: number
  socBBefore: number
  socAAfter: number
  socBAfter: number
  activePackBefore: StrategyPlanPack
  activePackAfter: StrategyPlanPack
  driveWh: number
  potentialSolarWh: number
  capturedSolarWh: number
  lostSolarWh: number
  recommendation?: string
  recommendationReason?: string
}

export type StrategyPlanResult = {
  projectedFinalSocA: number
  projectedFinalSocB: number
  finalStatus: StrategyPlanFinalStatus
  totalDriveWh: number
  totalPotentialSolarWh: number
  totalCapturedSolarWh: number
  totalLostSolarWh: number
  segmentForecasts: StrategyPlanSegmentForecast[]
}

const lowActiveSwapThresholdSoc = 25
const meaningfulSwapAdvantageSoc = 10

export const defaultFiveDayStrategyPlanInputs = {
  batteryCapacityWh: 5250,
  conservativeWhPerMile: 110,
  solarArrayWatts: 2160,
  solarDerateFactor: 0.65,
  chargeEfficiency: 0.9,
  minimumFinalSocTarget: 10,
  idealFinalSocTarget: 15,
  maximumFinalSocTarget: 20,
} satisfies Omit<StrategyPlanInputs, 'initialSocA' | 'initialSocB' | 'activePack' | 'raceDays'>

export function projectFiveDayStrategyPlan(
  inputs: StrategyPlanInputs
): StrategyPlanResult {
  const batteryCapacityWh = positiveOrFallback(inputs.batteryCapacityWh, 1)
  let activePack = inputs.activePack
  let energyA = socToWh(inputs.initialSocA, batteryCapacityWh)
  let energyB = socToWh(inputs.initialSocB, batteryCapacityWh)
  let totalDriveWh = 0
  let totalPotentialSolarWh = 0
  let totalCapturedSolarWh = 0
  let totalLostSolarWh = 0
  const segmentForecasts: StrategyPlanSegmentForecast[] = []

  for (const day of inputs.raceDays) {
    for (const segment of day.segments) {
      const socABefore = whToSoc(energyA, batteryCapacityWh)
      const socBBefore = whToSoc(energyB, batteryCapacityWh)
      const activePackBefore = activePack
      let recommendation: string | undefined
      let recommendationReason: string | undefined

      const boundarySwap = recommendBoundarySwap({
        segment,
        activePack,
        energyA,
        energyB,
        batteryCapacityWh,
        inputs,
      })

      if (boundarySwap && segment.swapAllowed) {
        recommendation = boundarySwap.recommendation
        recommendationReason = boundarySwap.reason
        activePack = otherPack(activePack)
      }

      let driveWh = 0
      let potentialSolarWh = 0
      let capturedSolarWh = 0
      let lostSolarWh = 0

      if (segment.type === 'drive') {
        driveWh =
          Math.max(0, segment.distanceMiles ?? 0) *
          Math.max(0, inputs.conservativeWhPerMile)

        if (activePack === 'A') {
          energyA = clampWh(energyA - driveWh, batteryCapacityWh)
        } else {
          energyB = clampWh(energyB - driveWh, batteryCapacityWh)
        }

        totalDriveWh += driveWh
      }

      if (segment.chargingAllowed && segment.durationMinutes) {
        potentialSolarWh = calculatePotentialSolarWh({
          solarArrayWatts: inputs.solarArrayWatts,
          solarDerateFactor: inputs.solarDerateFactor,
          chargeEfficiency: inputs.chargeEfficiency,
          durationMinutes: segment.durationMinutes,
        })
        const chargingPack = otherPack(activePack)
        const chargingPackEnergy = chargingPack === 'A' ? energyA : energyB
        const headroomWh = Math.max(0, batteryCapacityWh - chargingPackEnergy)

        capturedSolarWh = Math.min(potentialSolarWh, headroomWh)
        lostSolarWh = Math.max(0, potentialSolarWh - capturedSolarWh)

        if (chargingPack === 'A') {
          energyA = clampWh(energyA + capturedSolarWh, batteryCapacityWh)
        } else {
          energyB = clampWh(energyB + capturedSolarWh, batteryCapacityWh)
        }

        totalPotentialSolarWh += potentialSolarWh
        totalCapturedSolarWh += capturedSolarWh
        totalLostSolarWh += lostSolarWh
      }

      segmentForecasts.push({
        dayNumber: day.dayNumber,
        segmentId: segment.id,
        segmentName: segment.name,
        segmentType: segment.type,
        socABefore,
        socBBefore,
        socAAfter: whToSoc(energyA, batteryCapacityWh),
        socBAfter: whToSoc(energyB, batteryCapacityWh),
        activePackBefore,
        activePackAfter: activePack,
        driveWh,
        potentialSolarWh,
        capturedSolarWh,
        lostSolarWh,
        recommendation,
        recommendationReason,
      })
    }
  }

  const projectedFinalSocA = whToSoc(energyA, batteryCapacityWh)
  const projectedFinalSocB = whToSoc(energyB, batteryCapacityWh)

  return {
    projectedFinalSocA,
    projectedFinalSocB,
    finalStatus: classifyFinalStatus({
      socA: projectedFinalSocA,
      socB: projectedFinalSocB,
      minimumFinalSocTarget: inputs.minimumFinalSocTarget,
      maximumFinalSocTarget: inputs.maximumFinalSocTarget,
    }),
    totalDriveWh,
    totalPotentialSolarWh,
    totalCapturedSolarWh,
    totalLostSolarWh,
    segmentForecasts,
  }
}

export function createDefaultFiveDayStrategyPlanRaceDays(
  raceDays: RaceDay[]
): StrategyPlanDay[] {
  return raceDays.map((raceDay) => ({
    dayNumber: raceDay.day,
    segments: [
      {
        id: `day-${raceDay.day}-morning-charge`,
        name: `Day ${raceDay.day} morning charge`,
        type: 'morning_charge',
        durationMinutes: 60,
        chargingAllowed: true,
        swapAllowed: true,
      },
      ...raceDay.segments.map((segment, index) =>
        routeSegmentToPlanSegment(raceDay, segment, index)
      ),
      {
        id: `day-${raceDay.day}-lunch`,
        name: `Day ${raceDay.day} lunch control`,
        type: 'lunch',
        durationMinutes: 45,
        chargingAllowed: true,
        swapAllowed: true,
      },
      {
        id: `day-${raceDay.day}-evening-charge`,
        name: `Day ${raceDay.day} evening charge`,
        type: 'evening_charge',
        durationMinutes: 120,
        chargingAllowed: true,
        swapAllowed: true,
      },
    ],
  }))
}

function routeSegmentToPlanSegment(
  raceDay: RaceDay,
  segment: RouteSegment,
  index: number
): StrategyPlanSegment {
  const isTrailer = segment.type === 'mandatory_trailer'
  const distanceMiles = isTrailer
    ? segment.transportMiles ?? segmentDistanceMiles(segment)
    : calculateDrivenOverlapMiles({
        segment,
        raceDay,
        startMile: segment.mileStart,
        endMile: segment.mileEnd,
      })

  return {
    id: `day-${raceDay.day}-segment-${index}`,
    name: segment.title,
    type: isTrailer ? 'trailer' : 'drive',
    distanceMiles,
    durationMinutes: isTrailer ? estimateTrailerDurationMinutes(distanceMiles) : undefined,
    chargingAllowed: isTrailer,
    swapAllowed: true,
  }
}

function recommendBoundarySwap({
  segment,
  activePack,
  energyA,
  energyB,
  batteryCapacityWh,
  inputs,
}: {
  segment: StrategyPlanSegment
  activePack: StrategyPlanPack
  energyA: number
  energyB: number
  batteryCapacityWh: number
  inputs: StrategyPlanInputs
}) {
  const activeEnergy = activePack === 'A' ? energyA : energyB
  const otherEnergy = activePack === 'A' ? energyB : energyA
  const activeSoc = whToSoc(activeEnergy, batteryCapacityWh)
  const otherSoc = whToSoc(otherEnergy, batteryCapacityWh)

  if (segment.type === 'drive' && segment.distanceMiles) {
    const projectedActiveSoc = whToSoc(
      activeEnergy - segment.distanceMiles * Math.max(0, inputs.conservativeWhPerMile),
      batteryCapacityWh
    )

    if (
      projectedActiveSoc < lowActiveSwapThresholdSoc &&
      otherSoc >= activeSoc + meaningfulSwapAdvantageSoc
    ) {
      return {
        recommendation: 'SWAP BEFORE SEGMENT',
        reason: `Active pack projects to ${projectedActiveSoc.toFixed(1)}% before/after this drive; other pack is at least ${meaningfulSwapAdvantageSoc}% higher.`,
      }
    }
  }

  if (segment.chargingAllowed && segment.durationMinutes) {
    const potentialSolarWh = calculatePotentialSolarWh({
      solarArrayWatts: inputs.solarArrayWatts,
      solarDerateFactor: inputs.solarDerateFactor,
      chargeEfficiency: inputs.chargeEfficiency,
      durationMinutes: segment.durationMinutes,
    })
    const nonActiveHeadroomWh = Math.max(0, batteryCapacityWh - otherEnergy)

    if (
      potentialSolarWh > nonActiveHeadroomWh &&
      activeSoc + 0.1 < otherSoc
    ) {
      return {
        recommendation: 'SWAP BEFORE CHARGE',
        reason: `Charging target has only ${nonActiveHeadroomWh.toFixed(0)} Wh headroom versus ${potentialSolarWh.toFixed(0)} Wh potential; swap makes the lower SOC pack the charging target.`,
      }
    }
  }

  return null
}

function calculatePotentialSolarWh({
  solarArrayWatts,
  solarDerateFactor,
  chargeEfficiency,
  durationMinutes,
}: {
  solarArrayWatts: number
  solarDerateFactor: number
  chargeEfficiency: number
  durationMinutes: number
}) {
  return (
    Math.max(0, solarArrayWatts) *
    clampRatio(solarDerateFactor) *
    clampRatio(chargeEfficiency) *
    Math.max(0, durationMinutes / 60)
  )
}

function classifyFinalStatus({
  socA,
  socB,
  minimumFinalSocTarget,
  maximumFinalSocTarget,
}: {
  socA: number
  socB: number
  minimumFinalSocTarget: number
  maximumFinalSocTarget: number
}): StrategyPlanFinalStatus {
  if (socA < minimumFinalSocTarget || socB < minimumFinalSocTarget) {
    return 'TOO_AGGRESSIVE'
  }
  if (socA > maximumFinalSocTarget || socB > maximumFinalSocTarget) {
    return 'TOO_CONSERVATIVE'
  }

  return 'ON_TARGET'
}

function estimateTrailerDurationMinutes(distanceMiles: number) {
  return Math.max(15, Math.round((Math.max(0, distanceMiles) / 45) * 60))
}

function otherPack(pack: StrategyPlanPack): StrategyPlanPack {
  return pack === 'A' ? 'B' : 'A'
}

function socToWh(socPercent: number, batteryCapacityWh: number) {
  return clampWh((clampPercent(socPercent) / 100) * batteryCapacityWh, batteryCapacityWh)
}

function whToSoc(energyWh: number, batteryCapacityWh: number) {
  return clampPercent((clampWh(energyWh, batteryCapacityWh) / batteryCapacityWh) * 100)
}

function clampWh(value: number, batteryCapacityWh: number) {
  if (!Number.isFinite(value)) return 0

  return Math.min(batteryCapacityWh, Math.max(0, value))
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0

  return Math.min(100, Math.max(0, value))
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0

  return Math.min(1, Math.max(0, value))
}

function positiveOrFallback(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}
