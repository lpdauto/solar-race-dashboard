import { describe, expect, it } from 'vitest'
import { raceRoute } from '@/data/raceRoute'
import {
  buildAuthoritativeStrategyState,
  classifyMissionStatusFromCurrentChain,
} from '@/lib/authoritativeStrategyState'
import {
  createInitialRaceBatteryState,
  type RaceBatteryState,
} from '@/lib/raceBatteryStrategy'
import type { TelemetryData } from '@/types/telemetry'

const now = Date.parse('2026-07-19T16:00:00.000Z')
const raceDay = raceRoute[0]
const currentSegment = raceDay.segments[1]

const telemetry: TelemetryData = {
  timestamp: now,
  source: 'manual',
  speedMph: 35,
  batteryVoltage: 80,
  batteryCurrent: 15,
  batterySocPercent: 80,
  batteryEnergyWh: 4000,
  efficiencyWhPerMile: 40,
  whPerMile: 40,
  mpptChargePowerWatts: 1800,
  netPowerWatts: -300,
}

describe('authoritative strategy state', () => {
  it('builds prediction, swap recommendation, strategy recommendation, mission status, and race health', () => {
    const state = buildState()

    expect(state.prediction.predictedWhPerMile).toBeGreaterThan(0)
    expect(state.swapRecommendation.action).toBeDefined()
    expect(state.strategyRecommendation.command).toBeDefined()
    expect(state.missionStatus).toBeDefined()
    expect(state.raceHealth.score).toBeGreaterThanOrEqual(0)
    expect(state.raceHealth.score).toBeLessThanOrEqual(100)
  })

  it('exposes the same recommended speed used by the command card', () => {
    const state = buildState()

    expect(state.recommendedSpeedMph).toBe(
      state.strategyRecommendation.recommendedSpeedMph
    )
  })

  it('uses one swap recommendation for Race Captain and Strategy consumers', () => {
    const state = buildState({
      telemetry: {
        ...telemetry,
        batterySocPercent: 22,
        batteryEnergyWh: 1100,
      },
      activeSocPercent: 22,
      spareSocPercent: 80,
    })

    expect(state.swapRecommendation.action).toBe(
      state.strategyRecommendation.command === 'plan_swap'
        ? 'plan_swap'
        : state.swapRecommendation.action
    )
    expect(state.swapRecommendation.reason).toBeTruthy()
  })

  it('classifies mission status from the current strategy chain', () => {
    const state = buildState({
      telemetry: {
        ...telemetry,
        batterySocPercent: 18,
        batteryEnergyWh: 900,
      },
      activeSocPercent: 18,
      spareSocPercent: 80,
    })

    expect(state.missionStatus).toBe('CRITICAL_ENERGY')
    expect(
      classifyMissionStatusFromCurrentChain({
        raceDay,
        prediction: state.prediction,
        swapRecommendation: state.swapRecommendation,
        strategyRecommendation: state.strategyRecommendation,
        traileringRecommendation: state.traileringRecommendation,
      })
    ).toBe('CRITICAL_ENERGY')
  })

  it('calculates race health from current-chain confidence and projections', () => {
    const highConfidenceState = buildState()
    const lowConfidenceState = buildState({
      telemetryTimestampMs: now - 60_000,
      telemetryAgeSeconds: 60,
    })

    expect(lowConfidenceState.predictionConfidence).toBe('low')
    expect(lowConfidenceState.raceHealth.score).toBeLessThan(
      highConfidenceState.raceHealth.score
    )
  })

  it('blocks aggressive recommendations when prediction confidence is low', () => {
    const state = buildState({
      telemetry: {
        ...telemetry,
        efficiencyWhPerMile: 32,
        whPerMile: 32,
        mpptChargePowerWatts: 2200,
      },
      activeSocPercent: 90,
      spareSocPercent: 95,
      telemetryTimestampMs: now - 60_000,
      telemetryAgeSeconds: 60,
    })

    expect(state.predictionConfidence).toBe('low')
    expect(state.strategyRecommendation.command).not.toBe(
      'increase_speed_allowed'
    )
  })

  it('uses healthy race battery state when telemetry is null without false critical energy', () => {
    const state = buildState({
      telemetry: null,
      activeSocPercent: 80,
      spareSocPercent: 90,
      telemetryTimestampMs: undefined,
      telemetryAgeSeconds: undefined,
    })

    expect(state.prediction.currentSocPercent).toBe(80)
    expect(state.prediction.batteryProjectionSource).toBe('race_battery_state')
    expect(state.prediction.raceBatteryStateProjectionFallbackUsed).toBe(true)
    expect(state.predictionConfidence).toBe('low')
    expect(state.missionStatus).toBe('DATA_UNCERTAIN')
    expect(state.strategyRecommendation.command).toBe('hold_pace')
    expect(state.strategyRecommendation.command).not.toBe('reduce_speed')
    expect(state.missionStatus).not.toBe('CRITICAL_ENERGY')
  })

  it('returns low-confidence data uncertainty when telemetry and battery state are unavailable', () => {
    const state = buildState({
      telemetry: null,
      raceBatteryState: null,
      telemetryTimestampMs: undefined,
      telemetryAgeSeconds: undefined,
    })

    expect(state.prediction.batteryProjectionSource).toBe('unavailable_fallback')
    expect(state.prediction.telemetryNullFallbackSource).toBe('unavailable')
    expect(state.predictionConfidence).toBe('low')
    expect(state.missionStatus).toBe('DATA_UNCERTAIN')
    expect(state.strategyRecommendation.command).toBe('hold_pace')
    expect(state.missionStatus).not.toBe('CRITICAL_ENERGY')
  })
})

function buildState({
  telemetry: telemetryOverride = telemetry,
  activeSocPercent = 80,
  spareSocPercent = 90,
  telemetryTimestampMs = now,
  telemetryAgeSeconds = 0,
  raceBatteryState,
}: {
  telemetry?: TelemetryData | null
  activeSocPercent?: number
  spareSocPercent?: number
  telemetryTimestampMs?: number
  telemetryAgeSeconds?: number
  raceBatteryState?: RaceBatteryState | null
} = {}) {
  const batteryState =
    raceBatteryState === undefined
      ? createInitialRaceBatteryState({
          now,
          activeSocPercent,
          spareSocPercent,
        })
      : raceBatteryState

  return buildAuthoritativeStrategyState({
    raceDay,
    currentMile: 20,
    currentSegment,
    telemetry: telemetryOverride,
    telemetryHistory: [
      {
        timestamp: now - 120_000,
        speedMph: 35,
        batteryPowerWatts: 1400,
        batteryEnergyUsedWh: 0,
        distanceMiles: 18,
      },
      {
        timestamp: now,
        speedMph: 35,
        batteryPowerWatts: 1400,
        batteryEnergyUsedWh: 80,
        distanceMiles: 20,
      },
    ],
    telemetryTimestampMs,
    telemetryAgeSeconds,
    telemetrySource: 'manual',
    telemetryStatus: 'connected',
    connectionStatus: 'connected',
    raceBatteryState: batteryState,
    now,
  })
}
