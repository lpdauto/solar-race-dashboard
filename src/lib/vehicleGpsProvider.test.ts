import { describe, expect, it } from 'vitest'
import {
  classifyPhoneGpsStatus,
  getGpsProviderStatus,
  gpsActiveProviderKey,
  gpsLatestKey,
  mergePhoneGpsIntoTelemetryPayload,
  startGpsProvider,
  updateGpsProvider,
  type GpsProviderRecord,
  type PhoneGpsRecord,
} from '@/lib/vehicleGpsProvider'

class MemoryRedis {
  store = new Map<string, unknown>()

  async get<T>(key: string) {
    return (this.store.get(key) ?? null) as T | null
  }

  async set(key: string, value: unknown) {
    this.store.set(key, value)
    return 'OK'
  }

  async del(key: string) {
    const existed = this.store.delete(key)

    return existed ? 1 : 0
  }
}

const baseInput = {
  providerId: 'device-1',
  sessionId: 'session-1',
  deviceName: 'Android GPS Device',
  latitude: 34.096981,
  longitude: -118.05299,
  speedMps: 4.4704,
  headingDegrees: 182,
  altitudeMeters: 62,
  accuracyMeters: 3.5,
  altitudeAccuracyMeters: 8,
  browserTimestamp: Date.parse('2026-07-11T12:00:00.000Z'),
}

describe('vehicle GPS provider', () => {
  it('stores a started provider with metric and imperial GPS values', async () => {
    const redis = new MemoryRedis()
    const result = await startGpsProvider({
      redis,
      input: baseInput,
      now: new Date('2026-07-11T12:00:01.000Z'),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.activeProvider).toMatchObject({
      providerId: 'device-1',
      sessionId: 'session-1',
      deviceName: 'Android GPS Device',
      lastUpdateAt: '2026-07-11T12:00:01.000Z',
    })
    expect(result.latest.speedMps).toBe(4.4704)
    expect(result.latest.speedMph).toBeCloseTo(10, 3)
    expect(result.latest.altitudeMeters).toBe(62)
    expect(result.latest.altitudeFeet).toBeCloseTo(203.41, 2)
  })

  it('keeps null speed, heading, altitude, and altitude accuracy as null', async () => {
    const redis = new MemoryRedis()
    const result = await startGpsProvider({
      redis,
      input: {
        ...baseInput,
        speedMps: null,
        headingDegrees: null,
        altitudeMeters: null,
        altitudeAccuracyMeters: null,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.latest.speedMps).toBeNull()
    expect(result.latest.speedMph).toBeNull()
    expect(result.latest.headingDegrees).toBeNull()
    expect(result.latest.altitudeMeters).toBeNull()
    expect(result.latest.altitudeFeet).toBeNull()
    expect(result.latest.altitudeAccuracyMeters).toBeNull()
  })

  it('rejects updates from an invalid session ID', async () => {
    const redis = new MemoryRedis()
    await startGpsProvider({ redis, input: baseInput })

    const result = await updateGpsProvider({
      redis,
      input: {
        ...baseInput,
        sessionId: 'wrong-session',
      },
    })

    expect(result).toMatchObject({
      ok: false,
      status: 403,
      error: 'GPS update rejected because the provider session is not active.',
    })
  })

  it('allows owner/admin takeover when another device is active', async () => {
    const redis = new MemoryRedis()
    await startGpsProvider({ redis, input: baseInput })

    const blocked = await startGpsProvider({
      redis,
      input: {
        ...baseInput,
        providerId: 'device-2',
        sessionId: 'session-2',
      },
    })

    expect(blocked).toMatchObject({ ok: false, status: 409 })

    const takeover = await startGpsProvider({
      redis,
      input: {
        ...baseInput,
        providerId: 'device-2',
        sessionId: 'session-2',
        deviceName: 'Owner Phone',
      },
      takeover: true,
      canTakeover: true,
    })

    expect(takeover.ok).toBe(true)
    if (!takeover.ok) return

    expect(takeover.activeProvider).toMatchObject({
      providerId: 'device-2',
      sessionId: 'session-2',
      deviceName: 'Owner Phone',
    })
  })

  it('classifies live stale and offline thresholds', () => {
    expect(classifyPhoneGpsStatus(9_999)).toBe('live')
    expect(classifyPhoneGpsStatus(10_000)).toBe('stale')
    expect(classifyPhoneGpsStatus(29_999)).toBe('stale')
    expect(classifyPhoneGpsStatus(30_000)).toBe('offline')
    expect(classifyPhoneGpsStatus(null)).toBe('offline')
  })

  it('allows the same session to resume after a temporary upload failure', async () => {
    const redis = new MemoryRedis()
    await startGpsProvider({
      redis,
      input: baseInput,
      now: new Date('2026-07-11T12:00:00.000Z'),
    })

    const staleStatus = await getGpsProviderStatus({
      redis,
      now: new Date('2026-07-11T12:00:20.000Z'),
    })

    expect(staleStatus.gpsStatus).toBe('stale')

    const resumed = await updateGpsProvider({
      redis,
      input: {
        ...baseInput,
        latitude: 34.1,
      },
      now: new Date('2026-07-11T12:00:21.000Z'),
    })

    expect(resumed.ok).toBe(true)
    if (!resumed.ok) return
    expect(resumed.latest.latitude).toBe(34.1)
  })

  it('reports offline while retaining an old active provider record', async () => {
    const redis = new MemoryRedis()
    const provider: GpsProviderRecord = {
      providerId: 'device-1',
      sessionId: 'session-1',
      deviceName: 'Android GPS Device',
      startedAt: '2026-07-11T12:00:00.000Z',
      lastUpdateAt: '2026-07-11T12:00:00.000Z',
    }
    const latest: PhoneGpsRecord = {
      ...baseInput,
      speedMph: 10,
      altitudeFeet: 203,
      clientTimestamp: '2026-07-11T12:00:00.000Z',
      serverReceivedAt: '2026-07-11T12:00:00.000Z',
    }

    await redis.set(gpsActiveProviderKey, provider)
    await redis.set(gpsLatestKey, latest)

    const status = await getGpsProviderStatus({
      redis,
      now: new Date('2026-07-11T12:00:31.000Z'),
    })

    expect(status.activeProvider).toEqual(provider)
    expect(status.gpsStatus).toBe('offline')
    expect(status.gpsSource).toBe('none')
  })

  it('merges fresh phone GPS over ESP32 GPS without overwriting non-GPS telemetry', () => {
    const merged = mergePhoneGpsIntoTelemetryPayload({
      payload: {
        speedMph: 35,
        packSoc: 80,
        gpsLat: 1,
        gpsLng: 2,
      },
      phoneGps: {
        ...baseInput,
        speedMph: 10,
        altitudeFeet: 203,
        clientTimestamp: '2026-07-11T12:00:00.000Z',
        serverReceivedAt: '2026-07-11T12:00:01.000Z',
      },
      gpsStatus: 'live',
      gpsAgeMs: 1000,
    })

    expect(merged).toMatchObject({
      speedMph: 35,
      packSoc: 80,
      gpsLat: 34.096981,
      gpsLng: -118.05299,
      gpsSource: 'phone',
      gpsStatus: 'live',
      gpsAgeMs: 1000,
    })
  })
})
