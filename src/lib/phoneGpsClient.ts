export type PhoneGpsClientRecord = {
  providerId: string
  sessionId: string
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
  clientTimestamp: string
  serverReceivedAt: string
}

export const phoneGpsWatchOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 5000,
}

export function supportsPhoneGpsProvider(
  navigatorLike: Pick<Navigator, 'geolocation'> | undefined
) {
  return Boolean(navigatorLike?.geolocation)
}

export function shouldStartPhoneGpsWatcher(currentWatchId: number | null) {
  return currentWatchId === null
}

export function phoneGpsRecordFromBrowserPosition({
  position,
  providerId,
  sessionId,
  deviceName,
}: {
  position: GeolocationPosition
  providerId: string
  sessionId: string
  deviceName: string
}): PhoneGpsClientRecord {
  const speedMps = nullableNumber(position.coords.speed)
  const altitudeMeters = nullableNumber(position.coords.altitude)

  return {
    providerId,
    sessionId,
    deviceName,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    speedMps,
    speedMph: speedMps === null ? null : speedMps * 2.236936,
    headingDegrees: nullableNumber(position.coords.heading),
    altitudeMeters,
    altitudeFeet: altitudeMeters === null ? null : altitudeMeters * 3.28084,
    accuracyMeters: nullableNumber(position.coords.accuracy),
    altitudeAccuracyMeters: nullableNumber(position.coords.altitudeAccuracy),
    browserTimestamp: position.timestamp,
    clientTimestamp: new Date(position.timestamp).toISOString(),
    serverReceivedAt: new Date().toISOString(),
  }
}

export function phoneGpsUpdatePayload(reading: PhoneGpsClientRecord) {
  return {
    providerId: reading.providerId,
    sessionId: reading.sessionId,
    deviceName: reading.deviceName,
    latitude: reading.latitude,
    longitude: reading.longitude,
    speedMps: reading.speedMps,
    headingDegrees: reading.headingDegrees,
    altitudeMeters: reading.altitudeMeters,
    accuracyMeters: reading.accuracyMeters,
    altitudeAccuracyMeters: reading.altitudeAccuracyMeters,
    browserTimestamp: reading.browserTimestamp,
  }
}

export function gpsErrorMessage(error: unknown) {
  if (isGeolocationPositionError(error) && error.code === error.PERMISSION_DENIED) {
    return {
      permissionDenied: true,
      message:
        'Location permission was denied. Open Android browser settings, enable Location for this site, then retry.',
    }
  }

  if (isGeolocationPositionError(error) && error.code === error.TIMEOUT) {
    return {
      permissionDenied: false,
      message: 'GPS timed out while waiting for a high-accuracy position.',
    }
  }

  if (isGeolocationPositionError(error)) {
    return {
      permissionDenied: false,
      message: error.message || 'GPS position is unavailable.',
    }
  }

  return {
    permissionDenied: false,
    message: error instanceof Error ? error.message : 'GPS provider failed.',
  }
}

function isGeolocationPositionError(
  error: unknown
): error is GeolocationPositionError {
  return error !== null && typeof error === 'object' && 'code' in error
}

function nullableNumber(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
