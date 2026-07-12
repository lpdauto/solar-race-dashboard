import { describe, expect, it } from 'vitest'
import { raceRoute, type RaceDay, type RouteSegment } from '@/data/raceRoute'
import {
  buildAuthoritativeStrategyState,
  type AuthoritativeStrategyState,
} from '@/lib/authoritativeStrategyState'
import { rx2Config } from '@/lib/race/rx2Config'
import { createInitialRaceBatteryState } from '@/lib/raceBatteryStrategy'
import type { RaceScheduleForecastMode } from '@/lib/raceSchedule'
import type { TelemetryData } from '@/types/telemetry'

const now = Date.parse('2026-07-19T16:00:00.000Z')
const day1 = raceRoute[0]
const finalDay = raceRoute[4]

type ScenarioInput = {
  raceDay?: RaceDay
  currentMile?: number
  currentSegment?: RouteSegment
  speedMph?: number
  whPerMile?: number
  mpptWatts?: number
  activeSocPercent?: number
  spareSocPercent?: number
  telemetryAgeSeconds?: number
  motorTempC?: number
  controllerTempC?: number
  forecastMode?: RaceScheduleForecastMode
}

type ScenarioReport = {
  scenario: string
  missionStatus: string
  raceHealth: string
  recommendedSpeed: string
  strategyCommand: string
  swapRecommendation: string
  traileringRecommendation: string
  projectedNextStopSoc: string
  projectedEndDaySoc: string
  energyMargin: string
  solarRecovery: string
  usableSolarRecovery: string
  wastedSolarRecovery: string
  driveEnergy: string
  reserveMargin: string
  defaultScheduleWarnings: number
  postFinishRecoveryIncluded: boolean
  morningRecoveryIncluded: boolean
  conservativeEnergyMargin: string
  confidence: string
  reason: string
}

