export type LatLng = {
  lat: number
  lng: number
}

export type RoutePointWithMile = LatLng & {
  mile: number
  label?: string
  note?: string
}

export type GpsAccuracyClass =
  | 'excellent'
  | 'good'
  | 'fair'
  | 'poor'
  | 'unreliable'

export type RouteMatchConfidence = 'high' | 'medium' | 'low' | 'unreliable'

export type NearestRoutePointResult = {
  nearestPoint: RoutePointWithMile
  distanceMeters: number
  estimatedMile: number
  confidence: RouteMatchConfidence
}

export type RouteSnapResult = {
  estimatedMile: number
  distanceFromRouteMeters: number
  nearestSegmentStart: RoutePointWithMile
  nearestSegmentEnd: RoutePointWithMile
  projectionRatio: number
  confidence: RouteMatchConfidence
}

const EARTH_RADIUS_METERS = 6371000

export function haversineDistanceMeters(a: LatLng, b: LatLng) {
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const deltaLat = toRadians(b.lat - a.lat)
  const deltaLng = toRadians(b.lng - a.lng)

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2
  const centralAngle =
    2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))

  return EARTH_RADIUS_METERS * centralAngle
}

export function findNearestRoutePoint(
  currentLocation: LatLng & { accuracyMeters?: number | null },
  routePoints: RoutePointWithMile[]
): NearestRoutePointResult | null {
  if (routePoints.length === 0) {
    return null
  }

  const nearestPoint = routePoints.reduce((nearest, point) => {
    const nearestDistance = haversineDistanceMeters(currentLocation, nearest)
    const pointDistance = haversineDistanceMeters(currentLocation, point)

    return pointDistance < nearestDistance ? point : nearest
  }, routePoints[0])
  const distanceMeters = haversineDistanceMeters(currentLocation, nearestPoint)
  const accuracyMeters = currentLocation.accuracyMeters ?? Number.POSITIVE_INFINITY

  return {
    nearestPoint,
    distanceMeters,
    estimatedMile: nearestPoint.mile,
    confidence: classifyRouteMatchConfidence(distanceMeters, accuracyMeters),
  }
}

export function estimateCurrentMileFromGps(
  currentLocation: LatLng & { accuracyMeters?: number | null },
  routePoints: RoutePointWithMile[]
) {
  return estimateRouteSnapFromGps(currentLocation, routePoints)?.estimatedMile ?? 0
}

export function estimateRouteSnapFromGps(
  currentLocation: LatLng & { accuracyMeters?: number | null },
  routePoints: RoutePointWithMile[]
): RouteSnapResult | null {
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

  return null
}

export function classifyGpsAccuracy(
  accuracyMeters?: number | null
): GpsAccuracyClass {
  if (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters)) {
    return 'unreliable'
  }

  if (accuracyMeters <= 10) return 'excellent'
  if (accuracyMeters <= 25) return 'good'
  if (accuracyMeters <= 50) return 'fair'
  if (accuracyMeters <= 100) return 'poor'
  return 'unreliable'
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
