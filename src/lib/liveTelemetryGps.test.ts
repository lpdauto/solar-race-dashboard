import { describe, expect, it } from 'vitest'
import {
  getLiveTelemetryGpsPosition,
  hasValidGpsCoordinates,
} from '@/lib/liveTelemetryGps'

describe('getLiveTelemetryGpsPosition', () => {
  it('returns a visible live GPS marker for valid California test coordinates', () => {
    const position = getLiveTelemetryGpsPosition({
      gpsLat: 34.096976,
      gpsLng: -118.052991,
      gpsFix: true,
      gpsAgeMs: 1000,
      gpsSatellites: 14,
      gpsHeading: 92,
      gpsElevationFt: 210,
    })

    expect(position).toEqual({
      lat: 34.096976,
      lng: -118.052991,
      fix: true,
      ageMs: 1000,
      satellites: 14,
      heading: 92,
      elevationFt: 210,
    })
  })

  it('returns null when telemetry has no valid GPS coordinates', () => {
    expect(
      getLiveTelemetryGpsPosition({
        gpsFix: false,
      })
    ).toBeNull()
  })

  it('returns null for null-island placeholder GPS coordinates', () => {
    expect(
      getLiveTelemetryGpsPosition({
        gpsLat: 0,
        gpsLng: 0,
        gpsFix: true,
      })
    ).toBeNull()
  })

  it('returns null when telemetry reports invalid or stale GPS', () => {
    expect(
      getLiveTelemetryGpsPosition({
        gpsLat: 31.738999,
        gpsLng: -95.604293,
        gpsFix: false,
      })
    ).toBeNull()

    expect(
      getLiveTelemetryGpsPosition({
        gpsLat: 31.738999,
        gpsLng: -95.604293,
        gpsFix: true,
        gpsAgeMs: 301_000,
      })
    ).toBeNull()
  })
})

describe('hasValidGpsCoordinates', () => {
  it('rejects invalid coordinate ranges', () => {
    expect(hasValidGpsCoordinates(91, -118)).toBe(false)
    expect(hasValidGpsCoordinates(34, -181)).toBe(false)
  })
})