describe('Phase 2C strategy scenario validation', () => {
  it('Scenario 1 - Normal Race Day', () => {
    const state = buildScenarioState({
      activeSocPercent: 100,
      spareSocPercent: 100,
      speedMph: 35,
      whPerMile: 40,
      mpptWatts: 1800,
    })

    expectScenarioState(state, 'Scenario 1 - Normal Race Day')
    expect(state.missionStatus).toBe('ON_TARGET')
    expect(state.strategyRecommendation.command).toBe('hold_pace')
    expect(state.swapRecommendation.action).toBe('no_swap')
    expect(state.traileringRecommendation?.action).toBe('DRIVE')
    expect(state.predictionConfidence).toBe('medium')
    expect(state.prediction.projectedNextStopSocPercent).toBeGreaterThan(50)
    expect(state.prediction.projectedEndDaySocPercent).toBeGreaterThan(50)
  })

  it('Scenario 2 - Excessive Consumption', () => {
    const state = buildScenarioState({
      activeSocPercent: 85,
      spareSocPercent: 100,
      speedMph: 38,
      whPerMile: 60,
      mpptWatts: 1500,
    })

    expectScenarioState(state, 'Scenario 2 - Excessive Consumption')
    expect(state.missionStatus).toBe('CONSERVE')
    expect(state.strategyRecommendation.command).toBe('reduce_speed')
    expect(state.strategyRecommendation.recommendedSpeedMph).toBeLessThan(38)
    expect(state.swapRecommendation.action).toBe('no_swap')
  })

  it('Scenario 3 - Active Pack Critical', () => {
    const state = buildScenarioState({
      activeSocPercent: 18,
      spareSocPercent: 80,
      speedMph: 35,
      whPerMile: 40,
      mpptWatts: 1800,
    })

    expectScenarioState(state, 'Scenario 3 - Active Pack Critical')
    expect(state.missionStatus).toBe('CRITICAL_ENERGY')
    expect(state.strategyRecommendation.command).toBe('swap_now')
    expect(state.swapRecommendation.action).toBe('swap_now')
    expect(state.traileringRecommendation?.action).toBe('DRIVE')
    expect(state.strategyRecommendation.severity).toBe('urgent')
  })

  it('Scenario 4 - Weak Spare', () => {
    const state = buildScenarioState({
      activeSocPercent: 25,
      spareSocPercent: 28,
      speedMph: 35,
      whPerMile: 45,
      mpptWatts: 1800,
    })

    expectScenarioState(state, 'Scenario 4 - Weak Spare')
    expect(state.missionStatus).toBe('SWAP_RECOMMENDED')
    expect(state.strategyRecommendation.command).toBe('plan_swap')
    expect(state.swapRecommendation.action).toBe('plan_swap')
    expect(state.swapRecommendation.reason.toLowerCase()).toContain(
      'both packs'
    )
    expect(state.swapRecommendation.reason.toLowerCase()).toContain(
      'do not blind swap'
    )
  })

  it('Scenario 5 - MPPT Failure', () => {
    const state = buildScenarioState({
      activeSocPercent: 60,
      spareSocPercent: 80,
      speedMph: 35,
      whPerMile: 40,
      mpptWatts: 0,
    })

    expectScenarioState(state, 'Scenario 5 - MPPT Failure')
    expect(['medium', 'low']).toContain(state.predictionConfidence)
    expect(state.warnings.join(' ').toLowerCase()).toContain('mppt input is zero')
    expect(state.warnings.join(' ').toLowerCase()).toContain('solar recovery')
    expect(state.strategyRecommendation.command).not.toBe(
      'increase_speed_allowed'
    )
    expect(state.strategyRecommendation.severity).not.toBe('normal')
  })

  it('Scenario 6 - Cloudy Conditions', () => {
    const sunnyState = buildScenarioState({
      activeSocPercent: 45,
      spareSocPercent: 80,
      speedMph: 35,
      whPerMile: 40,
      mpptWatts: 1800,
    })
    const cloudyState = buildScenarioState({
      activeSocPercent: 45,
      spareSocPercent: 80,
      speedMph: 35,
      whPerMile: 40,
      mpptWatts: 600,
    })

    expectScenarioState(cloudyState, 'Scenario 6 - Cloudy Conditions')
    expect(cloudyState.prediction.projectedEndDaySocPercent).toBeLessThan(
      sunnyState.prediction.projectedEndDaySocPercent ?? 100
    )
    expect(cloudyState.strategyRecommendation.command).not.toBe(
      'increase_speed_allowed'
    )
    expect(['plan_swap', 'swap_now', 'reduce_speed', 'hold_pace']).toContain(
      cloudyState.strategyRecommendation.command
    )
  })

  it('Scenario 7 - Stale Telemetry', () => {
    const state = buildScenarioState({
      activeSocPercent: 90,
      spareSocPercent: 95,
      speedMph: 35,
      whPerMile: 32,
      mpptWatts: 2000,
      telemetryAgeSeconds: 60,
    })

    expectScenarioState(state, 'Scenario 7 - Stale Telemetry')
    expect(state.predictionConfidence).toBe('low')
    expect(state.missionStatus).toBe('DATA_UNCERTAIN')
    expect(state.warnings.join(' ').toLowerCase()).toContain('telemetry is stale')
    expect(state.strategyRecommendation.command).not.toBe(
      'increase_speed_allowed'
    )
    expect(state.strategyRecommendation.reason.toLowerCase()).toContain(
      'telemetry stale'
    )
  })

  it('Scenario 8 - High Temperature', () => {
    const state = buildScenarioState({
      activeSocPercent: 90,
      spareSocPercent: 95,
      speedMph: 35,
      whPerMile: 32,
      mpptWatts: 2000,
      motorTempC: 96,
      controllerTempC: 86,
    })

    expectScenarioState(state, 'Scenario 8 - High Temperature')
    expect(state.strategyRecommendation.command).toBe('reduce_speed')
    expect(state.strategyRecommendation.command).not.toBe(
      'increase_speed_allowed'
    )
  })

  it('Scenario 9 - Strong Energy Margin', () => {
    const state = buildScenarioState({
      activeSocPercent: 95,
      spareSocPercent: 100,
      speedMph: 35,
      whPerMile: 32,
      mpptWatts: 2000,
    })

    expectScenarioState(state, 'Scenario 9 - Strong Energy Margin')
    expect(state.missionStatus).toBe('ON_TARGET')
    expect(state.strategyRecommendation.command).toBe('increase_speed_allowed')
    expect(state.strategyRecommendation.recommendedSpeedMph).toBeGreaterThan(35)
    expect(state.predictionConfidence).toBe('medium')
  })

  it('Scenario 10 - Final Day Push', () => {
    const state = buildScenarioState({
      raceDay: finalDay,
      currentMile: 52,
      currentSegment: finalDay.segments[3],
      activeSocPercent: 95,
      spareSocPercent: 100,
      speedMph: 35,
      whPerMile: 32,
      mpptWatts: 2000,
    })

    expectScenarioState(state, 'Scenario 10 - Final Day Push')
    expect(state.missionStatus).toBe('FINISH_PUSH')
    expect(state.strategyRecommendation.command).toBe('increase_speed_allowed')
    expect(state.swapRecommendation.action).toBe('no_swap')
    expect(state.strategyRecommendation.recommendedSpeedMph).toBeGreaterThan(35)
  })

  it('requires trailering when both packs cannot continue safely', () => {
    const state = buildScenarioState({
      activeSocPercent: 10,
      spareSocPercent: 12,
      speedMph: 35,
      whPerMile: 60,
      mpptWatts: 0,
    })

    expectScenarioState(state, 'Both Packs Cannot Continue')
    expect(state.traileringRecommendation?.action).toBe('TRAILER_REQUIRED')
  })
})

