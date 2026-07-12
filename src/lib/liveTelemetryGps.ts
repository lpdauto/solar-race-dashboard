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
    | 'gpsAgeMs'
    | 'gpsSatellites'
    | 'gpsHeading'
    | 'gpsElevationFt'
  > | null | undefined
): LiveTelemetryGpsPosition | null {
  const lat = telemetry?.gpsLat
  const lng = telemetry?.gpsLng

  if (!hasValidGpsCoordinates(lat, lng)) {
    return null
  }

  const liveLat = lat as number
  const liveLng = lng as number

  return {
    lat: liveLat,
    lng: liveLng,
    fix: telemetry?.gpsFix === true || hasValidGpsCoordinates(liveLat, liveLng),
    ageMs: finiteNumber(telemetry?.gpsAgeMs),
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

function finiteNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
