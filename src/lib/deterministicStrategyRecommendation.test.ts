import { describe, expect, it } from 'vitest'
import {
  buildDeterministicStrategyRecommendation,
  type StrategyRecommendation,
} from '@/lib/deterministicStrategyRecommendation'
import {
  createInitialRaceBatteryState,
  type SwapRecommendation,
} from '@/lib/raceBatteryStrategy'
import type { RacePrediction } from '@/lib/racePrediction'
import type { TelemetryData } from '@/types/telemetry'

const now = Date.parse('2026-07-21T17:00:00.000Z')

const basePrediction: RacePrediction = {
  timestamp: now,
  confidence: 'high',
  warnings: [],
  predictedWhPerMile: 40,
  predictedMpptWatts: 1800,
  currentBatteryEnergyWh: 3500,
  currentSocPercent: 70,
  projectedEndSegmentSocPercent: 62,
  projectedNextStopSocPercent: 58,
  projectedEndDaySocPercent: 52,
  projectedDriveEnergyWh: 1200,
  projectedSolarRecoveredDrivingWh: 400,
  projectedSolarRecoveredStoppedWh: 200,
  projectedSolarRecoveredTraileringWh: 0,
  projectedSolarRecoveredWh: 600,
  projectedNetEnergyWh: 600,
  reserveEnergyWh: 1000,
  reserveMarginPercent: 32,
  energyMarginWh: 2900,
  energyMarginKWh: 2.9,
  remainingSegmentMiles: 10,
  remainingDayMiles: 35,
  nextStopMiles: 12,
}

const baseTelemetry: TelemetryData = {
  timestamp: now,
  source: 'manual',
  speedMph: 35,
  batteryVoltage: 80,
  batteryCurrent: 15,
  batterySocPercent: 70,
  batteryEnergyWh: 3500,
  efficiencyWhPerMile: 40,
  whPerMile: 40,
  mpptChargePowerWatts: 1800,
  netPowerWatts: -300,
}

const noSwapRecommendation: SwapRecommendation = {
  action: 'no_swap',
  confidence: 'high',
  reason: 'No swap needed.',
  activePackId: 'A',
  sparePackId: 'B',
  activeSocPercent: 70,
  spareSocPercent: 80,
  projectedEndSegmentSocPercent: 62,
  projectedNextStopSocPercent: 58,
  projectedEndDaySocPercent: 52,
}

