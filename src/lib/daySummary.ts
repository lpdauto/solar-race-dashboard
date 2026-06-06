import {
  calculateTraileredMiles,
  type RaceEvent,
  type TraileringSession,
} from '@/lib/raceEvents'
import type { RaceSnapshot } from '@/lib/raceSnapshots'

export type DaySummary = {
  day: number
  totalSnapshots: number
  firstSnapshotTime?: number
  lastSnapshotTime?: number
  startingSoc?: number
  endingSoc?: number
  minSoc?: number
  maxSpeed?: number
  averageSpeed?: number
  batterySwapCount: number
  traileredMiles: number
  manualNoteCount: number
  warningCountTotal: number
  criticalEvents: string[]
}

export function generateDaySummary({
  currentDay,
  raceEvents,
  traileringSessions,
  strategySnapshots,
}: {
  currentDay: number
  raceEvents: RaceEvent[]
  traileringSessions: TraileringSession[]
  strategySnapshots: RaceSnapshot[]
}): DaySummary {
  const dayEvents = raceEvents
    .filter((event) => event.day === currentDay)
    .sort((a, b) => a.timestamp - b.timestamp)
  const daySessions = traileringSessions.filter(
    (session) => session.day === currentDay
  )
  const daySnapshots = strategySnapshots
    .filter((snapshot) => snapshot.currentDay === currentDay)
    .sort((a, b) => a.timestamp - b.timestamp)

  const firstSnapshot = daySnapshots[0]
  const lastSnapshot = daySnapshots[daySnapshots.length - 1]
  const speeds = daySnapshots.map((snapshot) => snapshot.speedMph)
  const socValues = daySnapshots.map((snapshot) => snapshot.batterySocPercent)
  const warningCountTotal = daySnapshots.reduce(
    (total, snapshot) => total + (snapshot.warningsCount ?? 0),
    0
  )

  return {
    day: currentDay,
    totalSnapshots: daySnapshots.length,
    firstSnapshotTime: firstSnapshot?.timestamp,
    lastSnapshotTime: lastSnapshot?.timestamp,
    startingSoc: firstSnapshot?.batterySocPercent,
    endingSoc: lastSnapshot?.batterySocPercent,
    minSoc: socValues.length > 0 ? Math.min(...socValues) : undefined,
    maxSpeed: speeds.length > 0 ? Math.max(...speeds) : undefined,
    averageSpeed:
      speeds.length > 0
        ? speeds.reduce((total, speed) => total + speed, 0) / speeds.length
        : undefined,
    batterySwapCount: dayEvents.filter((event) => event.type === 'BATTERY_SWAP')
      .length,
    traileredMiles: calculateTraileredMiles(daySessions),
    manualNoteCount: dayEvents.filter((event) => event.type === 'MANUAL_NOTE')
      .length,
    warningCountTotal,
    criticalEvents: buildCriticalEvents(dayEvents, daySnapshots, daySessions),
  }
}

const daySummaryCsvHeaders = [
  'day',
  'totalSnapshots',
  'firstSnapshotTime',
  'lastSnapshotTime',
  'startingSoc',
  'endingSoc',
  'minSoc',
  'maxSpeed',
  'averageSpeed',
  'batterySwapCount',
  'traileredMiles',
  'manualNoteCount',
  'warningCountTotal',
  'criticalEvents',
] as const

export function exportDaySummaryToCsv(summary: DaySummary): string {
  const row = [
    summary.day,
    summary.totalSnapshots,
    formatTimestamp(summary.firstSnapshotTime),
    formatTimestamp(summary.lastSnapshotTime),
    summary.startingSoc,
    summary.endingSoc,
    summary.minSoc,
    summary.maxSpeed,
    summary.averageSpeed,
    summary.batterySwapCount,
    summary.traileredMiles,
    summary.manualNoteCount,
    summary.warningCountTotal,
    summary.criticalEvents.join(' | '),
  ]

  return [
    daySummaryCsvHeaders.join(','),
    row.map(escapeCsvValue).join(','),
  ].join('\n')
}

function buildCriticalEvents(
  events: RaceEvent[],
  snapshots: RaceSnapshot[],
  sessions: TraileringSession[]
) {
  const criticalEvents: string[] = []

  for (const event of events) {
    if (event.type === 'BATTERY_SWAP') {
      criticalEvents.push(`Battery swap at mile ${event.mile.toFixed(1)}`)
    }

    if (event.type === 'MANUAL_NOTE' && event.note) {
      criticalEvents.push(`Note at mile ${event.mile.toFixed(1)}: ${event.note}`)
    }
  }

  for (const session of sessions) {
    const endText =
      session.status === 'active' || session.endMile === undefined
        ? 'active'
        : `ended mile ${session.endMile.toFixed(1)}`

    criticalEvents.push(
      `Trailering started mile ${session.startMile.toFixed(1)} (${endText})`
    )
  }

  const criticalSocSnapshot = snapshots.find(
    (snapshot) => snapshot.batterySocPercent < 15
  )

  if (criticalSocSnapshot) {
    criticalEvents.push(
      `Critical SOC ${criticalSocSnapshot.batterySocPercent.toFixed(1)}% at mile ${criticalSocSnapshot.currentMile.toFixed(1)}`
    )
  }

  return criticalEvents.slice(0, 8)
}

function formatTimestamp(timestamp?: number) {
  return timestamp === undefined ? undefined : new Date(timestamp).toISOString()
}

function escapeCsvValue(value: unknown): string {
  if (value === undefined || value === null) return ''

  const text = String(value)
  const escapedText = text.replaceAll('"', '""')

  return /[",\n\r]/.test(escapedText) ? `"${escapedText}"` : escapedText
}