function buildScenarioState({
  raceDay = day1,
  currentMile = 20,
  currentSegment = segmentForMile(raceDay, currentMile),
  speedMph = 35,
  whPerMile = 40,
  mpptWatts = 1800,
  activeSocPercent = 100,
  spareSocPercent = 100,
  telemetryAgeSeconds = 0,
  motorTempC = 45,
  controllerTempC = 45,
  forecastMode = 'normal',
}: ScenarioInput = {}) {
  const timestamp = now - telemetryAgeSeconds * 1000
  const telemetry: TelemetryData = {
    timestamp,
    source: 'manual',
    speedMph,
    batteryVoltage: 80,
    batteryCurrent: 15,
    batterySocPercent: activeSocPercent,
    batteryEnergyWh: socToEnergyWh(activeSocPercent),
    efficiencyWhPerMile: whPerMile,
    whPerMile,
    batteryPowerWatts: whPerMile * speedMph,
    mpptChargePowerWatts: mpptWatts,
    netPowerWatts: mpptWatts - whPerMile * speedMph,
    motorTempC,
    controllerTempC,
  }

  return buildAuthoritativeStrategyState({
    raceDay,
    currentMile,
    currentSegment,
    telemetry,
    telemetryHistory: buildTelemetryHistory({
      currentMile,
      speedMph,
      whPerMile,
    }),
    telemetryTimestampMs: timestamp,
    telemetryAgeSeconds,
    telemetrySource: 'manual',
    telemetryStatus: 'connected',
    connectionStatus: 'connected',
    raceBatteryState: createInitialRaceBatteryState({
      now,
      activeSocPercent,
      spareSocPercent,
    }),
    forecastMode,
    now,
  })
}

function buildTelemetryHistory({
  currentMile,
  speedMph,
  whPerMile,
}: {
  currentMile: number
  speedMph: number
  whPerMile: number
}) {
  const distanceDelta = 2

  return [
    {
      timestamp: now - 120_000,
      speedMph,
      batteryPowerWatts: speedMph * whPerMile,
      batteryEnergyUsedWh: 0,
      distanceMiles: currentMile - distanceDelta,
    },
    {
      timestamp: now,
      speedMph,
      batteryPowerWatts: speedMph * whPerMile,
      batteryEnergyUsedWh: whPerMile * distanceDelta,
      distanceMiles: currentMile,
    },
  ]
}

