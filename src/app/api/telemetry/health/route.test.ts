import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'
import { loadTelemetryNodeStatuses } from '@/lib/redisTelemetry'

vi.mock('@/lib/redisTelemetry', () => ({
  loadTelemetryNodeStatuses: vi.fn(),
  logTelemetryApiError: vi.fn(),
  telemetryErrorJson: vi.fn((_error: unknown, fallback: string) => ({
    error: fallback,
    code: 'TEST_ERROR',
  })),
}))

const mockedLoadTelemetryNodeStatuses = vi.mocked(loadTelemetryNodeStatuses)

describe('GET /api/telemetry/health', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('separates connected cloud backend from an offline vehicle node', async () => {
    mockedLoadTelemetryNodeStatuses.mockResolvedValueOnce([
      {
        node: 'vehicle',
        updated_at: '2026-06-12T12:00:00.000Z',
        ageSeconds: 300,
      },
      {
        node: 'mppt',
        updated_at: null,
        ageSeconds: null,
      },
      {
        node: 'spare-battery',
        updated_at: null,
        ageSeconds: null,
      },
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      cloudBackendStatus: 'connected',
      healthEndpointStatus: 'healthy',
      redis: 'connected',
      latestVehiclePacketAgeSeconds: 300,
      latestVehiclePacketAgeMs: 300_000,
      latestVehicleUpdatedAt: '2026-06-12T12:00:00.000Z',
      latestVehicleNode: 'vehicle',
      vehicleNodeStatus: 'offline',
      vehicleTelemetryFresh: false,
    })
    expect(typeof body.lastRedisReadAt).toBe('string')
  })

  it('marks a two second old vehicle packet online and fresh', async () => {
    mockedLoadTelemetryNodeStatuses.mockResolvedValueOnce([
      {
        node: 'vehicle',
        updated_at: '2026-06-12T12:00:00.000Z',
        ageSeconds: 2,
      },
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      latestVehiclePacketAgeSeconds: 2,
      latestVehiclePacketAgeMs: 2_000,
      vehicleNodeStatus: 'online',
      vehicleTelemetryFresh: true,
    })
  })

  it('marks a 30 second old vehicle packet stale and not fresh', async () => {
    mockedLoadTelemetryNodeStatuses.mockResolvedValueOnce([
      {
        node: 'vehicle',
        updated_at: '2026-06-12T12:00:00.000Z',
        ageSeconds: 30,
      },
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      latestVehiclePacketAgeSeconds: 30,
      latestVehiclePacketAgeMs: 30_000,
      vehicleNodeStatus: 'stale',
      vehicleTelemetryFresh: false,
    })
  })

  it('marks no vehicle packet offline and not fresh', async () => {
    mockedLoadTelemetryNodeStatuses.mockResolvedValueOnce([
      {
        node: 'mppt',
        updated_at: null,
        ageSeconds: null,
      },
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      latestVehiclePacketAgeSeconds: null,
      latestVehiclePacketAgeMs: null,
      latestVehicleUpdatedAt: null,
      latestVehicleNode: null,
      vehicleNodeStatus: 'offline',
      vehicleTelemetryFresh: false,
    })
  })
})
