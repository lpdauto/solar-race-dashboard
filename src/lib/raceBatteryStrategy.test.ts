import { describe, expect, it } from 'vitest'
import {
  createInitialRaceBatteryState,
  executeBatterySwap,
  planBatterySwap,
  setActivePack,
  setBatteryPackSoc,
  updateRaceBatteryStateFromTelemetry,
  validateRaceBatteryState,
  type RaceBatteryState,
} from '@/lib/raceBatteryStrategy'
import type { RacePrediction } from '@/lib/racePrediction'
import type { TelemetryData } from '@/types/telemetry'

const now = Date.parse('2026-07-21T17:00:00.000Z')
const batteryCapacityWh = 5000

const basePrediction: RacePrediction = {
  timestamp: now,
  confidence: 'high',
  warnings: [],
  predictedWhPerMile: 40,
  predictedMpptWatts: 600,
  currentBatteryEnergyWh: 2500,
  currentSocPercent: 50,
  projectedEndSegmentSocPercent: 42,
  projectedNextStopSocPercent: 40,
  projectedEndDaySocPercent: 35,
  projectedDriveEnergyWh: 1600,
  projectedSolarRecoveredWh: 600,
  projectedNetEnergyWh: 1000,
  reserveEnergyWh: 1000,
  reserveMarginPercent: 15,
  energyMarginWh: 1100,
  energyMarginKWh: 1.1,
  remainingSegmentMiles: 12,
  remainingDayMiles: 40,
  nextStopMiles: 15,
}

const baseTelemetry: TelemetryData = {
  timestamp: now,
  source: 'manual',
  speedMph: 35,
  batteryVoltage: 80,
  batteryCurrent: 15,
  batterySocPercent: 50,
  batteryEnergyWh: 2500,
  mpptChargePowerWatts: 1200,
}

