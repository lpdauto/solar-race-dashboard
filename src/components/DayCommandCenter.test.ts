import { describe, expect, it } from 'vitest'
import {
  formatForecastNetEnergy,
  getDisplayedGpsStatus,
} from '@/components/DayCommandCenter'
import type { GeolocationState } from '@/hooks/useGeolocation'
import type { TelemetryData } from '@/types/telemetry'

describe('strategy forecast net energy formatting', () => {
  it('labels negative net energy as a displayed surplus', () => {
    expect(formatForecastNetEnergy(-8900)).toBe('+8.90 kWh surplus')
  })

  it('labels positive net energy as a displayed deficit', () => {
    expect(formatForecastNetEnergy(6200)).toBe('-6.20 kWh deficit')
  })

  it('labels zero net energy as balanced', () => {
    expect(formatForecastNetEnergy(0)).toBe('0 Wh balanced')
  })
})

describe('vehicle systems GPS status', () => {
  it('keeps cloud GPS available when vehicle telemetry freshness is offline', () => {
    const gps = getDisplayedGpsStatus({
      source: 'cloud',
      telemetry: {
        gpsLat: 34.096981,
        gpsLng: -118.05299,
        gpsFix: false,
        gpsAgeMs: 1000,
        gpsSatellites: 21,
        gpsHeading: 0,
        gpsElevationFt: 224,
      } as TelemetryData,
      geolocation: emptyGeolocation,
      vehicleIsOnline: false,
    })

    expect(gps.hasFix).toBe(true)
    expect(gps.latLon).toBe('34.096981, -118.052990')
    expect(gps.statusMessage).toBe(
      'GPS coordinates are available; vehicle telemetry is stale or offline.'
    )
  })

  it('keeps GPS unavailable when vehicle telemetry is offline and coordinates are missing', () => {
    const gps = getDisplayedGpsStatus({
      source: 'cloud',
      telemetry: {} as TelemetryData,
      geolocation: emptyGeolocation,
      vehicleIsOnline: false,
    })

    expect(gps.hasFix).toBe(false)
    expect(gps.statusLabel).toBe('Vehicle offline')
    expect(gps.statusMessage).toBe(
      'GPS unavailable because vehicle telemetry is offline.'
    )
  })
})

const emptyGeolocation: GeolocationState = {
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  speedMps: null,
  headingDegrees: null,
  timestamp: null,
  status: 'idle',
  errorMessage: null,
  startWatching: () => undefined,
  stopWatching: () => undefined,
}
