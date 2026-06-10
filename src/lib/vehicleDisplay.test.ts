import { describe, expect, it } from 'vitest'
import { buildVehicleDisplayData } from '@/lib/vehicleDisplay'

describe('buildVehicleDisplayData', () => {
  it('maps latest vehicle telemetry into driver display data', () => {
    expect(
      buildVehicleDisplayData({
        speedMph: 30,
        packPowerWatts: 4350,
        packSoc: 82,
      })
    ).toEqual({
      soc: 82,
      whPerMile: 145,
      checkpointDistanceMiles: null,
      arrival: '--:--',
      status: 'ON TARGET',
      targetSpeedMph: 30,
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
        speedMph: 20,
        packPowerWatts: 5000,
        soc: 71,
      })
    ).toMatchObject({
      soc: 71,
      whPerMile: 250,
      status: 'SLOW DOWN',
    })
  })
})
