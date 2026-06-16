import { describe, expect, it } from 'vitest'
import { raceRoute, type RaceDay, type RouteSegment } from '@/data/raceRoute'
import { rx2Config } from '@/lib/race/rx2Config'
import { createInitialRaceBatteryState } from '@/lib/raceBatteryStrategy'
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
      terrainAdjustmentMode: 'disabled',
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

  it('calculates energy margin from clamped projected end-day SOC', () => {
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
    expect(prediction.projectedEndDayEnergyWh).toBeCloseTo(
      rx2Config.mainBatteryUsableWh,
      2
    )
    expect(prediction.energyMarginWh).toBeCloseTo(3993.6, 2)
    expect(prediction.energyMarginKWh).toBeCloseTo(3.99, 2)
    expect(prediction.energyMarginWh).toBeCloseTo(
      (prediction.projectedEndDaySocPercent! / 100) *
        rx2Config.mainBatteryUsableWh -
        prediction.reserveEnergyWh,
      2
    )
  })

  it('does not overstate margin with wasted solar overflow near full battery', () => {
    const prediction = buildRacePrediction({
      telemetry: {
        ...telemetry,
        batterySocPercent: 95,
        batteryEnergyWh: rx2Config.mainBatteryUsableWh * 0.95,
        speedMph: 25,
        efficiencyWhPerMile: 25,
        whPerMile: 25,
        mpptChargePowerWatts: 2500,
      },
      telemetryHistory: [],
      raceDay: {
        ...raceDay,
        distanceMiles: 10,
        routePoints: [
          { mile: 0, lat: 30.5, lng: -97.7, label: 'Start' },
          { mile: 10, lat: 30.3, lng: -98.9, label: 'Finish' },
        ],
      },
      currentSegment: {
        ...raceDay.segments[0],
        mileStart: 0,
        mileEnd: 10,
      },
      currentMile: 0,
      telemetryTimestampMs: now,
      scheduleEvents: [
        {
          id: 'drive',
          day: 3,
          type: 'drive',
          label: 'Short sunny segment',
          startMile: 0,
          endMile: 10,
          solarChargingAllowed: true,
          countsForMileage: true,
        },
        {
          id: 'finish',
          day: 3,
          type: 'finish',
          label: 'Finish',
          startMile: 10,
          endMile: 10,
          solarChargingAllowed: false,
          countsForMileage: true,
        },
      ],
      now,
    })

    const grossMargin =
      rx2Config.mainBatteryUsableWh * 0.95 +
      (prediction.projectedSolarRecoveredWh ?? 0) -
      (prediction.projectedDriveEnergyWh ?? 0) -
      prediction.reserveEnergyWh

    expect(prediction.wastedSolarRecoveryWh ?? 0).toBeGreaterThan(0)
    expect(prediction.projectedEndDaySocPercent).toBe(100)
    expect(prediction.energyMarginWh).toBeCloseTo(3993.6, 2)
    expect(prediction.energyMarginWh ?? 0).toBeLessThan(grossMargin)
    expect(prediction.energyMarginWh).toBeCloseTo(
      (prediction.projectedEndDaySocPercent! / 100) *
        rx2Config.mainBatteryUsableWh -
        prediction.reserveEnergyWh,
      2
    )
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

  it('uses race battery state instead of zero energy when telemetry is null', () => {
    const prediction = buildRacePrediction({
      telemetry: null,
      telemetryHistory: [],
      raceDay,
      currentSegment: raceDay.segments[0],
      currentMile: 10,
      raceBatteryState: createInitialRaceBatteryState({
        now,
        activeSocPercent: 80,
        spareSocPercent: 90,
      }),
      scheduleEvents,
      now,
    })

    expect(prediction.currentSocPercent).toBe(80)
    expect(prediction.currentBatteryEnergyWh).toBeCloseTo(
      rx2Config.mainBatteryUsableWh * 0.8,
      2
    )
    expect(prediction.batteryProjectionSource).toBe('race_battery_state')
    expect(prediction.telemetryNullFallbackSource).toBe(
      'raceBatteryState.activePack'
    )
    expect(prediction.raceBatteryStateProjectionFallbackUsed).toBe(true)
    expect(prediction.confidence).toBe('low')
    expect(prediction.warnings.join(' ')).not.toContain('0%')
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
      terrainAdjustmentMode: 'disabled',
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

  it('applies minimal correction on a mostly flat route window', () => {
    const day = raceRoute[3]
    const currentMile = 130
    const prediction = buildRacePrediction({
      telemetry: {
        ...telemetry,
        batterySocPercent: 85,
        batteryEnergyWh: rx2Config.mainBatteryUsableWh * 0.85,
        whPerMile: 45,
        efficiencyWhPerMile: 45,
      },
      telemetryHistory: [],
      raceDay: day,
      currentSegment: segmentForMile(day, currentMile),
      currentMile,
      telemetryTimestampMs: now,
      scheduleEvents: [],
      now,
    })

    expect(prediction.terrainAdjustmentApplied).toBe(true)
    expect(prediction.terrainEnergyWh ?? 0).toBeLessThan(60)
    expect(
      Math.abs(
        (prediction.projectedEndDaySocPercent ?? 0) -
          (prediction.projectedEndDaySocPercentBeforeTerrain ?? 0)
      )
    ).toBeLessThan(1.5)
  })

  it('lowers projected SOC when a large climb is ahead', () => {
    const day = raceRoute[3]
    const currentMile = 2
    const prediction = buildRacePrediction({
      telemetry: {
        ...telemetry,
        batterySocPercent: 90,
        batteryEnergyWh: rx2Config.mainBatteryUsableWh * 0.9,
        whPerMile: 42,
        efficiencyWhPerMile: 42,
      },
      telemetryHistory: [],
      raceDay: day,
      currentSegment: segmentForMile(day, currentMile),
      currentMile,
      telemetryTimestampMs: now,
      scheduleEvents: [],
      now,
    })

    expect(prediction.climbEnergyWh ?? 0).toBeGreaterThan(0)
    expect(prediction.netTerrainWh ?? 0).toBeGreaterThan(0)
    expect(prediction.projectedEndDaySocPercent).toBeLessThan(
      prediction.projectedEndDaySocPercentBeforeTerrain ?? 100
    )
  })

  it('credits descent recovery within validated caps', () => {
    const day = {
      ...raceRoute[3],
      distanceMiles: 23,
      routePoints: [
        { mile: 0, lat: 30.2752, lng: -98.8719, label: 'Window start' },
        { mile: 23, lat: 30.2752, lng: -98.8719, label: 'Window finish' },
      ],
      segments: [
        {
          mileStart: 13,
          mileEnd: 23,
          title: 'Descent validation window',
          type: 'descent',
          risk: 'medium',
          notes: 'Validation descent.',
          strategy: 'Recover conservatively.',
        },
      ],
    } satisfies RaceDay
    const currentMile = 13
    const prediction = buildRacePrediction({
      telemetry: {
        ...telemetry,
        batterySocPercent: 80,
        batteryEnergyWh: rx2Config.mainBatteryUsableWh * 0.8,
        whPerMile: 42,
        efficiencyWhPerMile: 42,
      },
      telemetryHistory: [],
      raceDay: day,
      currentSegment: day.segments[0],
      currentMile,
      telemetryTimestampMs: now,
      scheduleEvents: [],
      now,
    })

    expect(prediction.descentRecoveryWh ?? 0).toBeGreaterThan(0)
    expect(prediction.descentRecoveryWh ?? 0).toBeLessThanOrEqual(
      (prediction.climbEnergyWh ?? 0) * 0.3 + 0.1
    )
    expect(prediction.descentRecoveryWh ?? 0).toBeLessThanOrEqual(
      ((prediction.terrainWindowEndMile ?? 0) -
        (prediction.terrainWindowStartMile ?? 0)) *
        35
    )
    expect(prediction.netTerrainWh ?? 0).toBeLessThan(
      prediction.climbEnergyWh ?? Number.POSITIVE_INFINITY
    )
  })

  it('reduces terrain influence when rolling telemetry is active', () => {
    const day = raceRoute[4]
    const currentMile = 0
    const liveOnly = buildRacePrediction({
      telemetry: {
        ...telemetry,
        batterySocPercent: 90,
        batteryEnergyWh: rx2Config.mainBatteryUsableWh * 0.9,
        whPerMile: 42,
        efficiencyWhPerMile: 42,
      },
      telemetryHistory: [],
      raceDay: day,
      currentSegment: segmentForMile(day, currentMile),
      currentMile,
      telemetryTimestampMs: now,
      scheduleEvents: [],
      now,
    })
    const rolling = buildRacePrediction({
      telemetry: {
        ...telemetry,
        batterySocPercent: 90,
        batteryEnergyWh: rx2Config.mainBatteryUsableWh * 0.9,
        whPerMile: 42,
        efficiencyWhPerMile: 42,
      },
      telemetryHistory: [
        {
          timestamp: now - 30_000,
          distanceMiles: 0,
          batteryEnergyUsedWh: 0,
          speedMph: 35,
        },
        {
          timestamp: now,
          distanceMiles: 5,
          batteryEnergyUsedWh: 210,
          speedMph: 35,
        },
      ],
      raceDay: day,
      currentSegment: segmentForMile(day, currentMile),
      currentMile,
      telemetryTimestampMs: now,
      scheduleEvents: [],
      now,
    })

    expect(rolling.terrainAdjustmentSource).toBe('rolling')
    expect(rolling.terrainAdjustmentWeight).toBeCloseTo(0.35, 2)
    expect(rolling.terrainAppliedWindowStartMile).toBeGreaterThan(currentMile)
    expect(rolling.terrainEnergyWh ?? 0).toBeLessThan(
      liveOnly.terrainEnergyWh ?? 0
    )
  })

  it('fully applies terrain correction when telemetry is unavailable', () => {
    const day = raceRoute[4]
    const currentMile = 0
    const prediction = buildRacePrediction({
      telemetry: null,
      telemetryHistory: [],
      raceDay: day,
      currentSegment: segmentForMile(day, currentMile),
      currentMile,
      raceBatteryState: createInitialRaceBatteryState({
        now,
        activeSocPercent: 80,
        spareSocPercent: 90,
      }),
      scheduleEvents: [],
      now,
    })

    expect(prediction.terrainAdjustmentSource).toBe('fallback')
    expect(prediction.terrainAdjustmentWeight).toBe(1)
    expect(prediction.terrainEnergyWh ?? 0).toBeGreaterThan(0)
    expect(prediction.predictedWhPerMile).toBeGreaterThan(
      prediction.predictedWhPerMileBeforeTerrain ?? 0
    )
    expect(prediction.confidence).toBe('low')
  })

  it('spreads schedule terrain correction across remaining driving miles only', () => {
    const day = {
      ...raceRoute[3],
      distanceMiles: 50,
      scoringDistanceMiles: undefined,
      physicalDistanceMiles: undefined,
      mandatoryTraileringMiles: undefined,
      routePoints: [
        { mile: 0, lat: 30.2752, lng: -98.8719, label: 'Window start' },
        { mile: 50, lat: 31.1352, lng: -99.3351, label: 'Window finish' },
      ],
      segments: [
        {
          mileStart: 0,
          mileEnd: 20,
          title: 'Driving climb',
          type: 'climb',
          risk: 'high',
          notes: 'Synthetic driving window.',
          strategy: 'Conserve.',
        },
        {
          mileStart: 20,
          mileEnd: 30,
          title: 'Mandatory trailer test segment',
          type: 'mandatory_trailer',
          risk: 'low',
          notes: 'Synthetic trailer window.',
          strategy: 'Transport.',
          scoringMiles: 0,
          transportMiles: 10,
        },
        {
          mileStart: 30,
          mileEnd: 50,
          title: 'Driving finish',
          type: 'flat',
          risk: 'medium',
          notes: 'Synthetic driving window.',
          strategy: 'Cruise.',
        },
      ],
    } satisfies RaceDay
    const prediction = buildRacePrediction({
      telemetry: {
        ...telemetry,
        batterySocPercent: 90,
        batteryEnergyWh: rx2Config.mainBatteryUsableWh * 0.9,
        whPerMile: 42,
        efficiencyWhPerMile: 42,
      },
      telemetryHistory: [],
      raceDay: day,
      currentSegment: day.segments[0],
      currentMile: 0,
      telemetryTimestampMs: now,
      scheduleEvents: [],
      now,
    })

    expect(prediction.terrainAdjustmentDistanceMiles).toBe(40)
    expect(prediction.predictedWhPerMile).toBeCloseTo(
      42 + (prediction.terrainEnergyWh ?? 0) / 40,
      5
    )
  })
})

function segmentForMile(day: RaceDay, mile: number): RouteSegment {
  return (
    day.segments.find(
      (segment) =>
        segment.type !== 'mandatory_trailer' &&
        mile >= segment.mileStart &&
        mile < segment.mileEnd
    ) ?? day.segments[0]
  )
}
