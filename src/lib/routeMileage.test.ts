import { describe, expect, it } from 'vitest'
import { raceRoute } from '@/data/raceRoute'
import {
  calculateDrivenOverlapMiles,
  calculateMandatoryTraileringMiles,
  calculatePhysicalMiles,
  calculateScoringMiles,
  mandatoryTrailerSegments,
  mandatoryTraileringLegendLabel,
  mandatoryTraileringMapColor,
} from '@/lib/routeMileage'

describe('mandatory trailering mileage', () => {
  it('counts mandatory trailer sections as physical miles but zero scoring miles', () => {
    const day1 = raceRoute.find((day) => day.day === 1)!

    expect(calculateScoringMiles(day1)).toBe(153.6)
    expect(calculateMandatoryTraileringMiles(day1)).toBeCloseTo(62.2, 1)
    expect(calculatePhysicalMiles(day1)).toBe(215.7)

    for (const segment of mandatoryTrailerSegments(day1)) {
      expect(segment.scoringMiles).toBe(0)
      expect(segment.transportMiles).toBeGreaterThan(0)
    }
  })

  it('subtracts mandatory trailer overlap from driven energy miles', () => {
    const day1 = raceRoute.find((day) => day.day === 1)!
    const drivenSegment = day1.segments.find(
      (segment) => segment.title === 'TX 114 to TX 51 transition'
    )!

    expect(
      calculateDrivenOverlapMiles({
        segment: drivenSegment,
        raceDay: day1,
        startMile: drivenSegment.mileStart,
        endMile: drivenSegment.mileEnd,
      })
    ).toBeCloseTo(7.0, 1)
  })

  it('keeps a map styling contract for mandatory trailering overlays', () => {
    expect(mandatoryTraileringLegendLabel).toBe('Mandatory trailering')
    expect(mandatoryTraileringMapColor).toBe('#a78bfa')
  })
})
