import { describe, expect, it } from 'vitest'
import type { RaceDay } from '@/data/raceRoute'
import type { TelemetryHistorySample } from '@/hooks/useTelemetry'
import { defaultCarSetup, type EnergySimulationResult } from '@/lib/energy'
import {
  buildRaceCaptainEnergyModel,
  buildRouteSocProjection,
  calculateRollingWhPerMile,
  calculateTimeToSunset,
  getSunsetLocation,
} from '@/lib/raceCaptainEnergy'
import { generatePredictiveStrategy } from '@/lib/strategyEngine'
import type { TelemetryData } from '@/types/telemetry'

const fixedNow = new Date('2026-07-21T17:00:00.000Z')
const fixedAfterSunset = new Date('2026-07-22T03:00:00.000Z')

const mockRaceDay: RaceDay = {
  day: 3,
  date: 'July 21, 2026',
  start: 'San Angelo, TX',
  end: 'Fort Stockton, TX',
  distanceMiles: 100,
  highways: ['US 67'],
  riskLevel: 'medium',
  terrainSummary: 'Fixed deterministic route.',
  strategySummary: 'Fixed deterministic strategy.',
  simulation: {
    estimatedWhPerMile: 40,
    estimatedBatteryUse: '4.0 kWh',
    solarRecovery: '2.7 kWh',
    regenOpportunity: 'Low',
  },
  routePoints: [
    { mile: 0, lat: 31.0, lng: -100.0, label: 'Start' },
    { mile: 50, lat: 31.5, lng: -100.5, label: 'Midpoint' },
    { mile: 100, lat: 32.0, lng: -101.0, label: 'Finish' },
  ],
  segments: [
    {
      mileStart: 0,
      mileEnd: 30,
      title: 'Flat opener',
      type: 'flat',
      risk: 'low',
      notes: 'Fixed flat segment.',
      strategy: 'Cruise.',
    },
    {
      mileStart: 30,
      mileEnd: 60,
      title: 'High consumption climb',
      type: 'climb',
      risk: 'high',
      notes: 'Fixed climb.',
      strategy: 'Conserve.',
    },
    {
      mileStart: 60,
      mileEnd: 80,
      title: 'Rest stop approach',
      type: 'stop',
      risk: 'medium',
      notes: 'Fixed stop.',
      strategy: 'Prepare stop.',
    },
    {
      mileStart: 80,
      mileEnd: 100,
      title: 'Finish run',
      type: 'flat',
      risk: 'low',
      notes: 'Fixed finish.',
      strategy: 'Finish.',
    },
  ],
}

const baseEnergySimulation: EnergySimulationResult = {
  flatRoadWh: 3_200,
  climbWh: 800,
  regenWh: 200,
  solarWh: 700,
  netWh: 3_300,
  netKwh: 3.3,
  batteryPercentUsed: 40,
  estimatedWhPerMile: 40,
  predictedFinishSocPercent: 60,
  riskLevel: 'low',
}

const baseTelemetry: TelemetryData = {
  timestamp: fixedNow.getTime(),
  source: 'manual',
  speedMph: 35,
  batteryVoltage: 100,
  batteryCurrent: 14,
  batterySocPercent: 64,
  batterySocPercentValid: true,
  gpsLat: 31.0,
  gpsLng: -100.0,
  solarPowerWatts: 742,
  mpptChargePowerWatts: 700,
  mpptPvPowerWatts: 760,
  mpptDailyEnergyWh: 2710,
  netPowerWatts: -700,
  batteryEnergyWh: 3200,
  energyConsumedWh: 120,
  energyRecoveredWh: 45,
  efficiencyWhPerMile: 40,
  whPerMile: 40,
}

const carSetup = {
  ...defaultCarSetup,
  batteryKwh: 5,
  solarWatts: 742,
  solarDrivingHours: 4,
  spareBatterySocPercent: 81,
}

function buildStrategy({
  telemetry = baseTelemetry,
  currentMile = 0,
  spareBatterySocPercent = carSetup.spareBatterySocPercent,
  raceDay = mockRaceDay,
  energySimulation = baseEnergySimulation,
}: {
  telemetry?: TelemetryData | null
  currentMile?: number
  spareBatterySocPercent?: number
  raceDay?: RaceDay
  energySimulation?: EnergySimulationResult
} = {}) {
  const currentSegment =
    raceDay.segments.find(
      (segment) => currentMile >= segment.mileStart && currentMile <= segment.mileEnd
    ) ?? raceDay.segments[0]

  return generatePredictiveStrategy({
    raceDay,
    currentMile,
    currentSegment,
    energySimulation,
    telemetry,
    telemetrySource: telemetry ? 'manual' : 'cloud',
    startingSocPercent: 64,
    spareBatterySocPercent,
    isTraileringActive: false,
  })
}

