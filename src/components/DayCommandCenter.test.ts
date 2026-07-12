import { describe, expect, it } from 'vitest'
import {
  formatForecastNetEnergy,
  getDisplayedGpsStatus,
} from '@/components/DayCommandCenter'

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
  it('shows Android provider GPS as vehicle GPS', () => {
    const gps = getDisplayedGpsStatus({
      vehicleLocation: {
        latitude: 34.096981,
        longitude: -118.05299,
        speedMps: 4.47,
        speedMph: 10,
        heading: null,
        altitudeMeters: 68.3,
        altitudeFeet: 224,
        accuracyMeters: 3.5,
        altitudeAccuracyMeters: null,
        clientTimestamp: Date.parse('2026-07-11T12:00:00.000Z'),
        serverTimestamp: Date.parse('2026-07-11T12:00:01.000Z'),
        ageMs: 1000,
        status: 'online',
        providerName: 'Android GPS Device',
        source: 'phone',
      },
    })

    expect(gps.hasFix).toBe(true)
    expect(gps.latLon).toBe('34.096981, -118.052990')
    expect(gps.heading).toBe('--')
    expect(gps.provider).toBe('Android GPS Device')
    expect(gps.statusLabel).toBe('GPS FIXED')
    expect(gps.statusMessage).toBe('Android vehicle GPS is fresh.')
  })

  it('shows stale when Android provider coordinates are 10 to 30 seconds old', () => {
    const gps = getDisplayedGpsStatus({
      vehicleLocation: {
        latitude: 34.096981,
        longitude: -118.05299,
        speedMps: null,
        speedMph: null,
        heading: 182,
        altitudeMeters: null,
        altitudeFeet: null,
        accuracyMeters: null,
        altitudeAccuracyMeters: null,
        clientTimestamp: null,
        serverTimestamp: null,
        ageMs: 15_000,
        status: 'stale',
        providerName: 'Android GPS Device',
        source: 'phone',
      },
    })

    expect(gps.hasFix).toBe(true)
    expect(gps.statusLabel).toBe('GPS STALE')
    expect(gps.heading).toBe('182°')
    expect(gps.speed).toBe('--')
  })

  it('shows dashes when Android GPS values are unavailable', () => {
    const gps = getDisplayedGpsStatus({
      vehicleLocation: {
        latitude: null,
        longitude: null,
        speedMps: null,
        speedMph: null,
        heading: null,
        altitudeMeters: null,
        altitudeFeet: null,
        accuracyMeters: null,
        altitudeAccuracyMeters: null,
        clientTimestamp: null,
        serverTimestamp: null,
        ageMs: null,
        status: 'offline',
        providerName: null,
        source: 'none',
      },
    })

    expect(gps.hasFix).toBe(false)
    expect(gps.statusLabel).toBe('NO GPS PROVIDER')
    expect(gps.latLon).toBe('--')
    expect(gps.heading).toBe('--')
    expect(gps.altitude).toBe('--')
  })
})
