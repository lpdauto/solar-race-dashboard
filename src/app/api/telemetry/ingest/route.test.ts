import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/redisTelemetry', () => ({
  loadLatestTelemetry: vi.fn(),
  storeTelemetryPacket: vi.fn(),
  normalizeTelemetryNode: (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : 'vehicle',
  logTelemetryApiError: vi.fn(),
  telemetryErrorJson: (error: unknown, fallback: string) => ({
    error: error instanceof Error ? error.message : fallback,
    code: 'UPSTASH_REDIS_REQUEST_FAILED',
  }),
}))

import { POST } from '@/app/api/telemetry/ingest/route'
import { loadLatestTelemetry, storeTelemetryPacket } from '@/lib/redisTelemetry'

const mockedLoadLatestTelemetry = vi.mocked(loadLatestTelemetry)
const mockedStoreTelemetryPacket = vi.mocked(storeTelemetryPacket)

describe('/api/telemetry/ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TELEMETRY_INGEST_TOKEN = 'rx2tc'
    mockedLoadLatestTelemetry.mockResolvedValue(null)
    mockedStoreTelemetryPacket.mockResolvedValue({
      id: 'vehicle',
      node: 'vehicle',
      payload: {},
      updated_at: '2026-07-13T00:00:00.000Z',
    })
  })

  it('accepts a valid ESP32 payload', async () => {
    const response = await POST(
      new Request('http://localhost/api/telemetry/ingest', {
        method: 'POST',
        headers: {
          authorization: 'Bearer rx2tc',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          node: 'vehicle',
          payload: {
            source: 'esp32-fardriver-ble-tft',
            packVoltage: 78.4,
            packCurrent: 42.5,
            packSoc: 76,
            speedMph: 24.8,
          },
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
    expect(mockedStoreTelemetryPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        node: 'vehicle',
        payload: expect.objectContaining({
          source: 'esp32-fardriver-ble-tft',
          speedMph: 24.8,
        }),
      })
    )
  })

  it('accepts a valid Android payload with complete FarDriver data', async () => {
    const response = await POST(
      new Request('http://localhost/api/telemetry/ingest', {
        method: 'POST',
        headers: {
          authorization: 'Bearer rx2tc',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          node: 'vehicle',
          payload: {
            source: 'android-fardriver',
            deviceId: 'android-device-1',
            uploadedAt: '2026-07-13T00:00:00.000Z',
            gpsAccuracyM: 3.2,
            controllerSpeedMph: 19.4,
            androidBatteryPercent: 88,
            androidCharging: false,
            networkType: 'wifi',
            wifiConnected: true,
            speedMph: 21.7,
            lat: 34.123456,
            lng: -118.123456,
            packVoltage: 79.2,
            packCurrent: 10.4,
            packSoc: 82,
            packPowerWatts: 820,
            motorTempC: 53,
            controllerTempC: 50,
            motorRpm: 3200,
            rpm: 3200,
            throttlePercent: 45,
            throttleVoltage: 3.1,
            phaseA: 0.2,
            phaseC: 0.1,
            modulation: 0.5,
            gear: 2,
          },
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
    expect(mockedStoreTelemetryPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        node: 'vehicle',
        payload: expect.objectContaining({
          source: 'android-fardriver',
          speedMph: 21.7,
          speed: 21.7,
          packVoltage: 79.2,
          controllerSpeedMph: 19.4,
        }),
      })
    )
  })

  it('accepts an Android GPS-only payload when FarDriver values are null', async () => {
    const response = await POST(
      new Request('http://localhost/api/telemetry/ingest', {
        method: 'POST',
        headers: {
          authorization: 'Bearer rx2tc',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          node: 'vehicle',
          payload: {
            source: 'android-fardriver',
            speedMph: 18.9,
            lat: 34.111111,
            lng: -118.222222,
            packVoltage: null,
            packCurrent: null,
            packSoc: null,
            packPowerWatts: null,
            motorTempC: null,
            controllerTempC: null,
            motorRpm: null,
            rpm: null,
            controllerSpeedMph: null,
            throttlePercent: null,
            throttleVoltage: null,
            phaseA: null,
            phaseC: null,
            modulation: null,
            gear: null,
          },
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
    expect(mockedStoreTelemetryPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        node: 'vehicle',
        payload: expect.objectContaining({
          source: 'android-fardriver',
          speedMph: 18.9,
          speed: 18.9,
          lat: 34.111111,
          lng: -118.222222,
        }),
      })
    )
  })

  it('rejects requests with a missing or invalid bearer token', async () => {
    const response = await POST(
      new Request('http://localhost/api/telemetry/ingest', {
        method: 'POST',
        headers: {
          authorization: 'Bearer wrong-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          node: 'vehicle',
          payload: { source: 'esp32-fardriver-ble-tft', speedMph: 12.1 },
        }),
      })
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'Unauthorized.' })
    expect(mockedStoreTelemetryPacket).not.toHaveBeenCalled()
  })

  it('rejects malformed node and payload structure', async () => {
    const response = await POST(
      new Request('http://localhost/api/telemetry/ingest', {
        method: 'POST',
        headers: {
          authorization: 'Bearer rx2tc',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          node: 42,
          payload: 'not-an-object',
        }),
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'Telemetry body must include a non-empty string node and a JSON object payload.' })
    expect(mockedStoreTelemetryPacket).not.toHaveBeenCalled()
  })
})
