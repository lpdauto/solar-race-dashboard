import type { RaceDay, RouteSegment } from '@/data/raceRoute'

export type KmlRouteSegment = {
  segmentId: string
  segmentName: string
  segmentType: 'driving' | 'trailer'
  day: number
  cumulativeStartMiles: number
  cumulativeEndMiles: number
  segmentMiles: number
}

export type KmlRouteData = {
  stats: {
    totalRouteMiles: number
    totalDrivingMiles: number
    totalTrailerMiles: number
  }
  segments: KmlRouteSegment[]
}

export type MappedRaceSegment = {
  day: number
  appSegmentId: string
  appSegmentTitle: string
  appMileStart: number
  appMileEnd: number
  kmlMileStart: number
  kmlMileEnd: number
  kmlDrivingMileStart: number
  kmlDrivingMileEnd: number
  segmentType: RouteSegment['type']
  risk: RouteSegment['risk']
  terrainSummary: string
  strategy: string
  mappingConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
  mappingNotes: string[]
}

export type DayMappingSummary = {
  day: number
  appMiles: number
  kmlDrivingMiles: number
  kmlTotalMiles: number
  kmlTrailerMiles: number
  drivingMileageDifference: number
  mappingConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
  mappedSegmentCount: number
}

export type MappedRaceSegmentsOutput = {
  generatedAt: string
  mappingMethod: string
  notes: string[]
  daySummaries: DayMappingSummary[]
  mappedSegments: MappedRaceSegment[]
}

export function mapRaceSegmentsToKmlMileage({
  raceRoute,
  routeData,
}: {
  raceRoute: RaceDay[]
  routeData: KmlRouteData
}): MappedRaceSegmentsOutput {
  const daySummaries = raceRoute.map((raceDay) =>
    createDayMappingSummary(raceDay, routeData.segments)
  )
  const mappedSegments = raceRoute.flatMap((raceDay) => {
    const daySummary = daySummaries.find((summary) => summary.day === raceDay.day)

    if (!daySummary) return []

    return raceDay.segments.map((segment, index) =>
      mapSegment({
        raceDay,
        segment,
        segmentIndex: index,
        daySummary,
      })
    )
  })

  return {
    generatedAt: new Date().toISOString(),
    mappingMethod:
      'Proportional per-day mapping from app semantic segment mile ranges onto KML-derived driving mileage.',
    notes: [
      'KML driving mileage is treated as the geometry/mileage authority.',
      'raceRoute.ts remains the semantic strategy, terrain, and risk authority.',
      'Mapping is proportional and does not yet snap segment boundaries to GPS turns, stops, or intersections.',
      'Trailer mileage is preserved in day summaries but excluded from kmlDrivingMileStart/kmlDrivingMileEnd because trailered miles do not count as official driven race mileage.',
    ],
    daySummaries,
    mappedSegments,
  }
}

function createDayMappingSummary(
  raceDay: RaceDay,
  kmlSegments: KmlRouteSegment[]
): DayMappingSummary {
  const daySegments = kmlSegments.filter((segment) => segment.day === raceDay.day)
  const kmlDrivingMiles = daySegments
    .filter((segment) => segment.segmentType === 'driving')
    .reduce((total, segment) => total + segment.segmentMiles, 0)
  const kmlTrailerMiles = daySegments
    .filter((segment) => segment.segmentType === 'trailer')
    .reduce((total, segment) => total + segment.segmentMiles, 0)
  const kmlTotalMiles = kmlDrivingMiles + kmlTrailerMiles
  const drivingMileageDifference = kmlDrivingMiles - raceDay.distanceMiles

  return {
    day: raceDay.day,
    appMiles: roundMiles(raceDay.distanceMiles),
    kmlDrivingMiles: roundMiles(kmlDrivingMiles),
    kmlTotalMiles: roundMiles(kmlTotalMiles),
    kmlTrailerMiles: roundMiles(kmlTrailerMiles),
    drivingMileageDifference: roundMiles(drivingMileageDifference),
    mappingConfidence: confidenceForDifference(
      Math.abs(drivingMileageDifference),
      raceDay.distanceMiles
    ),
    mappedSegmentCount: raceDay.segments.length,
  }
}

function mapSegment({
  raceDay,
  segment,
  segmentIndex,
  daySummary,
}: {
  raceDay: RaceDay
  segment: RouteSegment
  segmentIndex: number
  daySummary: DayMappingSummary
}): MappedRaceSegment {
  const appStartRatio = safeRatio(segment.mileStart, raceDay.distanceMiles)
  const appEndRatio = safeRatio(segment.mileEnd, raceDay.distanceMiles)
  const kmlDrivingMileStart = appStartRatio * daySummary.kmlDrivingMiles
  const kmlDrivingMileEnd = appEndRatio * daySummary.kmlDrivingMiles
  const kmlMileStart = appStartRatio * daySummary.kmlTotalMiles
  const kmlMileEnd = appEndRatio * daySummary.kmlTotalMiles

  return {
    day: raceDay.day,
    appSegmentId: `day-${raceDay.day}-app-segment-${segmentIndex + 1}`,
    appSegmentTitle: segment.title,
    appMileStart: roundMiles(segment.mileStart),
    appMileEnd: roundMiles(segment.mileEnd),
    kmlMileStart: roundMiles(kmlMileStart),
    kmlMileEnd: roundMiles(kmlMileEnd),
    kmlDrivingMileStart: roundMiles(kmlDrivingMileStart),
    kmlDrivingMileEnd: roundMiles(kmlDrivingMileEnd),
    segmentType: segment.type,
    risk: segment.risk,
    terrainSummary: segment.notes,
    strategy: segment.strategy,
    mappingConfidence: daySummary.mappingConfidence,
    mappingNotes: [
      'Mapped proportionally by app segment mile range within the app day distance.',
      `Day ${raceDay.day} app miles ${daySummary.appMiles}; KML driving miles ${daySummary.kmlDrivingMiles}; difference ${daySummary.drivingMileageDifference} mi.`,
      'This is not exact GPS turn-by-turn matching.',
    ],
  }
}

function confidenceForDifference(
  absoluteDifferenceMiles: number,
  appMiles: number
): 'HIGH' | 'MEDIUM' | 'LOW' {
  const differencePercent = appMiles > 0 ? absoluteDifferenceMiles / appMiles : 1

  if (absoluteDifferenceMiles <= 3 || differencePercent <= 0.02) return 'HIGH'
  if (absoluteDifferenceMiles <= 7 || differencePercent <= 0.05) return 'MEDIUM'
  return 'LOW'
}

function safeRatio(value: number, denominator: number) {
  return denominator > 0 ? value / denominator : 0
}

function roundMiles(value: number) {
  return Number(value.toFixed(4))
}
