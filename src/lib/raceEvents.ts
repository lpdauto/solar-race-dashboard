export type RaceEvent = {
  id: string
  timestamp: number
  type:
    | 'TRAILER_START'
    | 'TRAILER_END'
    | 'BATTERY_SWAP'
    | 'DRIVER_CHANGE'
    | 'MANUAL_NOTE'
  day: number
  mile: number
  note?: string
}

export type TraileringSession = {
  startMile: number
  endMile?: number
  day: number
  distanceMiles: number
  status: 'active' | 'closed'
}

export const raceEventsStorageKey = 'solar-race-events'
export const raceEventsChangedEventName = 'solar-race-events-changed'

export function createRaceEvent({
  type,
  day,
  mile,
  note,
}: {
  type: RaceEvent['type']
  day: number
  mile: number
  note?: string
}): RaceEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    type,
    day,
    mile,
    note,
  }
}

export function readStoredRaceEvents(): RaceEvent[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(raceEventsStorageKey)

    if (!stored) return []

    return normalizeRaceEvents(JSON.parse(stored))
  } catch {
    return []
  }
}

export function writeStoredRaceEvents(events: RaceEvent[]) {
  window.localStorage.setItem(
    raceEventsStorageKey,
    JSON.stringify(normalizeRaceEvents(events))
  )
  window.dispatchEvent(new CustomEvent(raceEventsChangedEventName))
}

export function buildTraileringSessions(events: RaceEvent[]): TraileringSession[] {
  const sessions: TraileringSession[] = []
  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp)
  let activeStart: RaceEvent | null = null

  for (const event of sortedEvents) {
    if (event.type === 'TRAILER_START' && !activeStart) {
      activeStart = event
      continue
    }

    if (event.type === 'TRAILER_END' && activeStart) {
      const distanceMiles = Math.max(0, event.mile - activeStart.mile)

      sessions.push({
        startMile: activeStart.mile,
        endMile: event.mile,
        day: activeStart.day,
        distanceMiles,
        status: 'closed',
      })
      activeStart = null
    }
  }

  if (activeStart) {
    sessions.push({
      startMile: activeStart.mile,
      day: activeStart.day,
      distanceMiles: 0,
      status: 'active',
    })
  }

  return sessions
}

export function getActiveTraileringSession(
  sessions: TraileringSession[]
): TraileringSession | null {
  return sessions.find((session) => session.status === 'active') ?? null
}

export function calculateTraileredMiles(sessions: TraileringSession[]) {
  return sessions.reduce((total, session) => total + session.distanceMiles, 0)
}

export function calculateDrivenMiles(
  totalRouteMiles: number,
  traileringSessions: TraileringSession[]
) {
  return Math.max(0, totalRouteMiles - calculateTraileredMiles(traileringSessions))
}

export function sessionsForDay(
  sessions: TraileringSession[],
  day: number,
  currentMile?: number
) {
  return sessions
    .filter((session) => session.day === day)
    .map((session) => {
      if (session.status === 'active' && currentMile !== undefined) {
        return {
          ...session,
          distanceMiles: Math.max(0, currentMile - session.startMile),
        }
      }

      return session
    })
}

const raceEventCsvHeaders = [
  'timestamp',
  'type',
  'day',
  'mile',
  'note',
] as const

const traileringSessionCsvHeaders = [
  'day',
  'startMile',
  'endMile',
  'distanceMiles',
  'status',
] as const

export function exportRaceEventsToCsv(events: RaceEvent[]): string {
  const rows = events.map((event) => [
    new Date(event.timestamp).toISOString(),
    event.type,
    event.day,
    event.mile,
    event.note,
  ])

  return [
    raceEventCsvHeaders.join(','),
    ...rows.map((row) => row.map(escapeCsvValue).join(',')),
  ].join('\n')
}

export function exportTraileringSessionsToCsv(
  sessions: TraileringSession[]
): string {
  const rows = sessions.map((session) => [
    session.day,
    session.startMile,
    session.endMile,
    session.distanceMiles,
    session.status,
  ])

  return [
    traileringSessionCsvHeaders.join(','),
    ...rows.map((row) => row.map(escapeCsvValue).join(',')),
  ].join('\n')
}

function normalizeRaceEvents(value: unknown): RaceEvent[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((event): RaceEvent[] => {
    if (
      typeof event !== 'object' ||
      event === null ||
      !isRaceEventType((event as { type?: unknown }).type)
    ) {
      return []
    }

    const rawEvent = event as Partial<RaceEvent>
    const type = rawEvent.type

    if (!isRaceEventType(type)) return []

    return [{
      id: typeof rawEvent.id === 'string' ? rawEvent.id : `${Date.now()}`,
      timestamp: finiteNumber(rawEvent.timestamp, Date.now()),
      type,
      day: finiteNumber(rawEvent.day, 1),
      mile: Math.max(0, finiteNumber(rawEvent.mile, 0)),
      note: typeof rawEvent.note === 'string' ? rawEvent.note : undefined,
    }]
  })
}

function isRaceEventType(value: unknown): value is RaceEvent['type'] {
  return (
    value === 'TRAILER_START' ||
    value === 'TRAILER_END' ||
    value === 'BATTERY_SWAP' ||
    value === 'DRIVER_CHANGE' ||
    value === 'MANUAL_NOTE'
  )
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function escapeCsvValue(value: unknown): string {
  if (value === undefined || value === null) return ''

  const text = String(value)
  const escapedText = text.replaceAll('"', '""')

  return /[",\n\r]/.test(escapedText) ? `"${escapedText}"` : escapedText
}
