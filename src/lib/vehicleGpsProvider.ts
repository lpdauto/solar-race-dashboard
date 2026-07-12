export const gpsActiveProviderKey = 'gps:active-provider'
export const gpsLatestKey = 'gps:latest'
export const vehicleTelemetryLatestKey = 'latest:vehicle'
export const vehicleLocationKey = 'vehicle:location'
export const phoneGpsLiveThresholdMs = 10_000
export const phoneGpsOfflineThresholdMs = 30_000

export type GpsProviderStatus = 'live' | 'stale' | 'offline'
export type GpsSource = 'phone' | 'none'

export type GpsProviderRecord = {
  providerId: string
  sessionId: string
  deviceName: string
  startedAt: string
  lastUpdateAt: string | null
}

export type PhoneGpsRecord = {
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

export type GpsProviderStatusResponse = {
  activeProvider: GpsProviderRecord | null
  latest: PhoneGpsRecord | null
  gpsSource: GpsSource
  gpsStatus: GpsProviderStatus
  gpsAgeMs: number | null
}

export type PhoneGpsPositionInput = {
  latitude?: unknown
  longitude?: unknown
  speedMps?: unknown
  headingDegrees?: unknown
  altitudeMeters?: unknown
  accuracyMeters?: unknown
  altitudeAccuracyMeters?: unknown
  browserTimestamp?: unknown
}

export type PhoneGpsProviderInput = PhoneGpsPositionInput & {
  providerId?: unknown
  sessionId?: unknown
  deviceName?: unknown
}

type GpsRedisReader = {
  get<T>(key: string): Promise<T | null>
}

type TelemetryLatestRowLike = {
  payload?: unknown
  updated_at?: string
}

type GpsRedisWriter = GpsRedisReader & {
  set(key: string, value: unknown): Promise<unknown>
}

type GpsRedisStopWriter = GpsRedisReader & {
  del(key: string): Promise<unknown>
}

export type StartGpsProviderResult =
  | {
      ok: true
      activeProvider: GpsProviderRecord
      latest: PhoneGpsRecord
      gpsStatus: GpsProviderStatus
      gpsAgeMs: number
    }
  | { ok: false; status: number; error: string; activeProvider?: GpsProviderRecord }

export type UpdateGpsProviderResult =
  | {
      ok: true
      activeProvider: GpsProviderRecord
      latest: PhoneGpsRecord
      gpsStatus: GpsProviderStatus
      gpsAgeMs: number
    }
  | { ok: false; status: number; error: string; activeProvider?: GpsProviderRecord }

export type StopGpsProviderResult =
  | { ok: true; stopped: boolean }
  | { ok: false; status: number; error: string; activeProvider?: GpsProviderRecord }

export async function startGpsProvider({
  redis,
  input,
  takeover,
  canTakeover,
  now = new Date(),
}: {
  redis: GpsRedisWriter
  input: PhoneGpsProviderInput
  takeover?: boolean
  canTakeover?: boolean
  now?: Date
}): Promise<StartGpsProviderResult> {
  const normalized = normalizePhoneGpsProviderInput(input)

  if (!normalized.ok) return normalized

  const activeProvider = await redis.get<GpsProviderRecord>(gpsActiveProviderKey)
  const existingDifferentSession =
    activeProvider && activeProvider.sessionId !== normalized.provider.sessionId
  const activeProviderIsOffline =
    classifyPhoneGpsStatus(activeProviderAgeMs(activeProvider, now)) === 'offline'

  // An offline provider never uploaded a fresh position and can't be stopped
  // by its own (unreachable) device, so any device may take over immediately.
  if (existingDifferentSession && !activeProviderIsOffline && !(takeover && canTakeover)) {
    return {
      ok: false,
      status: 409,
      error: 'Another device is already the active GPS provider.',
      activeProvider,
    }
  }

  if (
    existingDifferentSession &&
    !activeProviderIsOffline &&
    takeover &&
    !canTakeover
  ) {
    return {
      ok: false,
      status: 403,
      error: 'Only owner/admin users can take over GPS broadcasting.',
      activeProvider,
    }
  }

  const serverReceivedAt = now.toISOString()
  const provider: GpsProviderRecord = {
    ...normalized.provider,
    startedAt:
      activeProvider?.sessionId === normalized.provider.sessionId
        ? activeProvider.startedAt
        : serverReceivedAt,
    lastUpdateAt: serverReceivedAt,
  }
  const latest = buildPhoneGpsRecord({
    provider,
    position: normalized.position,
    serverReceivedAt,
  })

  await redis.set(gpsActiveProviderKey, provider)
  await redis.set(gpsLatestKey, latest)
  await redis.set(vehicleLocationKey, latest)

  return {
    ok: true,
    activeProvider: provider,
    latest,
    gpsStatus: 'live',
    gpsAgeMs: 0,
  }
}

export async function updateGpsProvider({
  redis,
  input,
  now = new Date(),
}: {
  redis: GpsRedisWriter
  input: PhoneGpsProviderInput
  now?: Date
}): Promise<UpdateGpsProviderResult> {
  const normalized = normalizePhoneGpsProviderInput(input)

  if (!normalized.ok) return normalized

  const activeProvider = await redis.get<GpsProviderRecord>(gpsActiveProviderKey)

  if (!activeProvider) {
    return {
      ok: false,
      status: 409,
      error: 'No active GPS provider is registered.',
    }
  }

  if (activeProvider.sessionId !== normalized.provider.sessionId) {
    return {
      ok: false,
      status: 403,
      error: 'GPS update rejected because the provider session is not active.',
      activeProvider,
    }
  }

  const serverReceivedAt = now.toISOString()
  const provider: GpsProviderRecord = {
    ...activeProvider,
    providerId: normalized.provider.providerId,
    deviceName: normalized.provider.deviceName,
    lastUpdateAt: serverReceivedAt,
  }
  const latest = buildPhoneGpsRecord({
    provider,
    position: normalized.position,
    serverReceivedAt,
  })

  await redis.set(gpsActiveProviderKey, provider)
  await redis.set(gpsLatestKey, latest)
  await redis.set(vehicleLocationKey, latest)

  return {
    ok: true,
    activeProvider: provider,
    latest,
    gpsStatus: 'live',
    gpsAgeMs: 0,
  }
}

export async function stopGpsProvider({
  redis,
  providerId,
  sessionId,
}: {
  redis: GpsRedisStopWriter
  providerId: unknown
  sessionId: unknown
}): Promise<StopGpsProviderResult> {
  const normalizedProviderId = nonEmptyString(providerId)
  const normalizedSessionId = nonEmptyString(sessionId)

  if (!normalizedProviderId || !normalizedSessionId) {
    return {
      ok: false,
      status: 400,
      error: 'providerId and sessionId are required.',
    }
  }

  const activeProvider = await redis.get<GpsProviderRecord>(gpsActiveProviderKey)

  if (!activeProvider) return { ok: true, stopped: false }

  if (
    activeProvider.providerId !== normalizedProviderId ||
    activeProvider.sessionId !== normalizedSessionId
  ) {
    return {
      ok: false,
      status: 403,
      error: 'Only the active GPS provider can stop this session.',
      activeProvider,
    }
  }

  await redis.del(gpsActiveProviderKey)

  return { ok: true, stopped: true }
}

export async function getGpsProviderStatus({
  redis,
  now = new Date(),
}: {
  redis: GpsRedisReader
  now?: Date
}): Promise<GpsProviderStatusResponse> {
  const [activeProvider, latest, latestVehicleTelemetry] = await Promise.all([
    redis.get<GpsProviderRecord>(gpsActiveProviderKey),
    redis.get<PhoneGpsRecord>(gpsLatestKey),
    redis.get<TelemetryLatestRowLike>(vehicleTelemetryLatestKey),
  ])
  const gpsAgeMs = latest
    ? Math.max(0, now.getTime() - Date.parse(latest.serverReceivedAt))
    : null
  const validLatest =
    activeProvider &&
    latest &&
    activeProvider.sessionId === latest.sessionId
      ? latest
      : null
  const androidTelemetryLatest = phoneGpsFromAndroidTelemetryPayload(
    latestVehicleTelemetry?.payload
  )
  const selected = selectNewestPhoneGps({
    legacyProvider: activeProvider,
    legacyLatest: validLatest,
    androidLatest: androidTelemetryLatest,
  })
  const selectedAgeMs = selected.latest
    ? Math.max(0, now.getTime() - Date.parse(selected.latest.serverReceivedAt))
    : null
  const selectedStatus = classifyPhoneGpsStatus(selectedAgeMs)

  return {
    activeProvider: selected.provider,
    latest: selected.latest,
    gpsSource: selected.latest ? 'phone' : 'none',
    gpsStatus: selected.latest ? selectedStatus : 'offline',
    gpsAgeMs: selected.latest ? selectedAgeMs : null,
  }
}

export function classifyPhoneGpsStatus(ageMs: number | null): GpsProviderStatus {
  if (ageMs === null) return 'offline'
  if (ageMs < phoneGpsLiveThresholdMs) return 'live'
  if (ageMs < phoneGpsOfflineThresholdMs) return 'stale'

  return 'offline'
}

function activeProviderAgeMs(
  activeProvider: GpsProviderRecord | null,
  now: Date
): number | null {
  if (!activeProvider?.lastUpdateAt) return null

  const lastUpdate = Date.parse(activeProvider.lastUpdateAt)

  return Number.isFinite(lastUpdate) ? Math.max(0, now.getTime() - lastUpdate) : null
}

export function mergePhoneGpsIntoTelemetryPayload({
  payload,
  phoneGps,
  gpsStatus,
  gpsAgeMs,
}: {
  payload: unknown
  phoneGps: PhoneGpsRecord | null
  gpsStatus: GpsProviderStatus
  gpsAgeMs: number | null
}) {
  const packet = isJsonObject(payload) ? payload : {}

  if (!phoneGps) {
    return {
      ...packet,
      gpsLat: undefined,
      gpsLng: undefined,
      gpsValid: false,
      gpsLocationValid: false,
      gpsFix: false,
      gpsSource: 'none',
      gpsStatus: 'offline',
      gpsAgeMs: null,
    }
  }

  return {
    ...packet,
    gpsLat: phoneGps.latitude,
    gpsLng: phoneGps.longitude,
    gpsValid: gpsStatus === 'live',
    gpsLocationValid: gpsStatus === 'live' || gpsStatus === 'stale',
    gpsFix: gpsStatus === 'live' || gpsStatus === 'stale',
    gpsSpeed: phoneGps.speedMps,
    gpsSpeedMph: phoneGps.speedMph,
    gpsHeading: phoneGps.headingDegrees,
    gpsAltitudeM: phoneGps.altitudeMeters,
    gpsElevationFt: phoneGps.altitudeFeet,
    gpsAccuracy: phoneGps.accuracyMeters,
    gpsAltitudeAccuracy: phoneGps.altitudeAccuracyMeters,
    gpsProviderDeviceName: phoneGps.deviceName,
    gpsProviderSessionId: phoneGps.sessionId,
    gpsBrowserTimestamp: phoneGps.browserTimestamp,
    gpsServerReceivedAt: phoneGps.serverReceivedAt,
    gpsSource: 'phone',
    gpsStatus,
    gpsAgeMs,
  }
}

export function normalizePhoneGpsProviderInput(input: PhoneGpsProviderInput):
  | {
      ok: true
      provider: Pick<
        GpsProviderRecord,
        'providerId' | 'sessionId' | 'deviceName'
      >
      position: Required<PhoneGpsPositionInput>
    }
  | { ok: false; status: number; error: string } {
  const providerId = nonEmptyString(input.providerId)
  const sessionId = nonEmptyString(input.sessionId)
  const deviceName = nonEmptyString(input.deviceName)
  const latitude = finiteNumber(input.latitude)
  const longitude = finiteNumber(input.longitude)
  const browserTimestamp = finiteNumber(input.browserTimestamp)

  if (!providerId || !sessionId || !deviceName) {
    return {
      ok: false,
      status: 400,
      error: 'providerId, sessionId, and deviceName are required.',
    }
  }

  if (
    latitude === undefined ||
    longitude === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return {
      ok: false,
      status: 400,
      error: 'A valid latitude and longitude are required.',
    }
  }

  if (browserTimestamp === undefined) {
    return {
      ok: false,
      status: 400,
      error: 'browserTimestamp is required.',
    }
  }

  if (
    browserTimestamp < Date.parse('2020-01-01T00:00:00.000Z') ||
    browserTimestamp > Date.now() + 5 * 60_000
  ) {
    return {
      ok: false,
      status: 400,
      error: 'browserTimestamp is outside the accepted range.',
    }
  }

  const speedMps = nullableNonNegativeNumber(input.speedMps)
  const headingDegrees = nullableHeading(input.headingDegrees)
  const altitudeMeters = nullableFiniteNumber(input.altitudeMeters)
  const accuracyMeters = nullableNonNegativeNumber(input.accuracyMeters)
  const altitudeAccuracyMeters = nullableNonNegativeNumber(
    input.altitudeAccuracyMeters
  )

  return {
    ok: true,
    provider: {
      providerId,
      sessionId,
      deviceName,
    },
    position: {
      latitude,
      longitude,
      speedMps,
      headingDegrees,
      altitudeMeters,
      accuracyMeters,
      altitudeAccuracyMeters,
      browserTimestamp,
    },
  }
}

function buildPhoneGpsRecord({
  provider,
  position,
  serverReceivedAt,
}: {
  provider: Pick<GpsProviderRecord, 'providerId' | 'sessionId' | 'deviceName'>
  position: Required<PhoneGpsPositionInput>
  serverReceivedAt: string
}): PhoneGpsRecord {
  const speedMps = nullableNonNegativeNumber(position.speedMps)
  const altitudeMeters = nullableFiniteNumber(position.altitudeMeters)

  return {
    providerId: provider.providerId,
    sessionId: provider.sessionId,
    deviceName: provider.deviceName,
    latitude: position.latitude as number,
    longitude: position.longitude as number,
    speedMps,
    speedMph: speedMps === null ? null : speedMps * 2.236936,
    headingDegrees: nullableHeading(position.headingDegrees),
    altitudeMeters,
    altitudeFeet: altitudeMeters === null ? null : altitudeMeters * 3.28084,
    accuracyMeters: nullableNonNegativeNumber(position.accuracyMeters),
    altitudeAccuracyMeters: nullableNonNegativeNumber(position.altitudeAccuracyMeters),
    browserTimestamp: position.browserTimestamp as number,
    clientTimestamp: new Date(position.browserTimestamp as number).toISOString(),
    serverReceivedAt,
  }
}

function selectNewestPhoneGps({
  legacyProvider,
  legacyLatest,
  androidLatest,
}: {
  legacyProvider: GpsProviderRecord | null
  legacyLatest: PhoneGpsRecord | null
  androidLatest: {
    provider: GpsProviderRecord
    latest: PhoneGpsRecord
  } | null
}): {
  provider: GpsProviderRecord | null
  latest: PhoneGpsRecord | null
} {
  if (!androidLatest) {
    return {
      provider: legacyProvider,
      latest: legacyLatest,
    }
  }

  if (!legacyLatest) {
    return androidLatest
  }

  const androidReceivedAt = Date.parse(androidLatest.latest.serverReceivedAt)
  const legacyReceivedAt = Date.parse(legacyLatest.serverReceivedAt)

  if (
    Number.isFinite(androidReceivedAt) &&
    (!Number.isFinite(legacyReceivedAt) || androidReceivedAt >= legacyReceivedAt)
  ) {
    return androidLatest
  }

  return {
    provider: legacyProvider,
    latest: legacyLatest,
  }
}

function phoneGpsFromAndroidTelemetryPayload(payload: unknown): {
  provider: GpsProviderRecord
  latest: PhoneGpsRecord
} | null {
  if (!isJsonObject(payload) || payload.gpsSource !== 'android-gps') {
    return null
  }

  const latitude = finiteNumber(payload.lat ?? payload.latitude)
  const longitude = finiteNumber(payload.lng ?? payload.longitude)
  const serverReceivedAt = nonEmptyString(payload.gpsUpdatedAt)

  if (
    latitude === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude === undefined ||
    longitude < -180 ||
    longitude > 180 ||
    !serverReceivedAt ||
    !Number.isFinite(Date.parse(serverReceivedAt))
  ) {
    return null
  }

  const deviceId = nonEmptyString(payload.gpsDeviceId) ?? 'android-gps'
  const speedMph = nullableNonNegativeNumber(payload.speedMph ?? payload.speed)
  const altitudeMeters = nullableFiniteNumber(payload.altitudeMeters)
  const gpsTimestampMs = timestampMs(payload.gpsTimestamp) ?? Date.parse(serverReceivedAt)
  const provider: GpsProviderRecord = {
    providerId: deviceId,
    sessionId: deviceId,
    deviceName: 'Android GPS Device',
    startedAt: serverReceivedAt,
    lastUpdateAt: serverReceivedAt,
  }

  return {
    provider,
    latest: {
      providerId: provider.providerId,
      sessionId: provider.sessionId,
      deviceName: provider.deviceName,
      latitude,
      longitude,
      speedMps: speedMph === null ? null : speedMph / 2.236936,
      speedMph,
      headingDegrees: nullableHeading(payload.heading),
      altitudeMeters,
      altitudeFeet: altitudeMeters === null ? null : altitudeMeters * 3.28084,
      accuracyMeters: nullableNonNegativeNumber(payload.accuracyMeters),
      altitudeAccuracyMeters: null,
      browserTimestamp: gpsTimestampMs,
      clientTimestamp: new Date(gpsTimestampMs).toISOString(),
      serverReceivedAt,
    },
  }
}

function timestampMs(value: unknown) {
  if (typeof value !== 'string') return null

  const timestamp = Date.parse(value)

  return Number.isFinite(timestamp) ? timestamp : null
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function nullableFiniteNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : finiteNumber(value) ?? null
}

function nullableNonNegativeNumber(value: unknown): number | null {
  const numberValue = nullableFiniteNumber(value)

  return numberValue === null || numberValue < 0 ? null : numberValue
}

function nullableHeading(value: unknown): number | null {
  const numberValue = nullableFiniteNumber(value)

  return numberValue === null || numberValue < 0 || numberValue >= 360
    ? null
    : numberValue
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
