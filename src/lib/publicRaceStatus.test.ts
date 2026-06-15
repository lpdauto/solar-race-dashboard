import { describe, expect, it } from 'vitest'
import {
  getMockPublicRaceStatus,
  getPublicRaceStatusFromTelemetry,
} from '@/lib/publicRaceStatus'

describe('getMockPublicRaceStatus', () => {
  it('returns only public-safe race tracker fields', () => {
    const status = getMockPublicRaceStatus(new Date('2026-06-09T18:30:00Z'))

    expect(Object.keys(status).sort()).toEqual(
      [
        'avgSpeedMph',
        'currentDay',
        'currentPlace',
        'currentSegment',
        'currentTime',
        'dataSource',
        'distanceFromRouteMeters',
        'eta',
        'instagramUrl',
        'lat',
        'lng',
        'milesCompleted',
        'milesLeft',
        'nextStop',
        'placeTotal',
        'routeProgressPct',
        'routeConfidence',
        'speedMph',
        'sponsors',
        'status',
        'standingsLastUpdated',
        'standingsSourceUrl',
        'telemetryAgeSeconds',
        'telemetryUpdatedAt',
        'totalDays',
        'totalMiles',
        'weatherCondition',
        'weatherLocation',
        'weatherTempF',
        'weatherWindDirection',
        'weatherWindMph',
      ].sort()
    )

    expect(status.sponsors[0]).toEqual({
      name: expect.any(String),
      logoUrl: expect.any(String),
      sponsorUrl: expect.any(String),
    })
    expect(status.routeProgressPct).toBeGreaterThan(0)
    expect(status.routeProgressPct).toBeLessThan(100)
    expect(status).not.toHaveProperty('batteryVoltage')
    expect(status).not.toHaveProperty('batteryCurrent')
    expect(status).not.toHaveProperty('motorTempC')
    expect(status).not.toHaveProperty('controllerTempC')
    expect(status).not.toHaveProperty('packetRateHz')
  })
})

describe('getPublicRaceStatusFromTelemetry', () => {
  it('builds public-safe live status from the latest vehicle telemetry', () => {
    const status = getPublicRaceStatusFromTelemetry(
      {
        id: 'vehicle',
        node: 'vehicle',
        updated_at: '2026-06-09T18:29:55.000Z',
        payload: {
          speedMph: 24.8,
          gpsLat: 31.738999,
          gpsLng: -95.604293,
          packVoltage: 78.4,
          packCurrent: 42.5,
          motorTempC: 58.4,
        },
      },
      new Date('2026-06-09T18:30:00Z')
    )

    expect(status.dataSource).toBe('telemetry')
    expect(status.speedMph).toBe(24.8)
    expect(status.telemetryAgeSeconds).toBe(5)
    expect(status.routeConfidence).toBe('high')
    expect(status.routeProgressPct).toBeGreaterThan(0)
    expect(status.status).toBe('Live on course')
    expect(status).not.toHaveProperty('batteryVoltage')
    expect(status).not.toHaveProperty('batteryCurrent')
    expect(status).not.toHaveProperty('motorTempC')
  })

  it('keeps route status honest when telemetry has no GPS fix', () => {
    const status = getPublicRaceStatusFromTelemetry(
      {
        id: 'vehicle',
        node: 'vehicle',
        updated_at: '2026-06-09T18:29:55.000Z',
        payload: {
          speedMph: 0,
        },
      },
      new Date('2026-06-09T18:30:00Z')
    )

    expect(status.dataSource).toBe('telemetry')
    expect(status.routeConfidence).toBe('unavailable')
    expect(status.status).toBe('Waiting for GPS')
  })
})
