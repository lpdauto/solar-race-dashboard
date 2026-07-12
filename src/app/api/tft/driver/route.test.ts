import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GET } from './route'
import { loadLatestTelemetry } from '@/lib/redisTelemetry'

vi.mock('@/lib/redisTelemetry', () => ({
  loadLatestTelemetry: vi.fn(),
  logTelemetryApiError: vi.fn(),
  telemetryErrorJson: vi.fn((_error: unknown, fallback: string) => ({
    error: fallback,
    code: 'TEST_ERROR',
  })),
}))

const mockedLoadLatestTelemetry = vi.mocked(loadLatestTelemetry)

describe('GET /api/tft/driver', () => {
  beforeEach(() => {
    process.env.TELEMETRY_INGEST_TOKEN = 'test-token'
    delete process.env.TELEMETRY_TOKEN
    mockedLoadLatestTelemetry.mockResolvedValue({
      id: 'vehicle',
      node: 'vehicle',
      updated_at: '2026-06-11T12:00:00.000Z',
      payload: {
        speedMph: 35,
        packPowerWatts: 1435,
        packSoc: 82,
        checkpointDistanceMiles: 25.5,
        arrival: '10:42',
      },
    })
  })

  afterEach(() => {
    delete process.env.TELEMETRY_INGEST_TOKEN
    delete process.env.TELEMETRY_TOKEN
    vi.clearAllMocks()
  })

  it('has a route handler file', () => {
    expect(
      existsSync(join(process.cwd(), 'src/app/api/tft/driver/route.ts'))
    ).toBe(true)
  })

  it('returns compact JSON for bearer-authenticated ESP32 requests', async () => {
    const response = await GET(
      new Request('https://example.test/api/tft/driver', {
        headers: {
          authorization: 'Bearer test-token',
        },
      })
    )

    await expect(response.json()).resolves.toEqual({
      soc: 82,
      whPerMile: 41,
      checkpointDistanceMiles: 25.5,
      arrival: '10:42',
      status: 'HOLD PACE',
      targetSpeedMph: 35,
      batterySocPercent: 82,
      recommendedSpeedMph: 35,
      currentWhPerMile: 41,
      distanceToNextEventMiles: 25.5,
      eta: '10:42',
      command: 'HOLD PACE',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each([
    ['missing', undefined],
    ['wrong', 'Bearer wrong-token'],
  ])('returns 401 JSON when the bearer token is %s', async (_label, authorization) => {
    const headers = new Headers()
    if (authorization) {
      headers.set('authorization', authorization)
    }

    const response = await GET(
      new Request('https://example.test/api/tft/driver', {
        headers,
      })
    )

    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' })
    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(mockedLoadLatestTelemetry).not.toHaveBeenCalled()
  })

  it('returns 200 compact stale-data JSON when no telemetry exists yet', async () => {
    mockedLoadLatestTelemetry.mockResolvedValueOnce(null)

    const response = await GET(
      new Request('https://example.test/api/tft/driver', {
        headers: {
          authorization: 'Bearer test-token',
        },
      })
    )

    await expect(response.json()).resolves.toMatchObject({
      soc: null,
      whPerMile: null,
      checkpointDistanceMiles: null,
      arrival: '--:--',
      status: 'DATA STALE',
      targetSpeedMph: 35,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('accepts TELEMETRY_TOKEN as a compatible bearer token env var', async () => {
    delete process.env.TELEMETRY_INGEST_TOKEN
    process.env.TELEMETRY_TOKEN = 'display-token'

    const response = await GET(
      new Request('https://example.test/api/tft/driver', {
        headers: {
          authorization: 'Bearer display-token',
        },
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      soc: 82,
      whPerMile: 41,
      status: 'HOLD PACE',
    })
  })
})
