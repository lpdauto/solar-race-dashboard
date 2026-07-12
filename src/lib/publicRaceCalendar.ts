import { raceRoute, type RaceDay } from '@/data/raceRoute'

export type PublicRacePhase = 'pre-race' | 'racing' | 'post-race'

export type PublicRaceCalendarStatus = {
  phase: PublicRacePhase
  currentDay: number
  totalDays: number
  currentDayLabel: string
  dayRouteLabel: string
  dayDateLabel: string
  countdownLabel: string
  raceDay: RaceDay
}

const centralTimeZone = 'America/Chicago'
const raceStartDateKey = '2026-07-19'
const raceEndDateKey = '2026-07-23'
const raceStartLabel = 'Jul 19'

export function getPublicRaceCalendarStatus(
  now = new Date()
): PublicRaceCalendarStatus {
  const dateKey = formatCentralDateKey(now)
  const raceDay =
    raceRoute.find((day) => formatRaceDateKey(day.date) === dateKey) ??
    (dateKey < raceStartDateKey
      ? raceRoute[0]
      : dateKey > raceEndDateKey
        ? raceRoute[raceRoute.length - 1]
        : raceRoute[0])
  const phase: PublicRacePhase =
    dateKey < raceStartDateKey
      ? 'pre-race'
      : dateKey > raceEndDateKey
        ? 'post-race'
        : 'racing'

  return {
    phase,
    currentDay: raceDay.day,
    totalDays: raceRoute.length,
    currentDayLabel:
      phase === 'pre-race'
        ? 'Racing soon'
        : phase === 'post-race'
          ? 'Race complete'
          : `Day ${raceDay.day} of ${raceRoute.length}`,
    dayRouteLabel: `${raceDay.start} to ${raceDay.end}`,
    dayDateLabel: raceDay.date,
    countdownLabel:
      phase === 'pre-race'
        ? `Starts ${raceStartLabel}`
        : phase === 'post-race'
          ? 'Race complete'
          : `Race Day ${raceDay.day}`,
    raceDay,
  }
}

function formatCentralDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: centralTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

function formatRaceDateKey(value: string) {
  const timestamp = Date.parse(`${value} 12:00:00 GMT-0500`)

  if (!Number.isFinite(timestamp)) return ''

  return formatCentralDateKey(new Date(timestamp))
}
