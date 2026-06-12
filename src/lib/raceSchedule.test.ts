import { describe, expect, it } from 'vitest'
import {
  forecastRaceScheduleEnergy,
  type RaceScheduleEvent,
} from '@/lib/raceSchedule'

const baseForecastInput = {
  currentMile: 0,
  currentBatteryEnergyWh: 2500,
  predictedWhPerMile: 50,
  predictedMpptWatts: 1000,
  driveSpeedMph: 50,
  batteryCapacityWh: 5000,
}

describe('race schedule energy forecast', () => {
  it('recovers solar during a 30-minute stop', () => {
    const forecast = forecastRaceScheduleEnergy({
      ...baseForecastInput,
      predictedMpptWatts: 1200,
      events: [
        scheduleEvent({
          id: 'stop-1',
          type: 'stop',
          label: 'Checkpoint stop',
          startMile: 0,
          durationMinutes: 30,
        }),
      ],
    })

    expect(forecast.projectedSolarRecoveredStoppedWh).toBeCloseTo(600, 6)
    expect(forecast.projectedSolarRecoveredWh).toBeCloseTo(600, 6)
    expect(forecast.usableSolarRecoveryWh).toBeCloseTo(600, 6)
    expect(forecast.wastedSolarRecoveryWh).toBeCloseTo(0, 6)
  })

  it('estimates trailer recovery from trailer miles and default trailer speed', () => {
    const forecast = forecastRaceScheduleEnergy({
      ...baseForecastInput,
      predictedMpptWatts: 1000,
      defaultTrailerSpeedMph: 40,
      events: [
        scheduleEvent({
          id: 'trailer-1',
          type: 'trailer',
          label: 'Trailer segment',
          startMile: 0,
          endMile: 20,
          durationMinutes: undefined,
        }),
      ],
    })

    expect(forecast.projectedSolarRecoveredTraileringWh).toBeCloseTo(500, 6)
    expect(forecast.usesEstimatedDurations).toBe(true)
    expect(forecast.estimatedDurationEventCount).toBe(1)
  })

  it('combines drive consumption, driving solar, and stop recovery', () => {
    const forecast = forecastRaceScheduleEnergy({
      ...baseForecastInput,
      predictedWhPerMile: 50,
      predictedMpptWatts: 1000,
      driveSpeedMph: 50,
      events: [
        scheduleEvent({
          id: 'drive-1',
          type: 'drive',
          label: 'Opening drive',
          startMile: 0,
          endMile: 10,
          countsForMileage: true,
        }),
        scheduleEvent({
          id: 'stop-1',
          type: 'stop',
          label: 'Rest stop',
          startMile: 10,
          durationMinutes: 30,
        }),
      ],
    })

    expect(forecast.projectedDriveEnergyWh).toBeCloseTo(500, 6)
    expect(forecast.projectedSolarRecoveredDrivingWh).toBeCloseTo(200, 6)
    expect(forecast.projectedSolarRecoveredStoppedWh).toBeCloseTo(500, 6)
    expect(forecast.projectedEndDaySocPercent).toBeCloseTo(54, 6)
    expect(forecast.nextScheduleEventLabel).toBe('Rest stop')
    expect(forecast.projectedNextScheduleEventSocPercent).toBeCloseTo(44, 6)
    expect(forecast.projectedAfterNextStopSocPercent).toBeCloseTo(54, 6)
  })

  it('reports default duration assumptions without marking explicit stops as default', () => {
    const forecast = forecastRaceScheduleEnergy({
      ...baseForecastInput,
      events: [
        scheduleEvent({
          id: 'default-stop',
          type: 'stop',
          label: 'Default checkpoint stop',
          startMile: 10,
          durationMinutes: 10,
          usesDefaultDuration: true,
        }),
        scheduleEvent({
          id: 'explicit-stop',
          type: 'rest',
          label: 'Crew-specified rest stop',
          startMile: 20,
          durationMinutes: 18,
          usesDefaultDuration: false,
        }),
      ],
    })

    expect(forecast.usesDefaultDurations).toBe(true)
    expect(forecast.defaultDurationEventCount).toBe(1)
  })

  it('does not include post-finish or morning recovery unless explicit events exist', () => {
    const forecast = forecastRaceScheduleEnergy({
      ...baseForecastInput,
      events: [
        scheduleEvent({
          id: 'finish',
          type: 'finish',
          label: 'Finish',
          startMile: 20,
          solarChargingAllowed: false,
        }),
      ],
    })

    expect(forecast.projectedSolarRecoveredPostFinishWh).toBe(0)
    expect(forecast.projectedSolarRecoveredMorningWh).toBe(0)
    expect(forecast.postFinishSolarRecoveryIncluded).toBe(false)
    expect(forecast.morningSolarRecoveryIncluded).toBe(false)
  })

  it('separates usable and wasted solar when storage is full', () => {
    const forecast = forecastRaceScheduleEnergy({
      ...baseForecastInput,
      currentBatteryEnergyWh: 4900,
      predictedMpptWatts: 1200,
      events: [
        scheduleEvent({
          id: 'long-stop',
          type: 'stop',
          label: 'Long checkpoint stop',
          startMile: 0,
          durationMinutes: 60,
        }),
      ],
    })

    expect(forecast.projectedSolarRecoveredWh).toBeCloseTo(1200, 6)
    expect(forecast.usableSolarRecoveryWh).toBeCloseTo(100, 6)
    expect(forecast.wastedSolarRecoveryWh).toBeCloseTo(1100, 6)
    expect(forecast.projectedEndDaySocPercent).toBe(100)
  })

  it('keeps conservative forecasts less optimistic for default recovery windows', () => {
    const events: RaceScheduleEvent[] = [
      scheduleEvent({
        id: 'default-stop',
        type: 'stop',
        label: 'Default checkpoint stop',
        startMile: 0,
        durationMinutes: 30,
        usesDefaultDuration: true,
      }),
    ]
    const normal = forecastRaceScheduleEnergy({
      ...baseForecastInput,
      events,
      forecastMode: 'normal',
    })
    const conservative = forecastRaceScheduleEnergy({
      ...baseForecastInput,
      events,
      forecastMode: 'conservative',
    })

    expect(conservative.forecastMode).toBe('conservative')
    expect(conservative.projectedSolarRecoveredStoppedWh).toBeLessThan(
      normal.projectedSolarRecoveredStoppedWh
    )
    expect(conservative.projectedEndDaySocPercent).toBeLessThanOrEqual(
      normal.projectedEndDaySocPercent
    )
  })

  it('includes explicit post-finish and morning recovery in separate buckets', () => {
    const forecast = forecastRaceScheduleEnergy({
      ...baseForecastInput,
      predictedMpptWatts: 900,
      events: [
        scheduleEvent({
          id: 'post-finish',
          type: 'post-finish',
          label: 'Post-finish charging window',
          startMile: 0,
          durationMinutes: 60,
        }),
        scheduleEvent({
          id: 'morning',
          type: 'morning',
          label: 'Morning charging window',
          startMile: 0,
          durationMinutes: 30,
        }),
      ],
    })

    expect(forecast.projectedSolarRecoveredPostFinishWh).toBeCloseTo(900, 6)
    expect(forecast.projectedSolarRecoveredMorningWh).toBeCloseTo(450, 6)
    expect(forecast.postFinishSolarRecoveryIncluded).toBe(true)
    expect(forecast.morningSolarRecoveryIncluded).toBe(true)
  })
})

function scheduleEvent(
  event: Partial<RaceScheduleEvent> & Pick<RaceScheduleEvent, 'id' | 'type' | 'label'>
): RaceScheduleEvent {
  return {
    day: 1,
    solarChargingAllowed: true,
    countsForMileage: false,
    ...event,
  }
}
