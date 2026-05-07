import type { RaceDay, RiskLevel, RoutePoint, RouteSegment } from '@/data/raceRoute'

export type MapSeverity = RiskLevel

type RoutePointWithGrade = RoutePoint & {
  gradePercent?: number
}

export function getSeverityColor(riskLevel: MapSeverity) {
  if (riskLevel === 'low') return '#22c55e'
  if (riskLevel === 'medium') return '#facc15'
  if (riskLevel === 'high') return '#fb923c'
  return '#ef4444'
}

export function classifyElevationSeverityFromGrade(gradePercent: number): MapSeverity {
  const absoluteGrade = Math.abs(gradePercent)

  if (absoluteGrade < 2) return 'low'
  if (absoluteGrade < 4) return 'medium'
  if (absoluteGrade < 6) return 'high'
  return 'severe'
}

export function classifyRouteSegmentSeverity(
  pointA: RoutePointWithGrade,
  pointB: RoutePointWithGrade,
  daySegments: RouteSegment[],
  fallbackRisk: RiskLevel = 'low'
): MapSeverity {
  const midpointMile = (pointA.mile + pointB.mile) / 2
  const explicitSegment = daySegments.find(
    (segment) =>
      midpointMile >= segment.mileStart && midpointMile <= segment.mileEnd
  )

  if (explicitSegment) return explicitSegment.risk

  const grade = pointB.gradePercent ?? pointA.gradePercent

  if (typeof grade === 'number') {
    return classifyElevationSeverityFromGrade(grade)
  }

  return fallbackRisk
}

export function findSegmentForMile(day: RaceDay, mile: number) {
  return (
    day.segments.find(
      (segment) => mile >= segment.mileStart && mile <= segment.mileEnd
    ) ?? null
  )
}

export function getDayBounds(days: RaceDay[]) {
  return days.flatMap((day) =>
    day.routePoints.map((point) => [point.lat, point.lng] as [number, number])
  )
}

export function getCurrentDayBounds(day: RaceDay) {
  return day.routePoints.map((point) => [point.lat, point.lng] as [number, number])
}