function expectScenarioState(
  state: AuthoritativeStrategyState,
  scenario: string
) {
  const failures = detectContradictions(state)

  expect(failures, `${scenario}: ${failures.join('; ')}`).toEqual([])
}

function detectContradictions(state: AuthoritativeStrategyState) {
  const failures: string[] = []

  if (
    state.missionStatus === 'CRITICAL_ENERGY' &&
    state.strategyRecommendation.command === 'hold_pace'
  ) {
    failures.push('HOLD_PACE while mission status is CRITICAL_ENERGY')
  }
  if (
    state.swapRecommendation.action === 'swap_now' &&
    (state.raceHealth.label === 'Good' || state.raceHealth.label === 'Excellent')
  ) {
    failures.push(`${state.raceHealth.label} race health while swap_now is active`)
  }
  if (
    state.predictionConfidence === 'low' &&
    state.strategyRecommendation.command === 'increase_speed_allowed'
  ) {
    failures.push('Increase speed with stale or low-confidence telemetry')
  }
  if (
    state.strategyRecommendation.command === 'increase_speed_allowed' &&
    state.strategyRecommendation.reason.toLowerCase().includes('thermal')
  ) {
    failures.push('Increase speed with thermal warning')
  }
  if (
    state.strategyRecommendation.command === 'swap_now' &&
    state.swapRecommendation.action === 'no_swap'
  ) {
    failures.push('Strategy says swap_now while swap planner says no_swap')
  }
  if (
    state.strategyRecommendation.command === 'increase_speed_allowed' &&
    state.missionStatus !== 'ON_TARGET' &&
    state.missionStatus !== 'FINISH_PUSH'
  ) {
    failures.push('Increase speed conflicts with mission status')
  }

  return failures
}

function scenarioReport(
  scenario: string,
  state: AuthoritativeStrategyState,
  conservativeState = state
): ScenarioReport {
  return {
    scenario,
    missionStatus: state.missionStatus,
    raceHealth: `${state.raceHealth.label} (${state.raceHealth.score})`,
    recommendedSpeed:
      state.recommendedSpeedMph === undefined
        ? '--'
        : `${state.recommendedSpeedMph} mph`,
    strategyCommand: state.strategyRecommendation.command,
    swapRecommendation: state.swapRecommendation.action,
    traileringRecommendation:
      state.traileringRecommendation?.action ?? 'DRIVE',
    projectedNextStopSoc: formatSoc(state.projectedNextStopSocPercent),
    projectedEndDaySoc: formatSoc(state.projectedEndDaySocPercent),
    energyMargin: formatKWh(state.prediction.energyMarginKWh, {
      signed: true,
    }),
    solarRecovery: formatKWh(
      whToKWh(state.prediction.projectedSolarRecoveredWh)
    ),
    usableSolarRecovery: formatKWh(
      whToKWh(state.prediction.usableSolarRecoveryWh)
    ),
    wastedSolarRecovery: formatKWh(
      whToKWh(state.prediction.wastedSolarRecoveryWh)
    ),
    driveEnergy: formatKWh(whToKWh(state.prediction.projectedDriveEnergyWh)),
    reserveMargin: formatPercent(state.prediction.reserveMarginPercent),
    defaultScheduleWarnings: state.prediction.defaultScheduleWarningCount ?? 0,
    postFinishRecoveryIncluded:
      state.prediction.postFinishSolarRecoveryIncluded ?? false,
    morningRecoveryIncluded:
      state.prediction.morningSolarRecoveryIncluded ?? false,
    conservativeEnergyMargin: formatKWh(
      conservativeState.prediction.energyMarginKWh,
      { signed: true }
    ),
    confidence: state.predictionConfidence,
    reason: state.strategyRecommendation.reason,
  }
}

function segmentForMile(raceDay: RaceDay, mile: number) {
  return raceDay.segments.find(
    (segment) => segment.mileStart <= mile && segment.mileEnd >= mile
  )
}

function socToEnergyWh(socPercent: number) {
  return (socPercent / 100) * rx2Config.mainBatteryUsableWh
}

