import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'
import {
  loadLatestTelemetry,
  loadTelemetryNodeStatuses,
} from '@/lib/redisTelemetry'

vi.mock('@/lib/redisTelemetry', () => ({
  defaultTelemetryNode: 'vehicle',
  loadLatestTelemetry: vi.fn(),
  loadTelemetryNodeStatuses: vi.fn(),
  logTelemetryApiError: vi.fn(),
  telemetryErrorJson: vi.fn((_error: unknown, fallback: string) => ({
    error: fallback,
    code: 'TEST_ERROR',
  })),
}))

const mockedLoadLatestTelemetry = vi.mocked(loadLatestTelemetry)
const mockedLoadTelemetryNodeStatuses = vi.mocked(loadTelemetryNodeStatuses)

describe('GET /api/telemetry/health', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('separates connected cloud backend from an offline vehicle node', async () => {
    mockedLoadLatestTelemetry.mockResolvedValueOnce(null)
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
    mockedLoadLatestTelemetry.mockResolvedValueOnce(null)
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
    mockedLoadLatestTelemetry.mockResolvedValueOnce(null)
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
    mockedLoadLatestTelemetry.mockResolvedValueOnce(null)
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

  it('uses vehicleUpdatedAt instead of Android GPS row refresh for vehicle node health', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-12T15:21:30.000Z'))
    mockedLoadLatestTelemetry.mockResolvedValueOnce({
      id: 'vehicle',
      node: 'vehicle',
      updated_at: '2026-07-12T15:21:29.000Z',
      payload: {
        source: 'esp32-fardriver-ble-tft',
        vehicleUpdatedAt: '2026-07-12T15:20:00.000Z',
        gpsSource: 'android-gps',
        gpsUpdatedAt: '2026-07-12T15:21:29.000Z',
        lat: 34.096989,
        lng: -118.053024,
      },
    })
    mockedLoadTelemetryNodeStatuses.mockResolvedValueOnce([
      {
        node: 'vehicle',
        updated_at: '2026-07-12T15:21:29.000Z',
        ageSeconds: 1,
      },
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      latestVehiclePacketAgeSeconds: 90,
      latestVehiclePacketAgeMs: 90_000,
      latestVehicleUpdatedAt: '2026-07-12T15:20:00.000Z',
      latestVehicleNode: 'vehicle',
      vehicleNodeStatus: 'offline',
      vehicleTelemetryFresh: false,
    })
    expect(body.nodes).toEqual([
      {
        node: 'vehicle',
        updated_at: '2026-07-12T15:20:00.000Z',
        ageSeconds: 90,
      },
    ])
  })

  it('does not treat an Android GPS-only refresh as a vehicle heartbeat', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-12T15:21:30.000Z'))
    mockedLoadLatestTelemetry.mockResolvedValueOnce({
      id: 'vehicle',
      node: 'vehicle',
      updated_at: '2026-07-12T15:21:29.000Z',
      payload: {
        source: 'esp32-fardriver-ble-tft',
        gpsSource: 'android-gps',
        gpsUpdatedAt: '2026-07-12T15:21:29.000Z',
        lat: 34.096989,
        lng: -118.053024,
      },
    })
    mockedLoadTelemetryNodeStatuses.mockResolvedValueOnce([
      {
        node: 'vehicle',
        updated_at: '2026-07-12T15:21:29.000Z',
        ageSeconds: 1,
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
    expect(body.nodes).toEqual([
      {
        node: 'vehicle',
        updated_at: null,
        ageSeconds: null,
      },
    ])
  })
})
