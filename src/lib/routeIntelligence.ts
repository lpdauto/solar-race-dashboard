import type { RaceDay, RiskLevel, RouteSegment, SegmentType } from '@/data/raceRoute'
import { rx2Config } from '@/lib/race/rx2Config'
import { getSafeWhPerMile } from '@/lib/safeWhPerMile'

export type RouteRisk = {
  title: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE'
  mileMarker: number
  reason: string
}

export type RouteOpportunity = {
  title: string
  value: 'LOW' | 'MEDIUM' | 'HIGH'
  mileMarker: number
  reason: string
}

export type TraileringOption = {
  action:
    | 'DRIVE'
    | 'CONSERVE_AND_DRIVE'
    | 'TRAILER_OPTIONAL'
    | 'TRAILER_RECOMMENDED'
    | 'TRAILER_REQUIRED'
  reason: string
  affectedMiles: number
  estimatedEnergySavedWh: number
  mileagePenalty: number
  projectedSocIfDriven: number
  projectedSocIfTrailered: number
}

export type RouteIntelligenceSummary = {
  lookaheadMiles: number
  risks: RouteRisk[]
  opportunities: RouteOpportunity[]
  traileringOption: TraileringOption
  isTraileringActive: boolean
  elevationAdjusted?: boolean
  elevationWarnings?: string[]
}

const defaultLookaheadMiles = 15

const riskSeverityRank: Record<RouteRisk['severity'], number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  SEVERE: 4,
}

const opportunityValueRank: Record<RouteOpportunity['value'], number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
}

const riskEnergyMultiplier: Record<RiskLevel, number> = {
  low: 1,
  medium: 1.1,
  high: 1.25,
  severe: 1.4,
}

const segmentTypeEnergyMultiplier: Record<SegmentType, number> = {
  flat: 1,
  climb: 1.18,
  descent: 0.82,
  town: 1.12,
  caution: 1.08,
  stop: 1.15,
}

export function analyzeRouteIntelligence({
  raceDay,
  currentMile,
  currentSocPercent,
  baselineWhPerMile,
  batteryCapacityWh = rx2Config.mainBatteryUsableWh,
  reserveSocPercent = rx2Config.reserveSocPercent,
  absoluteMinimumSocPercent = rx2Config.absoluteMinimumSocPercent,
  isFinalDay = false,
  lookaheadMiles = defaultLookaheadMiles,
  isTraileringActive = false,
  elevationAdjusted = false,
  elevationWarnings = [],
}: {
  raceDay: RaceDay
  currentMile: number
  currentSocPercent: number
  baselineWhPerMile: number
  batteryCapacityWh?: number
  reserveSocPercent?: number
  absoluteMinimumSocPercent?: number
  isFinalDay?: boolean
  lookaheadMiles?: number
  isTraileringActive?: boolean
  elevationAdjusted?: boolean
  elevationWarnings?: string[]
}): RouteIntelligenceSummary {
  const safeBaselineWhPerMile = getSafeWhPerMile(
    baselineWhPerMile,
    rx2Config.defaultRaceWhPerMile
  ).value
  const lookaheadEndMile = Math.min(raceDay.distanceMiles, currentMile + lookaheadMiles)
  const segments = raceDay.segments.filter(
    (segment) =>
      segment.mileEnd > currentMile && segment.mileStart < lookaheadEndMile
  )
  const risks = summarizeRisks(segments, currentMile, lookaheadEndMile)
  const opportunities = summarizeOpportunities(segments, currentMile, lookaheadEndMile)
  const traileringOption = estimateTraileringOption({
    segments,
    currentMile,
    lookaheadEndMile,
    currentSocPercent,
    baselineWhPerMile: safeBaselineWhPerMile,
    batteryCapacityWh,
    reserveSocPercent,
    absoluteMinimumSocPercent,
    isFinalDay,
    isTraileringActive,
  })

  return {
    lookaheadMiles,
    risks,
    opportunities,
    traileringOption,
    isTraileringActive,
    elevationAdjusted,
    elevationWarnings,
  }
}

