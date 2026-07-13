import { describe, expect, it } from 'vitest'
import {
  getMockPublicRaceStatus,
  getPublicRaceStatusFromTelemetry,
} from '@/lib/publicRaceStatus'

describe('getMockPublicRaceStatus', () => {
  it('returns only public-safe race tracker fields', () => {
    const status = getMockPublicRaceStatus(new Date('2026-07-12T18:30:00Z'))

    expect(Object.keys(status).sort()).toEqual(
      [
        'avgSpeedMph',
        'currentDay',
        'currentDayLabel',
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
        'racePhase',
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
        'vehicleLocation',
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
    expect(status.currentDay).toBe(1)
    expect(status.currentDayLabel).toBe('Racing soon')
    expect(status.racePhase).toBe('pre-race')
    expect(status.status).toBe('Racing soon')
    expect(status.routeProgressPct).toBe(0)
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
        updated_at: '2026-07-20T18:29:55.000Z',
        payload: {
          speedMph: 24.8,
          gpsLat: 31.738999,
          gpsLng: -95.604293,
          packVoltage: 78.4,
          packCurrent: 42.5,
          motorTempC: 58.4,
        },
      },
      new Date('2026-07-20T18:30:00Z')
    )

    expect(status.dataSource).toBe('telemetry')
    expect(status.speedMph).toBe(24.8)
    expect(status.telemetryAgeSeconds).toBe(5)
    expect(status.routeConfidence).toBe('live')
    expect(status.routeProgressPct).toBeGreaterThan(0)
    expect(status.currentDay).toBe(2)
    expect(status.currentDayLabel).toBe('Day 2 of 5')
    expect(status.status).toBe('Live GPS')
    expect(status).not.toHaveProperty('batteryVoltage')
    expect(status).not.toHaveProperty('batteryCurrent')
    expect(status).not.toHaveProperty('motorTempC')
  })

  it('keeps route status honest when telemetry has no GPS fix', () => {
    const status = getPublicRaceStatusFromTelemetry(
      {
        id: 'vehicle',
        node: 'vehicle',
        updated_at: '2026-07-20T18:29:55.000Z',
        payload: {
          speedMph: 0,
        },
      },
      new Date('2026-07-20T18:30:00Z')
    )

    expect(status.dataSource).toBe('telemetry')
    expect(status.routeConfidence).toBe('unavailable')
    expect(status.status).toBe('Waiting for GPS')
  })

  it('shows California test GPS as off-route while keeping the marker at the live GPS coordinate', () => {
    const status = getPublicRaceStatusFromTelemetry(
      {
        id: 'vehicle',
        node: 'vehicle',
        updated_at: '2026-07-20T18:29:55.000Z',
        payload: {
          speedMph: 0,
          gpsFix: true,
          gpsLat: 34.096976,
          gpsLng: -118.052991,
          gpsAgeMs: 1000,
          gpsSatellites: 14,
          gpsElevationFt: 210,
        },
      },
      new Date('2026-07-20T18:30:00Z')
    )

    expect(status.dataSource).toBe('telemetry')
    expect(status.routeConfidence).toBe('off-route')
    expect(status.distanceFromRouteMeters).toBeGreaterThan(1_000)
    expect(status.lat).toBe(34.096976)
    expect(status.lng).toBe(-118.052991)
    expect(status.status).toBe('GPS off route / test location')
  })

  it('treats null-island telemetry coordinates as unavailable GPS', () => {
    const status = getPublicRaceStatusFromTelemetry(
      {
        id: 'vehicle',
        node: 'vehicle',
        updated_at: '2026-07-20T18:29:55.000Z',
        payload: {
          speedMph: 0,
          gpsFix: true,
          gpsLat: 0,
          gpsLng: 0,
        },
      },
      new Date('2026-07-20T18:30:00Z')
    )

    expect(status.dataSource).toBe('telemetry')
    expect(status.routeConfidence).toBe('unavailable')
    expect(status.distanceFromRouteMeters).toBeNull()
    expect(status.lat).toBeGreaterThan(30)
    expect(status.lat).toBeLessThan(34)
    expect(status.lng).toBeGreaterThan(-103)
    expect(status.lng).toBeLessThan(-95)
    expect(status.status).toBe('Waiting for GPS')
  })

  it('uses canonical Android vehicle location instead of ESP32 GPS fields', () => {
    const status = getPublicRaceStatusFromTelemetry(
      {
        id: 'vehicle',
        node: 'vehicle',
        updated_at: '2026-07-20T18:29:55.000Z',
        payload: {
          speedMph: 0,
          gpsValid: false,
          gpsLocationValid: false,
          gpsLat: 0,
          gpsLng: 0,
        },
      },
      new Date('2026-07-20T18:30:00Z'),
      {
        latitude: 31.738999,
        longitude: -95.604293,
        speedMps: 4.47,
        speedMph: 10,
        heading: null,
        altitudeMeters: 70,
        altitudeFeet: 230,
        accuracyMeters: 3,
        altitudeAccuracyMeters: null,
        clientTimestamp: Date.parse('2026-07-20T18:29:54.000Z'),
        serverTimestamp: Date.parse('2026-07-20T18:29:55.000Z'),
        ageMs: 5000,
        status: 'online',
        providerName: 'Android GPS Device',
        source: 'phone',
      }
    )

    expect(status.routeConfidence).toBe('live')
    expect(status.lat).toBe(31.738999)
    expect(status.lng).toBe(-95.604293)
    expect(status.speedMph).toBe(10)
    expect(status.vehicleLocation?.providerName).toBe('Android GPS Device')
  })

  it('carries Android FarDriver vehicle location through the live tracker when off route', () => {
    const status = getPublicRaceStatusFromTelemetry(
      {
        id: 'vehicle',
        node: 'vehicle',
        updated_at: '2026-07-20T18:29:55.000Z',
        payload: {
          source: 'android-fardriver',
          gpsSource: 'android-fardriver',
          speedMph: 0,
          gpsValid: true,
          gpsLocationValid: true,
          lat: 34.119136,
          lng: -117.987497,
          gpsLat: 34.119136,
          gpsLng: -117.987497,
        },
      },
      new Date('2026-07-20T18:30:00Z'),
      {
        latitude: 34.119136,
        longitude: -117.987497,
        speedMps: 0.089,
        speedMph: 0.2,
        heading: 122,
        altitudeMeters: 88.7,
        altitudeFeet: 291.01,
        accuracyMeters: 16,
        altitudeAccuracyMeters: null,
        clientTimestamp: Date.parse('2026-07-20T18:29:54.000Z'),
        serverTimestamp: Date.parse('2026-07-20T18:29:55.000Z'),
        ageMs: 5000,
        status: 'online',
        providerName: 'Android GPS Device',
        source: 'phone',
      }
    )

    expect(status.routeConfidence).toBe('off-route')
    expect(status.lat).toBe(34.119136)
    expect(status.lng).toBe(-117.987497)
    expect(status.speedMph).toBe(0.2)
    expect(status.vehicleLocation).toMatchObject({
      providerName: 'Android GPS Device',
      source: 'phone',
      latitude: 34.119136,
      longitude: -117.987497,
    })
  })

  it('updates the public day label from the official race calendar', () => {
    const status = getMockPublicRaceStatus(new Date('2026-07-20T18:30:00Z'))

    expect(status.currentDay).toBe(2)
    expect(status.currentDayLabel).toBe('Day 2 of 5')
    expect(status.racePhase).toBe('racing')
  })
})
