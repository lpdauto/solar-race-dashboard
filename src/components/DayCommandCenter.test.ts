import { describe, expect, it } from 'vitest'
import { formatForecastNetEnergy } from '@/components/DayCommandCenter'

describe('strategy forecast net energy formatting', () => {
  it('labels negative net energy as a displayed surplus', () => {
    expect(formatForecastNetEnergy(-8900)).toBe('+8.90 kWh surplus')
  })

  it('labels positive net energy as a displayed deficit', () => {
    expect(formatForecastNetEnergy(6200)).toBe('-6.20 kWh deficit')
  })

  it('labels zero net energy as balanced', () => {
    expect(formatForecastNetEnergy(0)).toBe('0 Wh balanced')
  })
})
