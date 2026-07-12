import type { RaceDay, RouteSegment } from '@/data/raceRoute'

export const mandatoryTraileringLegendLabel = 'Mandatory trailering'
export const mandatoryTraileringMapColor = '#a78bfa'

export function mandatoryTrailerSegments(raceDay: RaceDay) {
  return raceDay.segments.filter(
    (segment) => segment.type === 'mandatory_trailer'
  )
}

export function calculateMandatoryTraileringMiles(raceDay: RaceDay) {
  return mandatoryTrailerSegments(raceDay).reduce(
    (total, segment) =>
      total + (segment.transportMiles ?? segmentDistanceMiles(segment)),
    0
  )
}

export function calculateScoringMiles(raceDay: RaceDay) {
  return (
    raceDay.scoringDistanceMiles ??
    Math.max(0, raceDay.distanceMiles - calculateMandatoryTraileringMiles(raceDay))
  )
}

export function calculatePhysicalMiles(raceDay: RaceDay) {
  return (
    raceDay.physicalDistanceMiles ??
    calculateScoringMiles(raceDay) + calculateMandatoryTraileringMiles(raceDay)
  )
}

export function calculateScoringMilesRemaining({
  raceDay,
  currentMile,
}: {
  raceDay: RaceDay
  currentMile: number
}) {
  return Math.max(0, calculateScoringMiles(raceDay) - currentMile)
}

export function segmentDistanceMiles(segment: RouteSegment) {
  return Math.max(0, segment.mileEnd - segment.mileStart)
}

export function calculateDrivenOverlapMiles({
  segment,
  raceDay,
  startMile,
  endMile,
}: {
  segment: RouteSegment
  raceDay: RaceDay
  startMile: number
  endMile: number
}) {
  const overlapMiles = Math.max(0, endMile - startMile)

  if (segment.type === 'mandatory_trailer') return 0

  const mandatoryOverlap = mandatoryTrailerSegments(raceDay).reduce(
    (total, trailerSegment) =>
      total + segmentOverlapMiles(trailerSegment, startMile, endMile),
    0
  )

  return Math.max(0, overlapMiles - mandatoryOverlap)
}

function segmentOverlapMiles(
  segment: Pick<RouteSegment, 'mileStart' | 'mileEnd'>,
  startMile: number,
  endMile: number
) {
  return Math.max(
    0,
    Math.min(segment.mileEnd, endMile) - Math.max(segment.mileStart, startMile)
  )
}
