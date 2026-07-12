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
      buildVehicleDisplayData({
        speedMph: 35,
        packPowerWatts: 1400,
        packSoc: 82,
        gpsSource: 'phone',
        gpsStatus: 'live',
        gpsAgeMs: 1200,
        gpsLat: 34.096981,
        gpsLng: -118.05299,
        gpsSpeedMph: 10,
        gpsHeading: null,
        gpsElevationFt: 203,
        gpsAccuracy: 3.5,
        gpsProviderDeviceName: 'Android GPS Device',
      })
    ).toMatchObject({
      soc: 82,
      whPerMile: 40,
      gpsSource: 'phone',
      gpsStatus: 'live',
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