function summarizeRisks(
  segments: RouteSegment[],
  currentMile: number,
  lookaheadEndMile: number
) {
  const risks = segments.flatMap((segment): RouteRisk[] => {
    const reasons: RouteRisk[] = []
    const severity = routeRiskSeverity(segment)

    if (segment.type === 'climb' && (segment.risk === 'high' || segment.risk === 'severe')) {
      reasons.push({
        title: segment.title,
        severity,
        mileMarker: Math.max(currentMile, segment.mileStart),
        reason: `${segment.risk} climb can raise current draw and battery heat.`,
      })
    } else if (segment.type === 'caution') {
      reasons.push({
        title: segment.title,
        severity,
        mileMarker: Math.max(currentMile, segment.mileStart),
        reason: 'Caution segment increases navigation, traffic, or convoy workload.',
      })
    } else if (segment.type === 'town') {
      reasons.push({
        title: segment.title,
        severity: segment.risk === 'high' || segment.risk === 'severe' ? 'HIGH' : 'MEDIUM',
        mileMarker: Math.max(currentMile, segment.mileStart),
        reason: 'Town section adds operational risk from traffic and stop-start driving.',
      })
    } else if (segment.risk === 'high' || segment.risk === 'severe') {
      reasons.push({
        title: segment.title,
        severity,
        mileMarker: Math.max(currentMile, segment.mileStart),
        reason: segment.notes,
      })
    }

    return reasons
  })

  const repeatedHighRiskCount = risks.filter(
    (risk) => risk.severity === 'HIGH' || risk.severity === 'SEVERE'
  ).length

  if (repeatedHighRiskCount >= 2) {
    risks.unshift({
      title: 'Stacked high-risk lookahead',
      severity: 'SEVERE',
      mileMarker: currentMile,
      reason: `Multiple high-risk route sections appear before mile ${lookaheadEndMile.toFixed(1)}.`,
    })
  }

  return risks.sort(sortRisks).slice(0, 6)
}

function summarizeOpportunities(
  segments: RouteSegment[],
  currentMile: number,
  lookaheadEndMile: number
) {
  return segments
    .flatMap((segment): RouteOpportunity[] => {
      if (segment.type === 'descent') {
        return [{
          title: segment.title,
          value: segment.risk === 'medium' ? 'MEDIUM' : 'HIGH',
          mileMarker: Math.max(currentMile, segment.mileStart),
          reason: 'Descent can reduce net energy use through coasting and controlled regen.',
        }]
      }

      if (segment.type === 'flat' && segment.risk === 'low') {
        return [{
          title: segment.title,
          value: 'MEDIUM',
          mileMarker: Math.max(currentMile, segment.mileStart),
          reason: 'Flat low-risk section supports stable pacing and clean Wh/mile tracking.',
        }]
      }

      if (segment.type === 'stop' || segment.type === 'town') {
        return [{
          title: segment.title,
          value: segment.mileStart <= lookaheadEndMile ? 'MEDIUM' : 'LOW',
          mileMarker: Math.max(currentMile, segment.mileStart),
          reason: 'Nearby stop or town can support driver, checkpoint, and systems planning.',
        }]
      }

      return []
    })
    .sort(sortOpportunities)
    .slice(0, 6)
}

