import type { TelemetryData } from '@/types/telemetry'

export type LiveTelemetryGpsPosition = {
  lat: number
  lng: number
  fix: boolean
  ageMs?: number
  satellites?: number
  heading?: number
  elevationFt?: number
}

export function getLiveTelemetryGpsPosition(
  telemetry: Pick<
    TelemetryData,
    | 'gpsLat'
    | 'gpsLng'
    | 'gpsFix'
    | 'gpsValid'
    | 'gpsLocationValid'
    | 'gpsAgeMs'
    | 'gpsLastUpdateAgeMs'
    | 'gpsSatellites'
    | 'gpsHeading'
    | 'gpsElevationFt'
  > | null | undefined
): LiveTelemetryGpsPosition | null {
  const lat = telemetry?.gpsLat
  const lng = telemetry?.gpsLng
  const ageMs = finiteNumber(telemetry?.gpsAgeMs ?? telemetry?.gpsLastUpdateAgeMs)

  if (
    !hasValidGpsCoordinates(lat, lng) ||
    isNullIslandPlaceholder(lat, lng) ||
    telemetry?.gpsFix === false ||
    telemetry?.gpsValid === false ||
    telemetry?.gpsLocationValid === false ||
    (ageMs !== undefined && ageMs > 5 * 60 * 1000)
  ) {
    return null
  }

  const liveLat = lat as number
  const liveLng = lng as number
  const hasReportedFix =
    telemetry?.gpsFix === true ||
    telemetry?.gpsValid === true ||
    telemetry?.gpsLocationValid === true

  return {
    lat: liveLat,
    lng: liveLng,
    fix: hasReportedFix || hasValidGpsCoordinates(liveLat, liveLng),
    ageMs,
    satellites: finiteNumber(telemetry?.gpsSatellites),
    heading: finiteNumber(telemetry?.gpsHeading),
    elevationFt: finiteNumber(telemetry?.gpsElevationFt),
  }
}

export function hasValidGpsCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined
) {
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  )
}

function isNullIslandPlaceholder(
  latitude: number | null | undefined,
  longitude: number | null | undefined
) {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Math.abs(latitude) < 0.000001 &&
    Math.abs(longitude) < 0.000001
  )
}

function finiteNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
