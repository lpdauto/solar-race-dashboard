import { describe, expect, it } from 'vitest'
import {
  defaultFiveDayStrategyPlanInputs,
  projectFiveDayStrategyPlan,
  type StrategyPlanInputs,
} from '@/lib/strategy/strategyPlan'

describe('projectFiveDayStrategyPlan', () => {
  it('reduces active battery SOC on drive segments', () => {
    const plan = projectFiveDayStrategyPlan(
      makeInputs({
        initialSocA: 100,
        initialSocB: 100,
        raceDays: [
          {
            dayNumber: 1,
            segments: [
              driveSegment({ distanceMiles: 10 }),
            ],
          },
        ],
      })
    )

    expect(plan.totalDriveWh).toBe(1100)
    expect(plan.projectedFinalSocA).toBeCloseTo(79.05, 1)
    expect(plan.projectedFinalSocB).toBe(100)
  })

  it('fills only available charging headroom and tracks lost solar', () => {
    const plan = projectFiveDayStrategyPlan(
      makeInputs({
        initialSocA: 50,
        initialSocB: 90,
        solarArrayWatts: 1000,
        solarDerateFactor: 1,
        chargeEfficiency: 1,
        raceDays: [
          {
            dayNumber: 1,
            segments: [
              chargeSegment({ durationMinutes: 60, swapAllowed: false }),
            ],
          },
        ],
      })
    )

    expect(plan.totalPotentialSolarWh).toBe(1000)
    expect(plan.totalCapturedSolarWh).toBe(525)
    expect(plan.totalLostSolarWh).toBe(475)
    expect(plan.projectedFinalSocB).toBe(100)
  })

  it('marks final status as TOO_CONSERVATIVE above 20%', () => {
    const plan = projectFiveDayStrategyPlan(
      makeInputs({
        initialSocA: 50,
        initialSocB: 50,
        raceDays: [],
      })
    )

    expect(plan.finalStatus).toBe('TOO_CONSERVATIVE')
  })

  it('marks final status as TOO_AGGRESSIVE below 10%', () => {
    const plan = projectFiveDayStrategyPlan(
      makeInputs({
        initialSocA: 8,
        initialSocB: 15,
        raceDays: [],
      })
    )

    expect(plan.finalStatus).toBe('TOO_AGGRESSIVE')
  })

  it('marks final status as ON_TARGET when both packs finish 10-20%', () => {
    const plan = projectFiveDayStrategyPlan(
      makeInputs({
        initialSocA: 12,
        initialSocB: 18,
        raceDays: [],
      })
    )

    expect(plan.finalStatus).toBe('ON_TARGET')
  })

  it('recommends a swap when charging target lacks headroom', () => {
    const plan = projectFiveDayStrategyPlan(
      makeInputs({
        initialSocA: 50,
        initialSocB: 95,
        solarArrayWatts: 1000,
        solarDerateFactor: 1,
        chargeEfficiency: 1,
        raceDays: [
          {
            dayNumber: 1,
            segments: [
              chargeSegment({ durationMinutes: 60 }),
            ],
          },
        ],
      })
    )

    expect(plan.segmentForecasts[0].recommendation).toBe('SWAP BEFORE CHARGE')
    expect(plan.segmentForecasts[0].activePackAfter).toBe('B')
    expect(plan.segmentForecasts[0].recommendationReason).toContain('headroom')
  })
})

function makeInputs(overrides: Partial<StrategyPlanInputs>): StrategyPlanInputs {
  return {
    ...defaultFiveDayStrategyPlanInputs,
    initialSocA: 100,
    initialSocB: 100,
    activePack: 'A',
    raceDays: [],
    ...overrides,
  }
}

function driveSegment({ distanceMiles }: { distanceMiles: number }) {
  return {
    id: 'drive-1',
    name: 'Drive',
    type: 'drive' as const,
    distanceMiles,
    chargingAllowed: false,
    swapAllowed: true,
  }
}

function chargeSegment({
  durationMinutes,
  swapAllowed = true,
}: {
  durationMinutes: number
  swapAllowed?: boolean
}) {
  return {
    id: 'charge-1',
    name: 'Charge',
    type: 'lunch' as const,
    durationMinutes,
    chargingAllowed: true,
    swapAllowed,
  }
}
