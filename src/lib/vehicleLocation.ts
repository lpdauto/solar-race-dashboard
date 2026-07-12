export type VehicleLocationStatus = 'online' | 'stale' | 'offline' | 'searching'

export type VehicleLocationSource = 'phone' | 'none'

export interface VehicleLocation {
  latitude: number | null
  longitude: number | null
  speedMps: number | null
  speedMph: number | null
  heading: number | null
  altitudeMeters: number | null
  altitudeFeet: number | null
  accuracyMeters: number | null
  altitudeAccuracyMeters: number | null
  clientTimestamp: number | null
  serverTimestamp: number | null
  ageMs: number | null
  status: VehicleLocationStatus
  providerName: string | null
  source: VehicleLocationSource
}

export type VehicleLocationGpsProviderStatus = {
  activeProvider: {
    deviceName: string
  } | null
  latest: {
    deviceName: string
    latitude: number
    longitude: number
    speedMps: number | null
    speedMph: number | null
    headingDegrees: number | null
    altitudeMeters: number | null
    altitudeFeet: number | null
    accuracyMeters: number | null
    altitudeAccuracyMeters: number | null
    browserTimestamp: number
    serverReceivedAt: string
  } | null
  gpsAgeMs: number | null
}

export const emptyVehicleLocation: VehicleLocation = {
  latitude: null,
  longitude: null,
  speedMps: null,
  speedMph: null,
  heading: null,
  altitudeMeters: null,
  altitudeFeet: null,
  accuracyMeters: null,
  altitudeAccuracyMeters: null,
  clientTimestamp: null,
  serverTimestamp: null,
  ageMs: null,
  status: 'offline',
  providerName: null,
  source: 'none',
}

export function normalizeVehicleLocationFromGpsProviderStatus(
  status: VehicleLocationGpsProviderStatus | null | undefined,
  now = new Date()
): VehicleLocation {
  const latest = status?.latest ?? null

  if (!latest) {
    return {
      ...emptyVehicleLocation,
      status: status?.activeProvider ? 'searching' : 'offline',
      providerName: status?.activeProvider?.deviceName ?? null,
    }
  }

  const serverTimestamp = parseTimestamp(latest.serverReceivedAt)
  const ageMs =
    typeof status?.gpsAgeMs === 'number' && Number.isFinite(status.gpsAgeMs)
      ? Math.max(0, status.gpsAgeMs)
      : serverTimestamp === null
        ? null
        : Math.max(0, now.getTime() - serverTimestamp)

  if (!validLatitude(latest.latitude) || !validLongitude(latest.longitude)) {
    return {
      ...emptyVehicleLocation,
      status: status?.activeProvider ? 'searching' : 'offline',
      providerName: latest.deviceName || status?.activeProvider?.deviceName || null,
    }
  }

  return {
    latitude: latest.latitude,
    longitude: latest.longitude,
    speedMps: nonNegativeOrNull(latest.speedMps),
    speedMph: nonNegativeOrNull(latest.speedMph),
    heading: headingOrNull(latest.headingDegrees),
    altitudeMeters: finiteOrNull(latest.altitudeMeters),
    altitudeFeet: finiteOrNull(latest.altitudeFeet),
    accuracyMeters: nonNegativeOrNull(latest.accuracyMeters),
    altitudeAccuracyMeters: nonNegativeOrNull(latest.altitudeAccuracyMeters),
    clientTimestamp: finiteOrNull(latest.browserTimestamp),
    serverTimestamp,
    ageMs,
    status: vehicleLocationStatusFromAge(ageMs),
    providerName: latest.deviceName || status?.activeProvider?.deviceName || null,
    source: 'phone',
  }
}

export function vehicleLocationStatusFromAge(
  ageMs: number | null
): VehicleLocationStatus {
  if (ageMs === null) return 'offline'
  if (ageMs < 10_000) return 'online'
  if (ageMs < 30_000) return 'stale'

  return 'offline'
}

export function hasVehicleLocationCoordinates(location: VehicleLocation) {
  return (
    validLatitude(location.latitude) &&
    validLongitude(location.longitude)
  )
}

export function applyVehicleLocationToTelemetry<T extends object | null>(
  telemetry: T,
  location: VehicleLocation
): T {
  if (!telemetry) return telemetry

  if (!hasVehicleLocationCoordinates(location) || location.source !== 'phone') {
    return {
      ...telemetry,
      gpsLat: undefined,
      gpsLng: undefined,
      gpsValid: false,
      gpsLocationValid: false,
      gpsFix: false,
      gpsAgeMs: location.ageMs ?? undefined,
      gpsLastUpdateAgeMs: location.ageMs ?? undefined,
      gpsSpeed: undefined,
      gpsSpeedMph: undefined,
      gpsHeading: undefined,
      gpsElevationFt: undefined,
      gpsAccuracy: undefined,
      gpsProviderDeviceName: location.providerName ?? undefined,
      location,
    } as T
  }

  return {
    ...telemetry,
    gpsLat: location.latitude,
    gpsLng: location.longitude,
    gpsValid: location.status === 'online',
    gpsLocationValid: location.status === 'online' || location.status === 'stale',
    gpsFix: location.status === 'online' || location.status === 'stale',
    gpsAgeMs: location.ageMs ?? undefined,
    gpsLastUpdateAgeMs: location.ageMs ?? undefined,
    gpsSpeed: location.speedMps ?? undefined,
    gpsSpeedMph: location.speedMph ?? undefined,
    gpsHeading: location.heading ?? undefined,
    gpsElevationFt: location.altitudeFeet ?? undefined,
    gpsAccuracy: location.accuracyMeters ?? undefined,
    gpsProviderDeviceName: location.providerName ?? undefined,
    location,
  } as T
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null

  const timestamp = Date.parse(value)

  return Number.isFinite(timestamp) ? timestamp : null
}

function validLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90
}

function validLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180
}

function finiteOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonNegativeOrNull(value: unknown) {
  const numberValue = finiteOrNull(value)

  return numberValue === null || numberValue < 0 ? null : numberValue
}

function headingOrNull(value: unknown) {
  const numberValue = finiteOrNull(value)

  return numberValue === null || numberValue < 0 || numberValue >= 360
    ? null
    : numberValue
}
