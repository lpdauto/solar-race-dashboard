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
  it('shows cloud GPS lock from telemetry even when vehicle freshness is stale elsewhere', () => {
    const gps = getDisplayedGpsStatus({
      source: 'cloud',
      telemetry: {
        gpsLat: 34.096981,
        gpsLng: -118.05299,
        gpsValid: true,
        gpsLocationValid: true,
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
    expect(gps.statusLabel).toBe('GPS LOCKED · 21 SATS')
    expect(gps.statusMessage).toBe('Vehicle GPS lock is available.')
  })

  it('shows cloud GPS searching when gpsValid is false', () => {
    const gps = getDisplayedGpsStatus({
      source: 'cloud',
      telemetry: {
        gpsLat: 34.096981,
        gpsLng: -118.05299,
        gpsValid: false,
        gpsLocationValid: false,
        gpsAgeMs: 1000,
        gpsSatellites: 4,
      } as TelemetryData,
      geolocation: emptyGeolocation,
    })

    expect(gps.hasFix).toBe(false)
    expect(gps.statusLabel).toBe('GPS SEARCHING')
    expect(gps.statusMessage).toBe('Vehicle GPS is searching for a valid lock.')
  })

  it('shows no GPS data when vehicle GPS fields are missing', () => {
    const gps = getDisplayedGpsStatus({
      source: 'cloud',
      telemetry: {} as TelemetryData,
      geolocation: emptyGeolocation,
    })

    expect(gps.hasFix).toBe(false)
    expect(gps.statusLabel).toBe('NO GPS DATA')
    expect(gps.statusMessage).toBe('No vehicle GPS packet has been reported.')
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
