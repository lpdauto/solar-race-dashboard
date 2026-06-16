import { describe, expect, it } from 'vitest'
import { raceRoute } from '@/data/raceRoute'
import { defaultCarSetup, simulateDayEnergy } from '@/lib/energy'
import { rx2Config } from '@/lib/race/rx2Config'
import { calculateScoringMiles } from '@/lib/routeMileage'
import { estimateSegmentEnergy } from '@/lib/strategyEngine'

describe('mandatory trailer strategy behavior', () => {
  it('charges zero energy consumption to mandatory trailer segments', () => {
    const day3 = raceRoute.find((day) => day.day === 3)!
    const trailerSegment = day3.segments.find(
      (segment) => segment.type === 'mandatory_trailer'
    )!

    const estimate = estimateSegmentEnergy({
      segment: trailerSegment,
      raceDay: day3,
      telemetry: null,
      vehicleConfig: rx2Config,
      baselineWhPerMile: 200,
    })

    expect(estimate.expectedWh).toBe(0)
    expect(estimate.expectedWhPerMile).toBe(0)
  })

  it('does not drop projected SOC for a pure mandatory trailering day model', () => {
    const result = simulateDayEnergy({
      distanceMiles: 23.6,
      scoringMiles: 0,
      elevationStats: {
        totalGain: 0,
        totalLoss: 0,
        maxElevation: 0,
        minElevation: 0,
        steepestClimbGrade: 0,
        steepestDescentGrade: 0,
        highestGradeRisk: 'low',
        hasSteepClimbs: false,
        hasLongDescents: false,
        hasHighGain: false,
        hasMildGrades: true,
      },
      carSetup: defaultCarSetup,
    })

    expect(result.flatRoadWh).toBe(0)
    expect(result.netWh).toBe(0)
    expect(result.predictedFinishSocPercent).toBe(100)
  })

  it('uses scoring miles instead of physical trailer miles for day simulation', () => {
    const day5 = raceRoute.find((day) => day.day === 5)!
    const result = simulateDayEnergy({
      distanceMiles: day5.physicalDistanceMiles ?? day5.distanceMiles,
      scoringMiles: calculateScoringMiles(day5),
      elevationStats: {
        totalGain: 0,
        totalLoss: 0,
        maxElevation: 0,
        minElevation: 0,
        steepestClimbGrade: 0,
        steepestDescentGrade: 0,
        highestGradeRisk: 'low',
        hasSteepClimbs: false,
        hasLongDescents: false,
        hasHighGain: false,
        hasMildGrades: true,
      },
      carSetup: defaultCarSetup,
    })

    expect(result.flatRoadWh).toBeGreaterThan(0)
    expect(result.flatRoadWh / calculateScoringMiles(day5)).toBeGreaterThan(0)
  })
})