function formatSoc(value: number | undefined) {
  return value === undefined ? '--' : `${value.toFixed(1)}%`
}

function formatPercent(value: number | undefined) {
  return value === undefined ? '--' : `${value.toFixed(1)}%`
}

function whToKWh(value: number | undefined) {
  return value === undefined ? undefined : value / 1000
}

function formatKWh(
  value: number | undefined,
  { signed = false }: { signed?: boolean } = {}
) {
  if (value === undefined) return '--'

  const prefix = signed && value > 0 ? '+' : ''

  return `${prefix}${value.toFixed(1)} kWh`
}

export function buildPhase2CScenarioReport() {
  return [
    scenarioReportForInput('Scenario 1 - Normal Race Day', {
      activeSocPercent: 100,
      spareSocPercent: 100,
      speedMph: 35,
      whPerMile: 40,
      mpptWatts: 1800,
    }),
    scenarioReportForInput('Scenario 2 - Excessive Consumption', {
      activeSocPercent: 85,
      spareSocPercent: 100,
      speedMph: 38,
      whPerMile: 60,
      mpptWatts: 1500,
    }),
    scenarioReportForInput('Scenario 3 - Active Pack Critical', {
      activeSocPercent: 18,
      spareSocPercent: 80,
      speedMph: 35,
      whPerMile: 40,
      mpptWatts: 1800,
    }),
    scenarioReportForInput('Scenario 4 - Weak Spare', {
      activeSocPercent: 25,
      spareSocPercent: 28,
      speedMph: 35,
      whPerMile: 45,
      mpptWatts: 1800,
    }),
    scenarioReportForInput('Scenario 5 - MPPT Failure', {
      activeSocPercent: 60,
      spareSocPercent: 80,
      speedMph: 35,
      whPerMile: 40,
      mpptWatts: 0,
    }),
    scenarioReportForInput('Scenario 6 - Cloudy Conditions', {
      activeSocPercent: 45,
      spareSocPercent: 80,
      speedMph: 35,
      whPerMile: 40,
      mpptWatts: 600,
    }),
    scenarioReportForInput('Scenario 7 - Stale Telemetry', {
      activeSocPercent: 90,
      spareSocPercent: 95,
      speedMph: 35,
      whPerMile: 32,
      mpptWatts: 2000,
      telemetryAgeSeconds: 60,
    }),
    scenarioReportForInput('Scenario 8 - High Temperature', {
      activeSocPercent: 90,
      spareSocPercent: 95,
      speedMph: 35,
      whPerMile: 32,
      mpptWatts: 2000,
      motorTempC: 96,
      controllerTempC: 86,
    }),
    scenarioReportForInput('Scenario 9 - Strong Energy Margin', {
      activeSocPercent: 95,
      spareSocPercent: 100,
      speedMph: 35,
      whPerMile: 32,
      mpptWatts: 2000,
    }),
    scenarioReportForInput('Scenario 10 - Final Day Push', {
      raceDay: finalDay,
      currentMile: 52,
      currentSegment: finalDay.segments[3],
      activeSocPercent: 95,
      spareSocPercent: 100,
      speedMph: 35,
      whPerMile: 32,
      mpptWatts: 2000,
    }),
  ]
}

function scenarioReportForInput(scenario: string, input: ScenarioInput) {
  const normalState = buildScenarioState({
    ...input,
    forecastMode: 'normal',
  })
  const conservativeState = buildScenarioState({
    ...input,
    forecastMode: 'conservative',
  })

  return scenarioReport(scenario, normalState, conservativeState)
}

export const buildPhase2BScenarioReport = buildPhase2CScenarioReport
export const buildPhase2AScenarioReport = buildPhase2BScenarioReport

if (
  process.env.PRINT_PHASE_2C_REPORT === '1' ||
  process.env.PRINT_PHASE_2B_REPORT === '1' ||
  process.env.PRINT_PHASE_2A_REPORT === '1'
) {
  console.table(buildPhase2CScenarioReport())
}