function estimateTraileringOption({
  segments,
  currentMile,
  lookaheadEndMile,
  currentSocPercent,
  baselineWhPerMile,
  batteryCapacityWh,
  reserveSocPercent,
  absoluteMinimumSocPercent,
  isFinalDay,
  isTraileringActive,
}: {
  segments: RouteSegment[]
  currentMile: number
  lookaheadEndMile: number
  currentSocPercent: number
  baselineWhPerMile: number
  batteryCapacityWh: number
  reserveSocPercent: number
  absoluteMinimumSocPercent: number
  isFinalDay: boolean
  isTraileringActive: boolean
}): TraileringOption {
  const highEnergySegments = segments.filter(
    (segment) =>
      segment.type === 'climb' ||
      segment.risk === 'high' ||
      segment.risk === 'severe'
  )
  const candidateSegments = highEnergySegments.length > 0 ? highEnergySegments : segments
  const affectedMiles = candidateSegments.reduce(
    (totalMiles, segment) =>
      totalMiles + segmentOverlapMiles(segment, currentMile, lookaheadEndMile),
    0
  )
  const estimatedEnergySavedWh = candidateSegments.reduce(
    (totalWh, segment) =>
      totalWh +
      estimateSegmentWh({
        segment,
        currentMile,
        lookaheadEndMile,
        baselineWhPerMile,
      }),
    0
  )
  const lookaheadEnergyWh = segments.reduce(
    (totalWh, segment) =>
      totalWh +
      estimateSegmentWh({
        segment,
        currentMile,
        lookaheadEndMile,
        baselineWhPerMile,
      }),
    0
  )
  const projectedSocIfDriven = projectSocAfterUse({
    socPercent: currentSocPercent,
    usableWh: batteryCapacityWh,
    expectedWh: lookaheadEnergyWh,
  })
  const projectedSocIfTrailered = projectSocAfterUse({
    socPercent: currentSocPercent,
    usableWh: batteryCapacityWh,
    expectedWh: Math.max(0, lookaheadEnergyWh - estimatedEnergySavedWh),
  })
  const action = classifyTraileringAction({
    segments: candidateSegments,
    projectedSocIfDriven,
    projectedSocIfTrailered,
    reserveSocPercent,
    absoluteMinimumSocPercent,
    isFinalDay,
    affectedMiles,
    estimatedEnergySavedWh,
    isTraileringActive,
  })

  return {
    action,
    reason: traileringReason({
      action,
      projectedSocIfDriven,
      projectedSocIfTrailered,
      reserveSocPercent,
      affectedMiles,
      isTraileringActive,
    }),
    affectedMiles,
    estimatedEnergySavedWh,
    mileagePenalty: affectedMiles,
    projectedSocIfDriven,
    projectedSocIfTrailered,
  }
}

function classifyTraileringAction({
  segments,
  projectedSocIfDriven,
  projectedSocIfTrailered,
  reserveSocPercent,
  absoluteMinimumSocPercent,
  isFinalDay,
  affectedMiles,
  estimatedEnergySavedWh,
  isTraileringActive,
}: {
  segments: RouteSegment[]
  projectedSocIfDriven: number
  projectedSocIfTrailered: number
  reserveSocPercent: number
  absoluteMinimumSocPercent: number
  isFinalDay: boolean
  affectedMiles: number
  estimatedEnergySavedWh: number
  isTraileringActive: boolean
}): TraileringOption['action'] {
  if (isTraileringActive) return 'TRAILER_OPTIONAL'

  if (isFinalDay) {
    if (projectedSocIfDriven < absoluteMinimumSocPercent) {
      return 'TRAILER_REQUIRED'
    }
    if (
      segments.some((segment) => segment.risk === 'severe') &&
      projectedSocIfDriven < reserveSocPercent
    ) {
      return 'TRAILER_RECOMMENDED'
    }

    return 'DRIVE'
  }

  const hasHighRiskClimb = segments.some(
    (segment) =>
      segment.type === 'climb' &&
      (segment.risk === 'high' || segment.risk === 'severe')
  )
  const hasSevereRisk = segments.some((segment) => segment.risk === 'severe')
  const hasHighEnergySection = hasHighRiskClimb || hasSevereRisk
  const highEnergyButSafe =
    hasHighEnergySection &&
    estimatedEnergySavedWh > rx2Config.mainBatteryUsableWh * 0.08 &&
    projectedSocIfDriven >= reserveSocPercent

  if (projectedSocIfDriven < reserveSocPercent - 5) return 'TRAILER_REQUIRED'
  if (
    hasHighRiskClimb &&
    projectedSocIfDriven < reserveSocPercent &&
    projectedSocIfTrailered >= reserveSocPercent
  ) {
    return 'TRAILER_RECOMMENDED'
  }
  if (projectedSocIfDriven < reserveSocPercent) return 'TRAILER_RECOMMENDED'
  if (hasSevereRisk && highEnergyButSafe) return 'TRAILER_OPTIONAL'
  if (highEnergyButSafe || (hasHighRiskClimb && affectedMiles > 0)) {
    return 'CONSERVE_AND_DRIVE'
  }

  return 'DRIVE'
}

