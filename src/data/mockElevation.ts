import type { RoutePoint } from '@/data/raceRoute'
import type { ElevationPoint } from '@/lib/elevation'

const mockElevationFeetByDay: Record<number, number[]> = {
  1: [650, 820, 1055, 760, 640, 455, 505],
  2: [505, 430, 500, 375, 470, 610, 735],
  3: [735, 1035, 1320, 845, 1245, 1715],
  4: [1715, 1530, 1660, 2050, 1845],
  5: [1845, 2210, 2700, 2550, 2440, 2920],
}

export function getMockElevationProfile(
  day: number,
  routePoints: RoutePoint[]
): ElevationPoint[] {
  const fallback = mockElevationFeetByDay[day] ?? []

  return routePoints.map((point, index) => ({
    ...point,
    elevationFeet:
      fallback[index] ??
      fallback[fallback.length - 1] ??
      900 + Math.round(index * 90),
    gradePercent: undefined,
  }))
}
