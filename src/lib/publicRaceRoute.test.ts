import { describe, expect, it } from 'vitest'
import {
  calculateCompletedRoutePercentage,
  splitRouteByCompletion,
  type LatLngTuple,
} from '@/lib/publicRaceRoute'

describe('calculateCompletedRoutePercentage', () => {
  it('calculates and clamps route progress from miles', () => {
    expect(
      calculateCompletedRoutePercentage({
        milesCompleted: 150,
        totalMiles: 600,
      })
    ).toBe(25)
    expect(
      calculateCompletedRoutePercentage({
        milesCompleted: 900,
        totalMiles: 600,
      })
    ).toBe(100)
    expect(
      calculateCompletedRoutePercentage({
        milesCompleted: 1,
        totalMiles: 0,
      })
    ).toBe(0)
  })
})

describe('splitRouteByCompletion', () => {
  it('splits the route into completed and remaining polylines', () => {
    const route: LatLngTuple[] = [
      [0, 0],
      [0, 10],
      [0, 20],
    ]

    expect(splitRouteByCompletion(route, 25)).toEqual({
      completed: [
        [0, 0],
        [0, 5],
      ],
      remaining: [
        [0, 5],
        [0, 10],
        [0, 20],
      ],
    })
  })
})
