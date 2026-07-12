import { describe, expect, it } from 'vitest'
import { buildVehicleDisplayData } from '@/lib/vehicleDisplay'

describe('buildVehicleDisplayData', () => {
  it('maps latest vehicle telemetry into driver display data', () => {
    expect(
      buildVehicleDisplayData({
        speedMph: 35,
        packPowerWatts: 1400,
        packSoc: 82,
      })
    ).toEqual({
      soc: 82,
      whPerMile: 40,
      checkpointDistanceMiles: null,
      arrival: '--:--',
      status: 'ON TARGET',
      targetSpeedMph: 35,
      vehicle: {
        location: {
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
      },
      gpsSource: 'none',
      gpsAgeMs: null,
      gpsStatus: 'offline',
      gpsLat: null,
      gpsLng: null,
      gpsSpeedMph: null,
      gpsHeading: null,
      gpsElevationFt: null,
      gpsAccuracy: null,
      gpsProviderDeviceName: null,
    })
  })

  it('waits for valid moving power data before reporting efficiency', () => {
    expect(
      buildVehicleDisplayData({
        speedMph: 0,
        packPowerWatts: 0,
        packSoc: 88,
      })
    ).toMatchObject({
      soc: 88,
      whPerMile: null,
      status: 'WAITING DATA',
    })
  })

  it('classifies high Wh per mile as a slow-down status', () => {
    expect(
      buildVehicleDisplayData({
        speedMph: 35,
        packPowerWatts: 2450,
        soc: 71,
      })
    ).toMatchObject({
      soc: 71,
      whPerMile: 70,
      status: 'SLOW DOWN',
    })
  })

  it('includes fresh phone GPS fields without changing driver telemetry', () => {
    expect(
      buildVehicleDisplayData(
        {
          speedMph: 35,
          packPowerWatts: 1400,
          packSoc: 82,
          gpsSource: 'esp32',
          gpsStatus: 'searching',
          gpsLat: 0,
          gpsLng: 0,
        },
        {
          latitude: 34.096981,
          longitude: -118.05299,
          speedMps: 4.47,
          speedMph: 10,
          heading: null,
          altitudeMeters: 62,
          altitudeFeet: 203,
          accuracyMeters: 3.5,
          altitudeAccuracyMeters: null,
          clientTimestamp: Date.parse('2026-07-11T12:00:00.000Z'),
          serverTimestamp: Date.parse('2026-07-11T12:00:01.000Z'),
          ageMs: 1200,
          status: 'online',
          providerName: 'Android GPS Device',
          source: 'phone',
        }
      )
    ).toMatchObject({
      soc: 82,
      whPerMile: 40,
      gpsSource: 'phone',
      gpsStatus: 'online',
      gpsAgeMs: 1200,
      gpsLat: 34.096981,
      gpsLng: -118.05299,
      gpsSpeedMph: 10,
      gpsHeading: null,
      gpsElevationFt: 203,
      gpsAccuracy: 3.5,
      gpsProviderDeviceName: 'Android GPS Device',
    })
  })
})