function buildModel({
  telemetry = baseTelemetry,
  telemetryHistory = rollingDistanceHistory(),
  currentMile = 0,
  energySimulation = baseEnergySimulation,
  spareBatterySocPercent = carSetup.spareBatterySocPercent,
  raceDay = mockRaceDay,
}: {
  telemetry?: TelemetryData | null
  telemetryHistory?: TelemetryHistorySample[]
  currentMile?: number
  energySimulation?: EnergySimulationResult
  spareBatterySocPercent?: number
  raceDay?: RaceDay
} = {}) {
  const setup = { ...carSetup, spareBatterySocPercent }
  const strategy = buildStrategy({
    telemetry,
    currentMile,
    spareBatterySocPercent,
    raceDay,
    energySimulation,
  })

  return {
    model: buildRaceCaptainEnergyModel({
      raceDay,
      currentMile,
      distanceRemaining: raceDay.distanceMiles - currentMile,
      telemetry,
      telemetryHistory,
      energySimulation,
      predictiveStrategy: strategy,
      carSetup: setup,
      now: fixedNow,
    }),
    strategy,
  }
}

function rollingDistanceHistory(): TelemetryHistorySample[] {
  return Array.from({ length: 11 }, (_, index) => ({
    timestamp: fixedNow.getTime() + index * 60_000,
    distanceMiles: index,
    batteryEnergyUsedWh: index * 40,
    batteryPowerWatts: 1_400,
    speedMph: 35,
  }))
}

describe('Race Captain Energy Command Center calculations', () => {
  it('calculates current, required, projected SOC, inventory, and energy balance from fixed inputs', () => {
    const { model, strategy } = buildModel()

    expect(model.currentWhPerMile).toBeCloseTo(40, 1)
    expect(model.requiredWhPerMile).toBeCloseTo(40, 1)
    expect(model.projectedFinishSoc).toBeCloseTo(strategy.projectedFinishSoc, 6)
    expect(model.projectedArrivalSoc).toBeCloseTo(strategy.swapAdvice.projectedSocIfContinue, 6)
    expect(model.activeBatteryKwh).toBeCloseTo(3.2, 2)
    expect(model.reserveBatteryKwh).toBeCloseTo(4.05, 2)
    expect(model.combinedEnergyKwh).toBeCloseTo(7.25, 2)
    expect(model.combinedInventoryPercent).toBeCloseTo(145, 1)
    expect(model.solarInputWatts).toBeCloseTo(700, 3)
    expect(model.solarInputIsEstimated).toBe(false)
    expect(model.solarCapturedKwh).toBeCloseTo(2.71, 3)
    expect(model.solarCapturedIsEstimated).toBe(false)
    expect(model.energyUsedKwh).toBeCloseTo(4, 3)
    expect(model.netEnergyLossKwh).toBeCloseTo(3.3, 3)
    expect(model.netPowerWatts).toBeCloseTo(-700, 6)
    expect(model.batteryEnergyWh).toBeCloseTo(3200, 6)
    expect(model.energyConsumedWh).toBeCloseTo(120, 6)
    expect(model.energyRecoveredWh).toBeCloseTo(45, 6)
    expect(model.solarInputIsSimulated).toBe(false)
  })

  it('calculates rolling Wh/mi over the most recent 10 miles using distance and energy samples', () => {
    const result = calculateRollingWhPerMile(rollingDistanceHistory())

    expect(result.mode).toBe('distance')
    expect(result.label).toBe('Rolling 10 mi')
    expect(result.value).toBeCloseTo(40, 6)
  })

  it('calculates Rolling partial when less than 10 miles of valid distance exists', () => {
    const history = Array.from({ length: 6 }, (_, index) => ({
      timestamp: fixedNow.getTime() + index * 60_000,
      distanceMiles: index,
      batteryEnergyUsedWh: index * 50,
      batteryPowerWatts: 1_750,
      speedMph: 35,
    }))
    const result = calculateRollingWhPerMile(history)

    expect(result.mode).toBe('partial')
    expect(result.label).toBe('Rolling partial')
    expect(result.value).toBeCloseTo(50, 6)
  })

  it('falls back to a time-window estimate when distance is unavailable', () => {
    const history = Array.from({ length: 11 }, (_, index) => ({
      timestamp: fixedNow.getTime() + index * 60_000,
      batteryPowerWatts: 1_400,
      speedMph: 35,
    }))
    const result = calculateRollingWhPerMile(history)

    expect(result.mode).toBe('estimated')
    expect(result.label).toBe('Rolling estimated')
    expect(result.value).toBeCloseTo(40, 6)
  })

  it('protects against invalid data, low speeds, divide-by-zero, and extreme values', () => {
    expect(
      calculateRollingWhPerMile([
        { timestamp: fixedNow.getTime(), distanceMiles: 0, batteryPowerWatts: 10_000, speedMph: 2 },
        { timestamp: fixedNow.getTime() + 60_000, distanceMiles: 1, batteryPowerWatts: 10_000, speedMph: 2 },
      ]).value
    ).toBeNull()

    expect(
      calculateRollingWhPerMile([
        { timestamp: fixedNow.getTime(), distanceMiles: 0, batteryEnergyUsedWh: 0, speedMph: 35 },
        { timestamp: fixedNow.getTime() + 60_000, distanceMiles: 1, batteryEnergyUsedWh: 10_000, speedMph: 35 },
      ]).value
    ).toBe(maxExpectedRollingWhPerMile())
  })

  it('builds route SOC projection deterministically from current SOC to projected finish SOC', () => {
    const points = buildRouteSocProjection({
      currentSocPercent: 64,
      projectedFinishSoc: 34,
      segments: mockRaceDay.segments,
      currentMile: 0,
    })

    expect(points).toHaveLength(5)
    expect(points[0].soc).toBeCloseTo(64, 6)
    expect(points[2].soc).toBeCloseTo(49, 6)
    expect(points[4].soc).toBeCloseTo(34, 6)
  })

  it('calculates time to sunset from fixed Central Time race date and GPS coordinates', () => {
    expect(
      calculateTimeToSunset({
        raceDay: mockRaceDay,
        currentMile: 0,
        telemetry: baseTelemetry,
        now: fixedNow,
      })
    ).toBe('8h 43m')
  })

  it('uses route-point fallback when GPS is unavailable', () => {
    const location = getSunsetLocation({
      raceDay: mockRaceDay,
      currentMile: 52,
      telemetry: { ...baseTelemetry, gpsLat: undefined, gpsLng: undefined },
    })

    expect(location).toEqual({ lat: 31.5, lng: -100.5 })
  })

  it('returns Sunset passed after calculated sunset', () => {
    expect(
      calculateTimeToSunset({
        raceDay: mockRaceDay,
        currentMile: 0,
        telemetry: baseTelemetry,
        now: fixedAfterSunset,
      })
    ).toBe('Sunset passed')
  })

  it('returns -- when date or location is missing instead of marking simulated', () => {
    expect(
      calculateTimeToSunset({
        raceDay: { ...mockRaceDay, date: '', routePoints: [] },
        currentMile: 0,
        telemetry: { ...baseTelemetry, gpsLat: undefined, gpsLng: undefined },
        now: fixedNow,
      })
    ).toBe('--')
  })
})

