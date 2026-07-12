import { describe, expect, it } from 'vitest'
import {
  normalizeVehicleLocationFromGpsProviderStatus,
  vehicleLocationStatusFromAge,
} from '@/lib/vehicleLocation'

const latest = {
  deviceName: 'Android GPS Device',
  latitude: 34.096981,
  longitude: -118.05299,
  speedMps: 0.089,
  speedMph: 0.2,
  headingDegrees: null,
  altitudeMeters: 71.3,
  altitudeFeet: 234,
  accuracyMeters: 3,
  altitudeAccuracyMeters: null,
  browserTimestamp: Date.parse('2026-07-11T12:00:00.000Z'),
  serverReceivedAt: '2026-07-11T12:00:01.000Z',
}

describe('vehicleLocationStatusFromAge', () => {
  it('classifies Android vehicle GPS freshness thresholds', () => {
    expect(vehicleLocationStatusFromAge(9999)).toBe('online')
    expect(vehicleLocationStatusFromAge(10_000)).toBe('stale')
    expect(vehicleLocationStatusFromAge(29_999)).toBe('stale')
    expect(vehicleLocationStatusFromAge(30_000)).toBe('offline')
    expect(vehicleLocationStatusFromAge(null)).toBe('offline')
  })
})

describe('normalizeVehicleLocationFromGpsProviderStatus', () => {
  it('normalizes a fresh Android GPS record as vehicle location', () => {
    expect(
      normalizeVehicleLocationFromGpsProviderStatus({
        activeProvider: { deviceName: 'Android GPS Device' },
        latest,
        gpsAgeMs: 725,
      })
    ).toEqual({
      latitude: 34.096981,
      longitude: -118.05299,
      speedMps: 0.089,
      speedMph: 0.2,
      heading: null,
      altitudeMeters: 71.3,
      altitudeFeet: 234,
      accuracyMeters: 3,
      altitudeAccuracyMeters: null,
      clientTimestamp: Date.parse('2026-07-11T12:00:00.000Z'),
      serverTimestamp: Date.parse('2026-07-11T12:00:01.000Z'),
      ageMs: 725,
      status: 'online',
      providerName: 'Android GPS Device',
      source: 'phone',
    })
  })

  it('uses nulls and searching status when a provider exists without a location', () => {
    expect(
      normalizeVehicleLocationFromGpsProviderStatus({
        activeProvider: { deviceName: 'Android GPS Device' },
        latest: null,
        gpsAgeMs: null,
      })
    ).toMatchObject({
      latitude: null,
      longitude: null,
      status: 'searching',
      providerName: 'Android GPS Device',
      source: 'none',
    })
  })

  it('rejects invalid coordinates without substituting zeros', () => {
    expect(
      normalizeVehicleLocationFromGpsProviderStatus({
        activeProvider: { deviceName: 'Android GPS Device' },
        latest: {
          ...latest,
          latitude: 91,
          longitude: 0,
        },
        gpsAgeMs: 1000,
      })
    ).toMatchObject({
      latitude: null,
      longitude: null,
      status: 'searching',
      source: 'none',
    })
  })
})
