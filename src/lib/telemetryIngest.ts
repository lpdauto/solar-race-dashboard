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

const androidFarDriverNullableFields = [
  'packVoltage',
  'packCurrent',
  'packSoc',
  'packPowerWatts',
  'motorTempC',
  'controllerTempC',
  'motorRpm',
  'rpm',
  'controllerSpeedMph',
  'throttlePercent',
  'throttleVoltage',
  'phaseA',
  'phaseC',
  'modulation',
  'gear',
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

  if (source === 'android-gps' || source === 'android-fardriver') {
    return mergeAndroidPayload({
      existingPayload,
      incomingPayload,
      receivedAt,
      source,
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

function mergeAndroidPayload({
  existingPayload,
  incomingPayload,
  receivedAt,
  source,
}: {
  existingPayload: unknown
  incomingPayload: Record<string, unknown>
  receivedAt: string
  source: string
}): TelemetryIngestMergeResult {
  const coordinates = normalizeCoordinates(incomingPayload)

  if (!coordinates) {
    return {
      ok: false,
      source,
      status: 400,
      response: {
        ok: false,
        source,
        error:
          'Invalid Android GPS coordinates. Latitude must be -90..90 and longitude must be -180..180.',
      },
      logDetails: {
        source,
        reason: 'invalid-coordinates',
        lat: incomingPayload.lat ?? incomingPayload.latitude,
        lng: incomingPayload.lng ?? incomingPayload.longitude,
      },
    }
  }

  const existing = objectValue(existingPayload)
  const incoming = copyDefinedValues(incomingPayload, {
    preserveNullValues: [...androidFarDriverNullableFields],
  })
  const merged: Record<string, unknown> = {
    ...existing,
    ...incoming,
    vehicleUpdatedAt: receivedAt,
  }

  const gpsFields: Partial<Record<GpsOwnedField, unknown>> = {
    lat: coordinates.lat,
    lng: coordinates.lng,
    latitude: coordinates.lat,
    longitude: coordinates.lng,
    gpsUpdatedAt: receivedAt,
    gpsSource: source,
  }
  const speed = finiteNumber(incomingPayload.speedMph ?? incomingPayload.speed)
  const heading = finiteNumber(incomingPayload.heading)
  const altitudeMeters = finiteNumber(
    incomingPayload.altitudeMeters ?? incomingPayload.gpsAltitudeM
  )
  const accuracyMeters = finiteNumber(
    incomingPayload.accuracyMeters ?? incomingPayload.gpsAccuracyM
  )
  const gpsTimestamp = stringValue(incomingPayload.gpsTimestamp)
  const uploadedAt = stringValue(incomingPayload.uploadedAt) ?? receivedAt
  const deviceId = stringValue(incomingPayload.deviceId)

  if (speed !== undefined) {
    merged.speed = speed
    merged.speedMph = speed
  }

  if (heading !== undefined) merged.heading = heading
  if (altitudeMeters !== undefined) merged.altitudeMeters = altitudeMeters
  if (accuracyMeters !== undefined) merged.accuracyMeters = accuracyMeters
  if (gpsTimestamp !== undefined) merged.gpsTimestamp = gpsTimestamp
  merged.uploadedAt = uploadedAt
  if (deviceId !== undefined) merged.gpsDeviceId = deviceId

  if (merged.deviceId === undefined && source === 'android-fardriver') {
    merged.deviceId = deviceId
  }

  if (merged.gpsAccuracyM === undefined) {
    merged.gpsAccuracyM = accuracyMeters
  }

  for (const field of gpsOwnedFields) {
    if (merged[field] === undefined && existing[field] !== undefined) {
      merged[field] = existing[field]
    }
  }

  for (const [field, value] of Object.entries(gpsFields)) {
    if (value !== undefined) {
      merged[field] = value
    }
  }

  return {
    ok: true,
    source,
    payload: merged,
    response: {
      ok: true,
      source,
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

function copyDefinedValues(
  payload: Record<string, unknown>,
  options: { preserveNullValues?: readonly string[] } = {}
) {
  const copied: Record<string, unknown> = {}
  const preserveNullValues = new Set(options.preserveNullValues ?? [])

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue
    if (value === null && preserveNullValues.has(key)) {
      copied[key] = value
      continue
    }

    if (value !== null) {
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