describe('race battery A/B strategy', () => {
  it('returns no_swap when active pack is above 40% and next stop projection is safe', () => {
    const recommendation = planBatterySwap({
      batteryState: batteryStateWithSoc({ activeSoc: 45, spareSoc: 70 }),
      prediction: basePrediction,
    })

    expect(recommendation.action).toBe('no_swap')
    expect(recommendation.confidence).toBe('high')
    expect(recommendation.reason).toContain('No swap needed')
  })

  it('returns plan_swap when active pack is 25%, spare is strong, and projection falls below 30%', () => {
    const recommendation = planBatterySwap({
      batteryState: batteryStateWithSoc({ activeSoc: 25, spareSoc: 80 }),
      prediction: {
        ...basePrediction,
        projectedNextStopSocPercent: 27,
      },
    })

    expect(recommendation.action).toBe('plan_swap')
    expect(recommendation.activeSocPercent).toBe(25)
    expect(recommendation.spareSocPercent).toBe(80)
  })

  it('returns swap_now when active pack is below 20% and spare is meaningfully higher', () => {
    const recommendation = planBatterySwap({
      batteryState: batteryStateWithSoc({ activeSoc: 18, spareSoc: 80 }),
      prediction: basePrediction,
    })

    expect(recommendation.action).toBe('swap_now')
    expect(recommendation.reason).toContain('meaningfully higher')
  })

  it('does not recommend swap_now when both packs are 100%', () => {
    const recommendation = planBatterySwap({
      batteryState: batteryStateWithSoc({ activeSoc: 100, spareSoc: 100 }),
      prediction: {
        ...basePrediction,
        projectedNextStopSocPercent: 15,
        projectedEndSegmentSocPercent: 15,
      },
    })

    expect(recommendation.action).not.toBe('swap_now')
    expect(recommendation.reason).toContain('not meaningfully stronger')
  })

  it('does not blindly swap now to a weak spare when active pack is in the planning band', () => {
    const recommendation = planBatterySwap({
      batteryState: batteryStateWithSoc({ activeSoc: 25, spareSoc: 28 }),
      prediction: {
        ...basePrediction,
        projectedNextStopSocPercent: 26,
      },
    })

    expect(recommendation.action).not.toBe('swap_now')
    expect(recommendation.confidence).toBe('low')
    expect(recommendation.reason).toContain('Both packs are low')
    expect(recommendation.reason).toContain('do not blind swap')
  })

  it('avoids swap_now when both packs are low and the spare does not improve the situation', () => {
    const recommendation = planBatterySwap({
      batteryState: batteryStateWithSoc({ activeSoc: 18, spareSoc: 22 }),
      prediction: basePrediction,
    })

    expect(recommendation.action).not.toBe('swap_now')
    expect(recommendation.confidence).toBe('low')
    expect(recommendation.reason).toContain('not meaningfully higher')
  })

  it('charges the spare pack over time from MPPT and clamps at 100%', () => {
    const initial = createInitialRaceBatteryState({
      now,
      activeSocPercent: 50,
      spareSocPercent: 50,
      batteryCapacityWh,
    })
    const afterOneHour = updateRaceBatteryStateFromTelemetry({
      state: initial,
      telemetry: {
        ...baseTelemetry,
        timestamp: now + 3_600_000,
        batterySocPercent: 45,
        batteryEnergyWh: 2250,
        mpptChargePowerWatts: 1200,
      },
      timestampMs: now + 3_600_000,
      batteryCapacityWh,
    })

    expect(afterOneHour.packs.B.energyWh).toBeCloseTo(3700, 6)
    expect(afterOneHour.packs.B.socPercent).toBeCloseTo(74, 6)

    const nearFull = createInitialRaceBatteryState({
      now,
      activeSocPercent: 50,
      spareSocPercent: 99,
      batteryCapacityWh,
    })
    const clamped = updateRaceBatteryStateFromTelemetry({
      state: nearFull,
      telemetry: {
        ...baseTelemetry,
        timestamp: now + 3_600_000,
        mpptChargePowerWatts: 2500,
      },
      timestampMs: now + 3_600_000,
      batteryCapacityWh,
    })

    expect(clamped.packs.B.energyWh).toBe(5000)
    expect(clamped.packs.B.socPercent).toBe(100)
  })

  it('supports setting the active pack, manually setting SOC, and executing a swap', () => {
    const initial = createInitialRaceBatteryState({ now, batteryCapacityWh })
    const adjusted = setBatteryPackSoc({
      state: initial,
      packId: 'B',
      socPercent: 72,
      now,
      batteryCapacityWh,
    })
    const activeB = setActivePack(adjusted, 'B', now)
    const swapped = executeBatterySwap(activeB, now)

    expect(adjusted.packs.B.energyWh).toBe(3600)
    expect(activeB.activePackId).toBe('B')
    expect(swapped.activePackId).toBe('A')
  })

  it('clamps invalid pack SOC and energy safely', () => {
    const invalidState = {
      activePackId: 'A',
      packs: {
        A: {
          id: 'A',
          role: 'active',
          socPercent: 130,
          energyWh: 7000,
          lastUpdatedAt: now,
          isCharging: false,
        },
        B: {
          id: 'B',
          role: 'spare',
          socPercent: -10,
          energyWh: -200,
          lastUpdatedAt: now,
          isCharging: true,
        },
      },
    } satisfies RaceBatteryState

    const validated = validateRaceBatteryState({
      state: invalidState,
      now,
      batteryCapacityWh,
    })

    expect(validated.packs.A.socPercent).toBe(100)
    expect(validated.packs.A.energyWh).toBe(5000)
    expect(validated.packs.B.socPercent).toBe(0)
    expect(validated.packs.B.energyWh).toBe(0)
    expect(validated.warnings?.join(' ')).toContain('clamped')
  })

  it('recovers safely from inconsistent active and spare pack roles', () => {
    const invalidState: RaceBatteryState = {
      activePackId: 'A',
      packs: {
        A: {
          id: 'A',
          role: 'active',
          socPercent: 60,
          energyWh: 3000,
          lastUpdatedAt: now,
          isCharging: false,
        },
        B: {
          id: 'B',
          role: 'active',
          socPercent: 70,
          energyWh: 3500,
          lastUpdatedAt: now,
          isCharging: false,
        },
      },
    }

    const validated = validateRaceBatteryState({
      state: invalidState,
      now,
      batteryCapacityWh,
    })

    expect(validated.activePackId).toBe('A')
    expect(validated.packs.A.role).toBe('active')
    expect(validated.packs.B.role).toBe('spare')
    expect(validated.warnings?.join(' ')).toContain('roles were inconsistent')
  })
})

function batteryStateWithSoc({
  activeSoc,
  spareSoc,
}: {
  activeSoc: number
  spareSoc: number
}): RaceBatteryState {
  return createInitialRaceBatteryState({
    now,
    activeSocPercent: activeSoc,
    spareSocPercent: spareSoc,
    batteryCapacityWh,
  })
}
