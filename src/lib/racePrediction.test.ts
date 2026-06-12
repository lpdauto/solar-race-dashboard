import { describe, expect, it } from 'vitest'
import type { RaceDay } from '@/data/raceRoute'
import { buildRacePrediction } from '@/lib/racePrediction'
import type { RaceScheduleEvent } from '@/lib/raceSchedule'
import type { TelemetryData } from '@/types/telemetry'

const now = Date.parse('2026-07-21T17:00:00.000Z')

const raceDay: RaceDay = {
  day: 3,
  date: 'July 21, 2026',
  start: 'Round Rock, TX',
  end: 'Fredericksburg, TX',
  distanceMiles: 50,
  highways: ['TX 29'],
  riskLevel: 'medium',
  terrainSummary: 'Deterministic prediction route.',
  strategySummary: 'Hold steady pace.',
  simulation: {
    estimatedWhPerMile: 40,
    estimatedBatteryUse: '2.0 kWh',
    solarRecovery: '1.0 kWh',
    regenOpportunity: 'Low',
  },
  routePoints: [
    { mile: 0, lat: 30.5, lng: -97.7, label: 'Start' },
    { mile: 20, lat: 30.6, lng: -98.0, label: 'Checkpoint' },
    { mile: 50, lat: 30.3, lng: -98.9, label: 'Finish' },
  ],
  segments: [
    {
      mileStart: 0,
      mileEnd: 25,
      title: 'Opening segment',
      type: 'flat',
      risk: 'low',
      notes: 'Test segment.',
      strategy: 'Cruise.',
    },
    {
      mileStart: 25,
      mileEnd: 50,
      title: 'Finish segment',
      type: 'climb',
      risk: 'medium',
      notes: 'Test climb.',
      strategy: 'Conserve.',
    },
  ],
}

const telemetry: TelemetryData = {
  timestamp: now,
  source: 'manual',
  speedMph: 35,
  batteryVoltage: 80,
  batteryCurrent: 15,
  batterySocPercent: 50,
  batteryEnergyWh: 2500,
  efficiencyWhPerMile: 40,
  whPerMile: 40,
  mpptChargePowerWatts: 600,
  netPowerWatts: -600,
}

const scheduleEvents: RaceScheduleEvent[] = [
  {
    id: 'drive-1',
    day: 3,
    type: 'drive',
    label: 'Drive to checkpoint',
    startMile: 0,
    endMile: 20,
    solarChargingAllowed: true,
    countsForMileage: true,
  },
  {
    id: 'checkpoint-1',
    day: 3,
    type: 'stop',
    label: 'Checkpoint',
    startMile: 20,
    endMile: 20,
    durationMinutes: 10,
    solarChargingAllowed: true,
    countsForMileage: false,
  },
  {
    id: 'drive-2',
    day: 3,
    type: 'drive',
    label: 'Drive to finish',
    startMile: 20,
    endMile: 50,
    solarChargingAllowed: true,
    countsForMileage: true,
  },
  {
    id: 'finish',
    day: 3,
    type: 'finish',
    label: 'Finish',
    startMile: 50,
    endMile: 50,
    solarChargingAllowed: false,
    countsForMileage: true,
  },
]

