import { describe, expect, it } from 'vitest'
import {
  gpsErrorMessage,
  phoneGpsRecordFromBrowserPosition,
  phoneGpsWatchOptions,
  shouldStartPhoneGpsWatcher,
  supportsPhoneGpsProvider,
} from '@/lib/phoneGpsClient'

function position(overrides: Partial<GeolocationCoordinates> = {}) {
  return {
    coords: {
      latitude: 34.096981,
      longitude: -118.05299,
      accuracy: 3,
      altitude: 62,
      altitudeAccuracy: 8,
      heading: 180,
      speed: 4.4704,
      ...overrides,
    },
    timestamp: Date.parse('2026-07-11T12:00:00.000Z'),
  } as GeolocationPosition
}

describe('phone GPS client helpers', () => {
  it('uses the required high-accuracy watch options', () => {
    expect(phoneGpsWatchOptions).toEqual({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000,
    })
  })

  it('detects unsupported browsers without requesting permission', () => {
    expect(supportsPhoneGpsProvider(undefined)).toBe(false)
    expect(supportsPhoneGpsProvider({ geolocation: undefined as never })).toBe(false)
  })

  it('maps permission denied errors to Android settings guidance', () => {
    const error = {
      code: 1,
      PERMISSION_DENIED: 1,
      TIMEOUT: 3,
      message: 'denied',
    }

    expect(gpsErrorMessage(error)).toMatchObject({
      permissionDenied: true,
      message:
        'Location permission was denied. Open Android browser settings, enable Location for this site, then retry.',
    })
  })

  it('prevents duplicate watchers', () => {
    expect(shouldStartPhoneGpsWatcher(null)).toBe(true)
    expect(shouldStartPhoneGpsWatcher(7)).toBe(false)
  })

  it('keeps null speed and heading null instead of converting to zero', () => {
    const reading = phoneGpsRecordFromBrowserPosition({
      position: position({
        speed: null,
        heading: null,
        altitude: null,
        altitudeAccuracy: null,
      }),
      providerId: 'device',
      sessionId: 'session',
      deviceName: 'Android GPS Device',
    })

    expect(reading.speedMps).toBeNull()
    expect(reading.speedMph).toBeNull()
    expect(reading.headingDegrees).toBeNull()
    expect(reading.altitudeMeters).toBeNull()
    expect(reading.altitudeFeet).toBeNull()
    expect(reading.altitudeAccuracyMeters).toBeNull()
  })

  it('converts speed to mph and altitude to feet', () => {
    const reading = phoneGpsRecordFromBrowserPosition({
      position: position(),
      providerId: 'device',
      sessionId: 'session',
      deviceName: 'Android GPS Device',
    })

    expect(reading.speedMph).toBeCloseTo(10, 3)
    expect(reading.altitudeFeet).toBeCloseTo(203.41, 2)
  })
})
