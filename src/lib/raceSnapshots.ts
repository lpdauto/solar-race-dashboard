import type { PredictiveStrategyResult } from '@/lib/strategyEngine'
import type { TelemetryData, TelemetrySource } from '@/types/telemetry'

export type RaceSnapshot = {
  timestamp: number
  telemetrySource: TelemetrySource | TelemetryData['source']
  speedMph: number
  batterySocPercent: number
  batteryVoltage: number
  batteryCurrent: number
  currentDay: number
  currentMile: number
  command?: string
  projectedFinishSoc?: number
  swapAction?: string
  swapUrgency?: string
  warningsCount?: number
}

export const maxRaceSnapshots = 300

export function createRaceSnapshot({
  telemetry,
  telemetrySource,
  currentDay,
  currentMile,
  strategy,
  warningsCount,
}: {
  telemetry: TelemetryData
  telemetrySource: TelemetrySource
  currentDay: number
  currentMile: number
  strategy?: PredictiveStrategyResult
  warningsCount?: number
}): RaceSnapshot {
  return {
    timestamp: telemetry.timestamp,
    telemetrySource,
    speedMph: telemetry.speedMph,
    batterySocPercent: telemetry.batterySocPercent,
    batteryVoltage: telemetry.batteryVoltage,
    batteryCurrent: telemetry.batteryCurrent,
    currentDay,
    currentMile,
    command: strategy?.driverAction ?? strategy?.recommendations[0]?.action,
    projectedFinishSoc: strategy?.projectedFinishSoc,
    swapAction: strategy?.swapAdvice.action,
    swapUrgency: strategy?.swapAdvice.urgency,
    warningsCount,
  }
}

export function trimSnapshotHistory(
  snapshots: RaceSnapshot[],
  maxEntries = maxRaceSnapshots
) {
  return snapshots.length > maxEntries
    ? snapshots.slice(snapshots.length - maxEntries)
    : snapshots
}

const raceSnapshotCsvHeaders = [
  'timestamp',
  'telemetrySource',
  'speedMph',
  'batterySocPercent',
  'batteryVoltage',
  'batteryCurrent',
  'currentDay',
  'currentMile',
  'command',
  'projectedFinishSoc',
  'swapAction',
  'swapUrgency',
  'warningCount',
] as const

export function exportRaceSnapshotsToCsv(snapshots: RaceSnapshot[]): string {
  const rows = snapshots.map((snapshot) => [
    new Date(snapshot.timestamp).toISOString(),
    snapshot.telemetrySource,
    snapshot.speedMph,
    snapshot.batterySocPercent,
    snapshot.batteryVoltage,
    snapshot.batteryCurrent,
    snapshot.currentDay,
    snapshot.currentMile,
    snapshot.command,
    snapshot.projectedFinishSoc,
    snapshot.swapAction,
    snapshot.swapUrgency,
    snapshot.warningsCount,
  ])

  return [
    raceSnapshotCsvHeaders.join(','),
    ...rows.map((row) => row.map(escapeCsvValue).join(',')),
  ].join('\n')
}

function escapeCsvValue(value: unknown): string {
  if (value === undefined || value === null) return ''

  const text = String(value)
  const escapedText = text.replaceAll('"', '""')

  return /[",\n\r]/.test(escapedText) ? `"${escapedText}"` : escapedText
}
