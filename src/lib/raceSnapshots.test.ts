import { describe, expect, it } from 'vitest'
import { raceRoute } from '@/data/raceRoute'
import { buildAuthoritativeStrategyState } from '@/lib/authoritativeStrategyState'
import { createInitialRaceBatteryState } from '@/lib/raceBatteryStrategy'
import { createRaceSnapshot, exportRaceSnapshotsToCsv } from '@/lib/raceSnapshots'
import type { PredictiveStrategyResult } from '@/lib/strategyEngine'
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

describe('race snapshots', () => {
  it('records authoritative strategy fields for snapshot consistency', () => {
    const state = buildState()
    const snapshot = createRaceSnapshot({
      telemetry,
      telemetrySource: 'manual',
      currentDay: raceDay.day,
      currentMile: 20,
      strategyState: state,
      warningsCount: 2,
    })

    expect(snapshot.missionStatus).toBe(state.missionStatus)
    expect(snapshot.raceHealthScore).toBe(state.raceHealth.score)
    expect(snapshot.raceHealthLabel).toBe(state.raceHealth.label)
    expect(snapshot.projectedNextStopSocPercent).toBe(
      state.projectedNextStopSocPercent
    )
    expect(snapshot.projectedEndDaySocPercent).toBe(
      state.projectedEndDaySocPercent
    )
    expect(snapshot.projectedFinishSoc).toBe(
      state.projectedEndDaySocPercent
    )
    expect(snapshot.predictionConfidence).toBe(state.predictionConfidence)
    expect(snapshot.warningsCount).toBe(2)
  })

  it('keeps recommendation snapshots aligned with the authoritative command card', () => {
    const state = buildState()
    const snapshot = createRaceSnapshot({
      telemetry,
      telemetrySource: 'manual',
      currentDay: raceDay.day,
      currentMile: 20,
      strategyState: state,
    })

    expect(snapshot.strategyCommand).toBe(state.strategyRecommendation.command)
    expect(snapshot.strategyTitle).toBe(state.strategyRecommendation.title)
    expect(snapshot.strategyReason).toBe(state.strategyRecommendation.reason)
    expect(snapshot.recommendedSpeedMph).toBe(
      state.strategyRecommendation.recommendedSpeedMph
    )
  })

  it('keeps swap snapshots aligned with the authoritative swap planner', () => {
    const state = buildState({
      telemetry: {
        ...telemetry,
        batterySocPercent: 22,
        batteryEnergyWh: 1100,
      },
      activeSocPercent: 22,
      spareSocPercent: 80,
    })
    const snapshot = createRaceSnapshot({
      telemetry,
      telemetrySource: 'manual',
      currentDay: raceDay.day,
      currentMile: 20,
      strategyState: state,
    })

    expect(snapshot.swapAction).toBe(state.swapRecommendation.action)
    expect(snapshot.swapConfidence).toBe(state.swapRecommendation.confidence)
    expect(['no_swap', 'plan_swap', 'swap_now']).toContain(snapshot.swapAction)
  })

  it('prefers authoritative fields when a legacy strategy is also supplied', () => {
    const state = buildState()
    const snapshot = createRaceSnapshot({
      telemetry,
      telemetrySource: 'manual',
      currentDay: raceDay.day,
      currentMile: 20,
      strategyState: state,
      strategy: legacyStrategy,
    })

    expect(snapshot.strategyCommand).toBe(state.strategyRecommendation.command)
    expect(snapshot.recommendedSpeedMph).toBe(
      state.strategyRecommendation.recommendedSpeedMph
    )
    expect(snapshot.projectedFinishSoc).toBe(
      state.projectedEndDaySocPercent
    )
    expect(snapshot.swapAction).toBe(state.swapRecommendation.action)
    expect(snapshot.command).not.toBe(legacyStrategy.driverAction)
    expect(snapshot.swapAction).not.toBe(legacyStrategy.swapAdvice.action)
  })

  it('exports authoritative snapshot fields to CSV', () => {
    const state = buildState()
    const snapshot = createRaceSnapshot({
      telemetry,
      telemetrySource: 'manual',
      currentDay: raceDay.day,
      currentMile: 20,
      strategyState: state,
    })
    const csv = exportRaceSnapshotsToCsv([snapshot])

    expect(csv).toContain('missionStatus')
    expect(csv).toContain('strategyCommand')
    expect(csv).toContain('swapConfidence')
    expect(csv).toContain(state.missionStatus)
    expect(csv).toContain(state.strategyRecommendation.command)
  })
})

function buildState({
  telemetry: telemetryOverride = telemetry,
  activeSocPercent = 80,
  spareSocPercent = 90,
}: {
  telemetry?: TelemetryData
  activeSocPercent?: number
  spareSocPercent?: number
} = {}) {
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
    telemetryTimestampMs: now,
    telemetryAgeSeconds: 0,
    telemetrySource: 'manual',
    telemetryStatus: 'connected',
    connectionStatus: 'connected',
    raceBatteryState: createInitialRaceBatteryState({
      now,
      activeSocPercent,
      spareSocPercent,
    }),
    now,
  })
}

const legacyStrategy = {
  driverAction: 'Legacy driver action',
  projectedFinishSoc: 3,
  swapAdvice: {
    action: 'SWAP_NOW',
    urgency: 'CRITICAL',
  },
  recommendations: [{ action: 'legacy_action' }],
} as unknown as PredictiveStrategyResult