function traileringReason({
  action,
  projectedSocIfDriven,
  projectedSocIfTrailered,
  reserveSocPercent,
  affectedMiles,
  isTraileringActive,
}: {
  action: TraileringOption['action']
  projectedSocIfDriven: number
  projectedSocIfTrailered: number
  reserveSocPercent: number
  affectedMiles: number
  isTraileringActive: boolean
}) {
  if (isTraileringActive) {
    return 'Trailering is active. Current movement may preserve battery, but these miles are tracked as non-counting race mileage.'
  }

  if (action === 'TRAILER_REQUIRED') {
    return 'Driving the lookahead is projected below reserve; trailering may be required to protect the pack, but those miles do not count.'
  }
  if (action === 'TRAILER_RECOMMENDED') {
    return 'Trailering the high-energy section preserves enough SOC to stay above reserve, with a race-mileage penalty.'
  }
  if (action === 'TRAILER_OPTIONAL') {
    return 'Severe route risk is ahead, but SOC remains above reserve; trailering is an optional tradeoff.'
  }
  if (action === 'CONSERVE_AND_DRIVE') {
    return `Drive the ${affectedMiles.toFixed(1)} affected miles conservatively; projected SOC remains above the ${reserveSocPercent}% reserve.`
  }

  return `Drive the lookahead; projected SOC remains ${projectedSocIfDriven.toFixed(1)}% versus ${projectedSocIfTrailered.toFixed(1)}% if trailered.`
}

function routeRiskSeverity(segment: RouteSegment): RouteRisk['severity'] {
  if (segment.risk === 'severe') return 'SEVERE'
  if (segment.risk === 'high') return 'HIGH'
  if (segment.risk === 'medium') return 'MEDIUM'
  return 'LOW'
}

function estimateSegmentWh({
  segment,
  currentMile,
  lookaheadEndMile,
  baselineWhPerMile,
}: {
  segment: RouteSegment
  currentMile: number
  lookaheadEndMile: number
  baselineWhPerMile: number
}) {
  return (
    segmentOverlapMiles(segment, currentMile, lookaheadEndMile) *
    baselineWhPerMile *
    riskEnergyMultiplier[segment.risk] *
    segmentTypeEnergyMultiplier[segment.type]
  )
}

function segmentOverlapMiles(
  segment: RouteSegment,
  currentMile: number,
  lookaheadEndMile: number
) {
  return Math.max(
    0,
    Math.min(segment.mileEnd, lookaheadEndMile) -
      Math.max(segment.mileStart, currentMile)
  )
}

function projectSocAfterUse({
  socPercent,
  usableWh,
  expectedWh,
}: {
  socPercent: number
  usableWh: number
  expectedWh: number
}) {
  const socUsed = usableWh > 0 ? (Math.max(0, expectedWh) / usableWh) * 100 : 100

  return Math.min(100, Math.max(0, socPercent - socUsed))
}

function sortRisks(left: RouteRisk, right: RouteRisk) {
  return (
    riskSeverityRank[right.severity] - riskSeverityRank[left.severity] ||
    left.mileMarker - right.mileMarker
  )
}

function sortOpportunities(left: RouteOpportunity, right: RouteOpportunity) {
  return (
    opportunityValueRank[right.value] - opportunityValueRank[left.value] ||
    left.mileMarker - right.mileMarker
  )
}