describe('deterministic strategy recommendation', () => {
  it('holds pace when Wh/mi and SOC projections are safe', () => {
    const recommendation = buildRecommendation()

    expect(recommendation.command).toBe('hold_pace')
    expect(recommendation.severity).toBe('normal')
    expect(recommendation.recommendedSpeedMph).toBe(35)
  })

  it('reduces speed when Wh/mi is above target', () => {
    const recommendation = buildRecommendation({
      telemetry: {
        ...baseTelemetry,
        efficiencyWhPerMile: 58,
        whPerMile: 58,
      },
    })

    expect(recommendation.command).toBe('reduce_speed')
    expect(recommendation.recommendedSpeedMph).toBe(32)
  })

  it('allows a small speed increase when energy margin is strong', () => {
    const recommendation = buildRecommendation({
      prediction: {
        ...basePrediction,
        predictedWhPerMile: 32,
        predictedMpptWatts: 2200,
        projectedEndDaySocPercent: 65,
      },
      telemetry: {
        ...baseTelemetry,
        efficiencyWhPerMile: 32,
        whPerMile: 32,
        mpptChargePowerWatts: 2200,
      },
      activeSocPercent: 80,
      spareSocPercent: 90,
    })

    expect(recommendation.command).toBe('increase_speed_allowed')
    expect(recommendation.recommendedSpeedMph).toBe(37)
  })

  it('prioritizes plan_swap when the swap planner says to plan a swap', () => {
    const recommendation = buildRecommendation({
      swapRecommendation: {
        ...noSwapRecommendation,
        action: 'plan_swap',
        reason: 'Plan swap.',
        activeSocPercent: 25,
        spareSocPercent: 80,
      },
      activeSocPercent: 25,
      spareSocPercent: 80,
      telemetry: {
        ...baseTelemetry,
        efficiencyWhPerMile: 58,
        whPerMile: 58,
      },
    })

    expect(recommendation.command).toBe('plan_swap')
    expect(recommendation.severity).toBe('caution')
  })

  it('prioritizes swap_now over all lower-priority commands', () => {
    const recommendation = buildRecommendation({
      swapRecommendation: {
        ...noSwapRecommendation,
        action: 'swap_now',
        reason: 'Swap now.',
        activeSocPercent: 18,
        spareSocPercent: 80,
      },
      activeSocPercent: 18,
      spareSocPercent: 80,
      prediction: {
        ...basePrediction,
        predictedWhPerMile: 32,
        predictedMpptWatts: 2200,
        projectedEndDaySocPercent: 65,
        projectedNextStopSocPercent: 15,
      },
      telemetry: {
        ...baseTelemetry,
        efficiencyWhPerMile: 32,
        whPerMile: 32,
        speedMph: 0,
        netPowerWatts: 1000,
      },
    })

    expect(recommendation.command).toBe('swap_now')
    expect(recommendation.severity).toBe('urgent')
  })

  it('does not recommend aggressive speed increases when confidence is low', () => {
    const recommendation = buildRecommendation({
      prediction: {
        ...basePrediction,
        confidence: 'low',
        warnings: ['Telemetry is stale; prediction confidence is low.'],
        predictedWhPerMile: 32,
        projectedEndDaySocPercent: 65,
      },
      telemetry: {
        ...baseTelemetry,
        efficiencyWhPerMile: 32,
        whPerMile: 32,
      },
      activeSocPercent: 80,
      spareSocPercent: 90,
    })

    expect(recommendation.command).not.toBe('increase_speed_allowed')
    expect(recommendation.confidence).toBe('low')
    expect(recommendation.reason).toContain(
      'Prediction confidence is low. Maintaining conservative strategy.'
    )
  })

  it('downgrades confidence and blocks speed increase when telemetry is stale', () => {
    const recommendation = buildRecommendation({
      prediction: {
        ...basePrediction,
        predictedWhPerMile: 32,
        predictedMpptWatts: 2200,
        projectedEndDaySocPercent: 65,
      },
      telemetry: {
        ...baseTelemetry,
        efficiencyWhPerMile: 32,
        whPerMile: 32,
        mpptChargePowerWatts: 2200,
      },
      activeSocPercent: 80,
      spareSocPercent: 90,
      telemetryAgeSeconds: 12,
    })

    expect(recommendation.command).not.toBe('increase_speed_allowed')
    expect(recommendation.confidence).toBe('low')
    expect(recommendation.warnings).toContain(
      'Telemetry stale. Strategy confidence reduced.'
    )
  })

  it('blocks speed increase when MPPT is unavailable and prediction uses fallback solar', () => {
    const recommendation = buildRecommendation({
      prediction: {
        ...basePrediction,
        confidence: 'medium',
        warnings: ['Using configured solar fallback for MPPT prediction.'],
        predictedWhPerMile: 32,
        predictedMpptWatts: 2200,
        projectedEndDaySocPercent: 65,
      },
      telemetry: {
        ...baseTelemetry,
        efficiencyWhPerMile: 32,
        whPerMile: 32,
        mpptChargePowerWatts: undefined,
      },
      activeSocPercent: 80,
      spareSocPercent: 90,
    })

    expect(recommendation.command).toBe('hold_pace')
    expect(recommendation.warnings).toContain(
      'MPPT input is unavailable; speed increase is blocked.'
    )
  })

  it('clamps invalid projected SOC values before making a command', () => {
    const recommendation = buildRecommendation({
      prediction: {
        ...basePrediction,
        projectedNextStopSocPercent: 140,
        projectedEndDaySocPercent: -12,
      },
    })

    expect(recommendation.supportingData.projectedNextStopSocPercent).toBe(100)
    expect(recommendation.supportingData.projectedEndDaySocPercent).toBe(0)
    expect(recommendation.warnings.join(' ')).toContain('clamped')
  })

  it('reduces speed for high motor or controller temperature', () => {
    const recommendation = buildRecommendation({
      telemetry: {
        ...baseTelemetry,
        controllerTempC: 87,
      },
    })

    expect(recommendation.command).toBe('reduce_speed')
    expect(recommendation.severity).toBe('urgent')
  })
})

function buildRecommendation({
  prediction = basePrediction,
  telemetry = baseTelemetry,
  swapRecommendation = noSwapRecommendation,
  activeSocPercent = 70,
  spareSocPercent = 80,
  telemetryAgeSeconds,
}: {
  prediction?: RacePrediction
  telemetry?: TelemetryData
  swapRecommendation?: SwapRecommendation
  activeSocPercent?: number
  spareSocPercent?: number
  telemetryAgeSeconds?: number
} = {}): StrategyRecommendation {
  return buildDeterministicStrategyRecommendation({
    prediction,
    telemetry,
    swapRecommendation: {
      ...swapRecommendation,
      activeSocPercent,
      spareSocPercent,
    },
    batteryState: createInitialRaceBatteryState({
      now,
      activeSocPercent,
      spareSocPercent,
    }),
    telemetryAgeSeconds,
    now,
  })
}