describe('Race Captain scenario decisions', () => {
  it('healthy cruise day keeps normal race mode and delays unnecessary swap', () => {
    const { model, strategy } = buildModel({
      telemetry: { ...baseTelemetry, batterySocPercent: 95 },
    })

    expect(strategy.swapAdvice.action).toBe('DELAY_SWAP')
    expect(strategy.raceMode).toBe('Normal')
    expect(model.currentSocIsSimulated).toBe(false)
    expect(model.currentWhIsSimulated).toBe(false)
    expect(model.rollingWhPerMile.mode).toBe('distance')
  })

  it('high consumption climb increases conservation pressure', () => {
    const telemetry = { ...baseTelemetry, batterySocPercent: 40, efficiencyWhPerMile: 70, whPerMile: 70 }
    const { strategy } = buildModel({ telemetry, currentMile: 35 })

    expect(strategy.raceMode).toBe('Conserve')
    expect(strategy.recommendedSpeedMph).toBeLessThan(baseTelemetry.speedMph)
  })

  it('low SOC approaching stop recommends an urgent swap decision', () => {
    const telemetry = { ...baseTelemetry, batterySocPercent: 12, efficiencyWhPerMile: 70, whPerMile: 70 }
    const { strategy } = buildModel({ telemetry, currentMile: 55, spareBatterySocPercent: 90 })

    expect(strategy.swapAdvice.action).toBe('SWAP_NOW')
    expect(strategy.swapAdvice.urgency).toBe('CRITICAL')
  })

  it('spare battery higher than active battery produces higher swap SOC projection', () => {
    const telemetry = { ...baseTelemetry, batterySocPercent: 45 }
    const { strategy, model } = buildModel({ telemetry, spareBatterySocPercent: 90 })

    expect(strategy.swapAdvice.projectedSocAfterSwap).toBeGreaterThan(
      strategy.swapAdvice.projectedSocIfContinue
    )
    expect(model.reserveBatteryKwh).toBeCloseTo(4.5, 2)
  })

  it('poor solar day lowers captured solar and offset', () => {
    const poorSolar = { ...baseEnergySimulation, solarWh: 200, netWh: 3_800, netKwh: 3.8 }
    const telemetry = { ...baseTelemetry, mpptDailyEnergyWh: undefined }
    const { model } = buildModel({ telemetry, energySimulation: poorSolar, telemetryHistory: [] })

    expect(model.solarCapturedKwh).toBeCloseTo(0.2, 3)
    expect(model.solarCapturedIsEstimated).toBe(true)
    expect(model.solarOffsetPercent).toBeCloseTo(5, 2)
  })

  it('strong solar day raises captured solar and offset', () => {
    const strongSolar = { ...baseEnergySimulation, solarWh: 2_000, netWh: 2_000, netKwh: 2 }
    const telemetry = { ...baseTelemetry, mpptDailyEnergyWh: undefined }
    const { model } = buildModel({ telemetry, energySimulation: strongSolar, telemetryHistory: [] })

    expect(model.solarCapturedKwh).toBeCloseTo(2, 3)
    expect(model.solarCapturedIsEstimated).toBe(true)
    expect(model.solarOffsetPercent).toBeCloseTo(50, 2)
  })

  it('uses integrated MPPT charge power for solar captured when daily MPPT energy is missing', () => {
    const telemetry = { ...baseTelemetry, mpptDailyEnergyWh: undefined }
    const telemetryHistory: TelemetryHistorySample[] = [
      { timestamp: fixedNow.getTime(), speedMph: 35, mpptChargePowerWatts: 600 },
      { timestamp: fixedNow.getTime() + 60 * 60_000, speedMph: 35, mpptChargePowerWatts: 600 },
    ]
    const { model } = buildModel({ telemetry, telemetryHistory })

    expect(model.solarCapturedKwh).toBeCloseTo(0.6, 3)
    expect(model.solarCapturedIsEstimated).toBe(false)
  })

  it('prioritizes MPPT charge power, then MPPT power, then PV power, then legacy solar power, then setup estimate', () => {
    expect(buildModel().model.solarInputWatts).toBe(700)
    expect(
      buildModel({
        telemetry: {
          ...baseTelemetry,
          mpptChargePowerWatts: undefined,
          mpptPowerWatts: 780,
          mpptPvPowerWatts: 760,
          solarPowerWatts: 742,
        },
      }).model.solarInputWatts
    ).toBe(780)
    expect(
      buildModel({
        telemetry: {
          ...baseTelemetry,
          mpptChargePowerWatts: undefined,
          mpptPowerWatts: undefined,
          mpptPvPowerWatts: 760,
          solarPowerWatts: 742,
        },
      }).model.solarInputWatts
    ).toBe(760)
    expect(
      buildModel({
        telemetry: {
          ...baseTelemetry,
          mpptChargePowerWatts: undefined,
          mpptPowerWatts: undefined,
          mpptPvPowerWatts: undefined,
          solarPowerWatts: 742,
        },
      }).model.solarInputWatts
    ).toBe(742)
    const setupFallback = buildModel({
      telemetry: {
        ...baseTelemetry,
        mpptChargePowerWatts: undefined,
        mpptPowerWatts: undefined,
        mpptPvPowerWatts: undefined,
        solarPowerWatts: undefined,
      },
    }).model

    expect(setupFallback.solarInputWatts).toBe(carSetup.solarWatts)
    expect(setupFallback.solarInputIsEstimated).toBe(true)
  })

  it('Day 5 final push uses final-day reserve rules instead of normal reserve behavior', () => {
    const finalDay: RaceDay = { ...mockRaceDay, day: 5 }
    const { strategy } = buildModel({
      raceDay: finalDay,
      telemetry: { ...baseTelemetry, batterySocPercent: 35 },
    })

    expect(strategy.isFinalDay).toBe(true)
    expect(strategy.activeReserveSocPercent).toBe(strategy.finalDayTargetReserveSocPercent)
    expect(strategy.endgameModeActive).toBe(true)
  })

  it('missing telemetry falls back safely and marks fallback-backed values', () => {
    const { model } = buildModel({ telemetry: null, telemetryHistory: [] })

    expect(model.currentSocIsSimulated).toBe(true)
    expect(model.currentWhIsSimulated).toBe(false)
    expect(model.currentWhPerMile).toBeCloseTo(baseEnergySimulation.estimatedWhPerMile, 6)
    expect(model.solarInputIsSimulated).toBe(true)
    expect(model.rollingWhPerMile.value).toBeNull()
  })
})

function maxExpectedRollingWhPerMile() {
  return 500
}