describe('buildRacePrediction', () => {
  it('calculates high-confidence projections from fresh telemetry and live MPPT', () => {
    const prediction = buildRacePrediction({
      telemetry,
      telemetryHistory: [],
      raceDay,
      currentSegment: raceDay.segments[0],
      currentMile: 10,
      telemetryTimestampMs: now,
      scheduleEvents,
      now,
    })

    expect(prediction.confidence).toBe('high')
    expect(prediction.predictedWhPerMile).toBe(40)
    expect(prediction.predictedMpptWatts).toBe(600)
    expect(prediction.remainingSegmentMiles).toBe(15)
    expect(prediction.projectedEndSegmentSocPercent).toBeCloseTo(43.21, 2)
    expect(prediction.projectedNextStopSocPercent).toBeCloseTo(45.5, 2)
    expect(prediction.projectedAfterNextStopSocPercent).toBeCloseTo(47.5, 2)
    expect(prediction.projectedSolarRecoveredStoppedWh).toBeCloseTo(100, 2)
    expect(prediction.projectedEndDaySocPercent).toBeCloseTo(33.77, 2)
    expect(prediction.reserveEnergyWh).toBeCloseTo(998.4, 2)
    expect(prediction.reserveMarginPercent).toBeCloseTo(13.77, 2)
    expect(prediction.energyMarginWh).toBeCloseTo(687.31, 2)
    expect(prediction.energyMarginKWh).toBeCloseTo(0.69, 2)
    expect(prediction.nextScheduleEventLabel).toBe('Checkpoint')
    expect(prediction.defaultScheduleWarningCount).toBe(0)
    expect(prediction.usesDefaultScheduleAssumptions).toBe(false)
    expect(prediction.postFinishSolarRecoveryIncluded).toBe(false)
    expect(prediction.morningSolarRecoveryIncluded).toBe(false)
    expect(prediction.warnings).toContain(
      'No explicit post-finish charging window is configured; post-finish solar recovery is excluded.'
    )
    expect(prediction.warnings).not.toContain(
      'Schedule uses 1 default stop/trailer duration estimate(s).'
    )
  })

  it('calculates energy margin independently from clamped projected SOC', () => {
    const prediction = buildRacePrediction({
      telemetry: {
        ...telemetry,
        batterySocPercent: 0,
        batteryEnergyWh: 0,
        speedMph: 30,
        efficiencyWhPerMile: 100,
        whPerMile: 100,
        mpptChargePowerWatts: 2000,
      },
      telemetryHistory: [],
      raceDay: {
        ...raceDay,
        distanceMiles: 80,
        routePoints: [
          { mile: 0, lat: 30.5, lng: -97.7, label: 'Start' },
          { mile: 80, lat: 30.3, lng: -98.9, label: 'Finish' },
        ],
      },
      currentSegment: {
        ...raceDay.segments[0],
        mileStart: 0,
        mileEnd: 80,
      },
      currentMile: 0,
      telemetryTimestampMs: now,
      scheduleEvents: [
        {
          id: 'drive',
          day: 3,
          type: 'drive',
          label: 'Drive segment',
          startMile: 0,
          endMile: 80,
          solarChargingAllowed: false,
          countsForMileage: true,
        },
        {
          id: 'solar-stop',
          day: 3,
          type: 'stop',
          label: 'Solar stop',
          startMile: 80,
          endMile: 80,
          durationMinutes: 240,
          solarChargingAllowed: true,
          countsForMileage: false,
        },
        {
          id: 'finish',
          day: 3,
          type: 'finish',
          label: 'Finish',
          startMile: 80,
          endMile: 80,
          solarChargingAllowed: false,
          countsForMileage: true,
        },
      ],
      now,
    })

    expect(prediction.projectedDriveEnergyWh).toBeCloseTo(6000, 2)
    expect(prediction.projectedSolarRecoveredWh).toBeCloseTo(8000, 2)
    expect(prediction.usableSolarRecoveryWh).toBeCloseTo(4992, 2)
    expect(prediction.wastedSolarRecoveryWh).toBeCloseTo(3008, 2)
    expect(prediction.projectedEndDaySocPercent).toBe(100)
    expect(prediction.energyMarginWh).toBeCloseTo(1001.6, 2)
    expect(prediction.energyMarginKWh).toBeCloseTo(1, 2)
  })

  it('marks generated default schedule assumptions and lowers confidence', () => {
    const prediction = buildRacePrediction({
      telemetry,
      telemetryHistory: [],
      raceDay,
      currentSegment: raceDay.segments[0],
      currentMile: 10,
      telemetryTimestampMs: now,
      now,
    })

    expect(prediction.confidence).toBe('medium')
    expect(prediction.usesDefaultScheduleAssumptions).toBe(true)
    expect(prediction.defaultScheduleWarningCount).toBeGreaterThan(0)
    expect(prediction.warnings.join(' ')).toContain('default stop/trailer')
  })

  it('makes conservative schedule forecasts no more optimistic than normal', () => {
    const normal = buildRacePrediction({
      telemetry,
      telemetryHistory: [],
      raceDay,
      currentSegment: raceDay.segments[0],
      currentMile: 10,
      telemetryTimestampMs: now,
      forecastMode: 'normal',
      now,
    })
    const conservative = buildRacePrediction({
      telemetry,
      telemetryHistory: [],
      raceDay,
      currentSegment: raceDay.segments[0],
      currentMile: 10,
      telemetryTimestampMs: now,
      forecastMode: 'conservative',
      now,
    })

    expect(conservative.forecastMode).toBe('conservative')
    expect(conservative.projectedSolarRecoveredWh ?? 0).toBeLessThanOrEqual(
      normal.projectedSolarRecoveredWh ?? 0
    )
    expect(conservative.energyMarginWh ?? 0).toBeLessThanOrEqual(
      normal.energyMarginWh ?? 0
    )
  })

  it('uses configured MPPT fallback and marks confidence medium when MPPT is missing', () => {
    const prediction = buildRacePrediction({
      telemetry: {
        ...telemetry,
        mpptChargePowerWatts: undefined,
        mpptPowerWatts: undefined,
        solarPowerWatts: undefined,
      },
      telemetryHistory: [],
      raceDay,
      currentSegment: raceDay.segments[0],
      currentMile: 10,
      telemetryTimestampMs: now,
      scheduleEvents,
      now,
    })

    expect(prediction.confidence).toBe('medium')
    expect(prediction.predictedMpptWatts).toBeGreaterThan(0)
    expect(prediction.warnings).toContain(
      'Using configured solar fallback for MPPT prediction.'
    )
  })

  it('keeps forecasts stable when MPPT is zero', () => {
    const prediction = buildRacePrediction({
      telemetry: {
        ...telemetry,
        mpptChargePowerWatts: 0,
        mpptPowerWatts: undefined,
        solarPowerWatts: undefined,
      },
      telemetryHistory: [],
      raceDay,
      currentSegment: raceDay.segments[0],
      currentMile: 10,
      telemetryTimestampMs: now,
      scheduleEvents,
      now,
    })

    expect(prediction.predictedMpptWatts).toBe(0)
    expect(prediction.confidence).toBe('medium')
    expect(prediction.warnings).toContain(
      'MPPT input is zero; solar recovery is unavailable and prediction confidence is reduced.'
    )
    expect(prediction.projectedSolarRecoveredWh).toBe(0)
    expect(prediction.projectedEndDaySocPercent).toBeGreaterThanOrEqual(0)
    expect(prediction.projectedEndDaySocPercent).toBeLessThanOrEqual(100)
  })

  it('clamps invalid battery telemetry and warns', () => {
    const prediction = buildRacePrediction({
      telemetry: {
        ...telemetry,
        batterySocPercent: 140,
        batteryEnergyWh: 7000,
      },
      telemetryHistory: [],
      raceDay,
      currentSegment: raceDay.segments[0],
      currentMile: 10,
      telemetryTimestampMs: now,
      scheduleEvents,
      now,
    })

    expect(prediction.currentBatteryEnergyWh).toBeLessThanOrEqual(4992)
    expect(prediction.currentSocPercent).toBe(100)
    expect(prediction.projectedNextStopSocPercent).toBeLessThanOrEqual(100)
    expect(prediction.projectedEndDaySocPercent).toBeLessThanOrEqual(100)
    expect(prediction.warnings).toContain(
      'Battery energy telemetry was outside usable capacity and was clamped.'
    )
    expect(prediction.warnings).toContain(
      'Battery SOC telemetry was outside 0-100% and was clamped.'
    )
  })

  it('marks stale telemetry low confidence and includes a stale-data warning', () => {
    const prediction = buildRacePrediction({
      telemetry,
      telemetryHistory: [],
      raceDay,
      currentSegment: raceDay.segments[0],
      currentMile: 10,
      telemetryTimestampMs: now - 11_000,
      scheduleEvents,
      now,
    })

    expect(prediction.confidence).toBe('low')
    expect(prediction.warnings).toContain(
      'Telemetry is stale; prediction confidence is low.'
    )
  })

  it('clamps high Wh/mi spikes so the forecast remains bounded', () => {
    const prediction = buildRacePrediction({
      telemetry: {
        ...telemetry,
        efficiencyWhPerMile: 220,
        whPerMile: 220,
      },
      telemetryHistory: [],
      raceDay,
      currentSegment: raceDay.segments[0],
      currentMile: 10,
      telemetryTimestampMs: now,
      scheduleEvents,
      now,
    })

    expect(prediction.predictedWhPerMile).toBe(75)
    expect(prediction.warnings).toContain(
      'Measured Wh/mi was clamped for prediction stability.'
    )
  })

  it('still includes solar recovery when the vehicle is stopped with MPPT input', () => {
    const prediction = buildRacePrediction({
      telemetry: {
        ...telemetry,
        speedMph: 0,
        batteryPowerWatts: 0,
        mpptChargePowerWatts: 1200,
        netPowerWatts: 1200,
      },
      telemetryHistory: [],
      raceDay,
      currentSegment: raceDay.segments[0],
      currentMile: 40,
      telemetryTimestampMs: now,
      scheduleEvents,
      now,
    })

    expect(prediction.predictedMpptWatts).toBe(1200)
    expect(prediction.projectedSolarRecoveredWh).toBeCloseTo(342.86, 2)
    expect(prediction.projectedEndDaySocPercent).toBeCloseTo(48.94, 2)
  })

  it('marks missing schedule low confidence and keeps a schedule warning', () => {
    const prediction = buildRacePrediction({
      telemetry,
      telemetryHistory: [],
      raceDay,
      currentSegment: raceDay.segments[0],
      currentMile: 10,
      telemetryTimestampMs: now,
      scheduleEvents: [],
      now,
    })

    expect(prediction.confidence).toBe('low')
    expect(prediction.warnings).toContain(
      'Race schedule is unavailable; prediction excludes stop and trailer recovery.'
    )
  })
})
