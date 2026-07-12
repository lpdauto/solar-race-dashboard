import type { AuthoritativeStrategyState } from '@/lib/authoritativeStrategyState'
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
  missionStatus?: string
  raceHealthScore?: number
  raceHealthLabel?: string
  command?: string
  strategyCommand?: string
  strategyTitle?: string
  strategyReason?: string
  recommendedSpeedMph?: number
  projectedNextStopSocPercent?: number
  projectedEndDaySocPercent?: number
  projectedFinishSoc?: number
  swapAction?: string
  swapConfidence?: string
  swapUrgency?: string
  traileringAction?: string
  predictionConfidence?: string
  warningsCount?: number
}

export const maxRaceSnapshots = 300

export function createRaceSnapshot({
  telemetry,
  telemetrySource,
  currentDay,
  currentMile,
  strategyState,
  strategy,
  warningsCount,
}: {
  telemetry: TelemetryData
  telemetrySource: TelemetrySource
  currentDay: number
  currentMile: number
  strategyState?: AuthoritativeStrategyState
  strategy?: PredictiveStrategyResult
  warningsCount?: number
}): RaceSnapshot {
  const strategyFields = strategyState
    ? authoritativeSnapshotFields(strategyState)
    : legacySnapshotFields(strategy)

  return {
    timestamp: telemetry.timestamp,
    telemetrySource,
    speedMph: telemetry.speedMph,
    batterySocPercent: telemetry.batterySocPercent,
    batteryVoltage: telemetry.batteryVoltage,
    batteryCurrent: telemetry.batteryCurrent,
    currentDay,
    currentMile,
    ...strategyFields,
    warningsCount,
  }
}

function authoritativeSnapshotFields(
  strategyState: AuthoritativeStrategyState
): Partial<RaceSnapshot> {
  return {
    missionStatus: strategyState.missionStatus,
    raceHealthScore: strategyState.raceHealth.score,
    raceHealthLabel: strategyState.raceHealth.label,
    command:
      strategyState.strategyRecommendation.title ??
      strategyState.strategyRecommendation.command,
    strategyCommand: strategyState.strategyRecommendation.command,
    strategyTitle: strategyState.strategyRecommendation.title,
    strategyReason: strategyState.strategyRecommendation.reason,
    recommendedSpeedMph: strategyState.recommendedSpeedMph,
    projectedNextStopSocPercent: strategyState.projectedNextStopSocPercent,
    projectedEndDaySocPercent: strategyState.projectedEndDaySocPercent,
    projectedFinishSoc: strategyState.projectedEndDaySocPercent,
    swapAction: strategyState.swapRecommendation.action,
    swapConfidence: strategyState.swapRecommendation.confidence,
    traileringAction: strategyState.traileringRecommendation?.action,
    predictionConfidence: strategyState.predictionConfidence,
  }
}

function legacySnapshotFields(
  strategy?: PredictiveStrategyResult
): Partial<RaceSnapshot> {
  return {
    command: strategy?.driverAction ?? strategy?.recommendations[0]?.action,
    projectedFinishSoc: strategy?.projectedFinishSoc,
    swapAction: strategy?.swapAdvice.action,
    swapUrgency: strategy?.swapAdvice.urgency,
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
  'missionStatus',
  'raceHealthScore',
  'raceHealthLabel',
  'command',
  'strategyCommand',
  'strategyTitle',
  'strategyReason',
  'recommendedSpeedMph',
  'projectedNextStopSocPercent',
  'projectedEndDaySocPercent',
  'projectedFinishSoc',
  'swapAction',
  'swapConfidence',
  'swapUrgency',
  'traileringAction',
  'predictionConfidence',
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
    snapshot.missionStatus,
    snapshot.raceHealthScore,
    snapshot.raceHealthLabel,
    snapshot.command,
    snapshot.strategyCommand,
    snapshot.strategyTitle,
    snapshot.strategyReason,
    snapshot.recommendedSpeedMph,
    snapshot.projectedNextStopSocPercent,
    snapshot.projectedEndDaySocPercent,
    snapshot.projectedFinishSoc,
    snapshot.swapAction,
    snapshot.swapConfidence,
    snapshot.swapUrgency,
    snapshot.traileringAction,
    snapshot.predictionConfidence,
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
