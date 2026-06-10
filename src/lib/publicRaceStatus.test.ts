import { describe, expect, it } from 'vitest'
import { getMockPublicRaceStatus } from '@/lib/publicRaceStatus'

describe('getMockPublicRaceStatus', () => {
  it('returns only public-safe race tracker fields', () => {
    const status = getMockPublicRaceStatus(new Date('2026-06-09T18:30:00Z'))

    expect(Object.keys(status).sort()).toEqual(
      [
        'avgSpeedMph',
        'currentDay',
        'currentPlace',
        'currentSegment',
        'currentTime',
        'eta',
        'instagramUrl',
        'lat',
        'lng',
        'milesCompleted',
        'milesLeft',
        'nextStop',
        'placeTotal',
        'routeProgressPct',
        'speedMph',
        'sponsors',
        'status',
        'standingsLastUpdated',
        'standingsSourceUrl',
        'totalDays',
        'totalMiles',
        'weatherCondition',
        'weatherLocation',
        'weatherTempF',
        'weatherWindDirection',
        'weatherWindMph',
      ].sort()
    )

    expect(status.sponsors[0]).toEqual({
      name: expect.any(String),
      logoUrl: expect.any(String),
      sponsorUrl: '#',
    })
    expect(status.routeProgressPct).toBeGreaterThan(0)
    expect(status.routeProgressPct).toBeLessThan(100)
    expect(status).not.toHaveProperty('batteryVoltage')
    expect(status).not.toHaveProperty('batteryCurrent')
    expect(status).not.toHaveProperty('motorTempC')
    expect(status).not.toHaveProperty('controllerTempC')
    expect(status).not.toHaveProperty('packetRateHz')
  })
})
