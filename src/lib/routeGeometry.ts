import type {
  LatLng,
  RouteMatchConfidence,
  RoutePointWithMile,
} from '@/lib/geo'
import { findNearestRoutePoint, haversineDistanceMeters } from '@/lib/geo'

export type RouteProjectionResult = {
  estimatedMile: number
  distanceFromRouteMeters: number
  nearestSegmentStart: RoutePointWithMile
  nearestSegmentEnd: RoutePointWithMile
  projectionRatio: number
  confidence: RouteMatchConfidence
}

type LocalPoint = {
  x: number
  y: number
}

const METERS_PER_DEGREE_LAT = 111320

export function projectGpsToRoutePolyline(
  currentLocation: LatLng & { accuracyMeters?: number | null },
  routePoints: RoutePointWithMile[]
): RouteProjectionResult | null {
  if (routePoints.length === 0) {
    return null
  }

  if (routePoints.length < 2) {
    const nearest = findNearestRoutePoint(currentLocation, routePoints)

    if (!nearest) {
      return null
    }

    return {
      estimatedMile: nearest.estimatedMile,
      distanceFromRouteMeters: nearest.distanceMeters,
      nearestSegmentStart: nearest.nearestPoint,
      nearestSegmentEnd: nearest.nearestPoint,
      projectionRatio: 0,
      confidence: nearest.confidence,
    }
  }

  const origin = currentLocation
  const currentLocal = toLocalMeters(currentLocation, origin)
  let best: RouteProjectionResult | null = null

  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const start = routePoints[index]
    const end = routePoints[index + 1]
    const startLocal = toLocalMeters(start, origin)
    const endLocal = toLocalMeters(end, origin)
    const projection = projectPointToSegment(currentLocal, startLocal, endLocal)
    const projectedLatLng = localMetersToLatLng(projection.point, origin)
    const distanceFromRouteMeters = haversineDistanceMeters(
      currentLocation,
      projectedLatLng
    )
    const estimatedMile =
      start.mile + (end.mile - start.mile) * projection.ratio
    const accuracyMeters =
      currentLocation.accuracyMeters ?? Number.POSITIVE_INFINITY
    const candidate: RouteProjectionResult = {
      estimatedMile,
      distanceFromRouteMeters,
      nearestSegmentStart: start,
      nearestSegmentEnd: end,
      projectionRatio: projection.ratio,
      confidence: classifyRouteMatchConfidence(
        distanceFromRouteMeters,
        accuracyMeters
      ),
    }

    if (
      !best ||
      candidate.distanceFromRouteMeters < best.distanceFromRouteMeters
    ) {
      best = candidate
    }
  }

  return best
}

function projectPointToSegment(
  point: LocalPoint,
  segmentStart: LocalPoint,
  segmentEnd: LocalPoint
) {
  const segmentX = segmentEnd.x - segmentStart.x
  const segmentY = segmentEnd.y - segmentStart.y
  const segmentLengthSquared = segmentX ** 2 + segmentY ** 2

  if (segmentLengthSquared === 0) {
    return {
      ratio: 0,
      point: segmentStart,
    }
  }

  const rawRatio =
    ((point.x - segmentStart.x) * segmentX +
      (point.y - segmentStart.y) * segmentY) /
    segmentLengthSquared
  const ratio = Math.min(1, Math.max(0, rawRatio))

  return {
    ratio,
    point: {
      x: segmentStart.x + segmentX * ratio,
      y: segmentStart.y + segmentY * ratio,
    },
  }
}

function toLocalMeters(point: LatLng, origin: LatLng): LocalPoint {
  const metersPerDegreeLng =
    METERS_PER_DEGREE_LAT * Math.cos(toRadians(origin.lat))

  return {
    x: (point.lng - origin.lng) * metersPerDegreeLng,
    y: (point.lat - origin.lat) * METERS_PER_DEGREE_LAT,
  }
}

function localMetersToLatLng(point: LocalPoint, origin: LatLng): LatLng {
  const metersPerDegreeLng =
    METERS_PER_DEGREE_LAT * Math.cos(toRadians(origin.lat))

  return {
    lat: origin.lat + point.y / METERS_PER_DEGREE_LAT,
    lng: origin.lng + point.x / metersPerDegreeLng,
  }
}

function classifyRouteMatchConfidence(
  distanceMeters: number,
  accuracyMeters: number
): RouteMatchConfidence {
  if (distanceMeters <= 30 && accuracyMeters <= 25) return 'high'
  if (distanceMeters <= 75 && accuracyMeters <= 50) return 'medium'
  if (distanceMeters <= 150 && accuracyMeters <= 100) return 'low'
  return 'unreliable'
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180
}
