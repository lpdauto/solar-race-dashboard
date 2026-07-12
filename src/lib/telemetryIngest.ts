const gpsOwnedFields = [
  'lat',
  'lng',
  'latitude',
  'longitude',
  'speed',
  'speedMph',
  'heading',
  'altitudeMeters',
  'accuracyMeters',
  'gpsTimestamp',
  'uploadedAt',
  'gpsUpdatedAt',
  'gpsDeviceId',
  'gpsSource',
] as const

type GpsOwnedField = (typeof gpsOwnedFields)[number]

export type TelemetryIngestMergeResult =
  | {
      ok: true
      source: string
      payload: Record<string, unknown>
      response: Record<string, unknown>
    }
  | {
      ok: false
      source: string
      status: number
      response: Record<string, unknown>
      logDetails: Record<string, unknown>
    }

export function mergeTelemetryPayloadForIngest({
  existingPayload,
  incomingPayload,
  receivedAt,
}: {
  existingPayload: unknown
  incomingPayload: Record<string, unknown>
  receivedAt: string
}): TelemetryIngestMergeResult {
  const source = stringValue(incomingPayload.source) ?? 'unknown'

  if (source === 'android-gps') {
    return mergeAndroidGpsPayload({
      existingPayload,
      incomingPayload,
      receivedAt,
    })
  }

  const existing = objectValue(existingPayload)
  const cleanedIncoming = copyDefinedValues(incomingPayload)
  const merged: Record<string, unknown> = {
    ...cleanedIncoming,
    vehicleUpdatedAt: receivedAt,
  }

  for (const field of gpsOwnedFields) {
    if (merged[field] === undefined && existing[field] !== undefined) {
      merged[field] = existing[field]
    }
  }

  return {
    ok: true,
    source,
    payload: merged,
    response: {
      ok: true,
      source,
      vehicleUpdatedAt: receivedAt,
    },
  }
}

function mergeAndroidGpsPayload({
  existingPayload,
  incomingPayload,
  receivedAt,
}: {
  existingPayload: unknown
  incomingPayload: Record<string, unknown>
  receivedAt: string
}): TelemetryIngestMergeResult {
  const coordinates = normalizeCoordinates(incomingPayload)

  if (!coordinates) {
    return {
      ok: false,
      source: 'android-gps',
      status: 400,
      response: {
        ok: false,
        source: 'android-gps',
        error:
          'Invalid Android GPS coordinates. Latitude must be -90..90 and longitude must be -180..180.',
      },
      logDetails: {
        source: 'android-gps',
        reason: 'invalid-coordinates',
        lat: incomingPayload.lat ?? incomingPayload.latitude,
        lng: incomingPayload.lng ?? incomingPayload.longitude,
      },
    }
  }

  const existing = objectValue(existingPayload)
  const gpsFields: Partial<Record<GpsOwnedField, unknown>> = {
    lat: coordinates.lat,
    lng: coordinates.lng,
    latitude: coordinates.lat,
    longitude: coordinates.lng,
    gpsUpdatedAt: receivedAt,
    gpsSource: 'android-gps',
  }
  const speed = finiteNumber(incomingPayload.speedMph ?? incomingPayload.speed)
  const heading = finiteNumber(incomingPayload.heading)
  const altitudeMeters = finiteNumber(incomingPayload.altitudeMeters)
  const accuracyMeters = finiteNumber(incomingPayload.accuracyMeters)
  const gpsTimestamp = stringValue(incomingPayload.gpsTimestamp)
  const uploadedAt = stringValue(incomingPayload.uploadedAt) ?? receivedAt
  const deviceId = stringValue(incomingPayload.deviceId)

  if (speed !== undefined) {
    gpsFields.speed = speed
    gpsFields.speedMph = speed
  }

  if (heading !== undefined) gpsFields.heading = heading
  if (altitudeMeters !== undefined) gpsFields.altitudeMeters = altitudeMeters
  if (accuracyMeters !== undefined) gpsFields.accuracyMeters = accuracyMeters
  if (gpsTimestamp !== undefined) gpsFields.gpsTimestamp = gpsTimestamp
  gpsFields.uploadedAt = uploadedAt
  if (deviceId !== undefined) gpsFields.gpsDeviceId = deviceId

  return {
    ok: true,
    source: 'android-gps',
    payload: {
      ...existing,
      ...gpsFields,
    },
    response: {
      ok: true,
      source: 'android-gps',
      gpsUpdatedAt: receivedAt,
      lat: coordinates.lat,
      lng: coordinates.lng,
    },
  }
}

function normalizeCoordinates(payload: Record<string, unknown>) {
  const coordinatePairs = [
    { lat: payload.lat, lng: payload.lng },
    { lat: payload.latitude, lng: payload.longitude },
  ]

  for (const pair of coordinatePairs) {
    const lat = finiteNumber(pair.lat)
    const lng = finiteNumber(pair.lng)

    if (
      lat !== undefined &&
      lng !== undefined &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return { lat, lng }
    }
  }

  return null
}

function copyDefinedValues(payload: Record<string, unknown>) {
  const copied: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (value !== null && value !== undefined) {
      copied[key] = value
    }
  }

  return copied
}

function objectValue(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
