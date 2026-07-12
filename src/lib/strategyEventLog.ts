import type { StrategyCommand } from '@/lib/deterministicStrategyRecommendation'
import type { PredictionConfidence } from '@/lib/racePrediction'
import type { SwapPlannerAction } from '@/lib/raceBatteryStrategy'

export type StrategyEventLogEntry = {
  timestamp: number
  type:
    | 'command_changed'
    | 'confidence_changed'
    | 'swap_recommendation_changed'
    | 'stale_telemetry_started'
    | 'stale_telemetry_cleared'
  detail: string
  command?: StrategyCommand
  confidence?: PredictionConfidence
  swapAction?: SwapPlannerAction
}

export const strategyEventLogStorageKey = 'rx2-strategy-event-log'
export const maxStrategyEventLogEntries = 100

export function appendStrategyEventLogEntry(entry: StrategyEventLogEntry) {
  if (typeof window === 'undefined') return

  const currentEntries = readStrategyEventLog()
  const nextEntries = [...currentEntries, entry].slice(-maxStrategyEventLogEntries)

  window.localStorage.setItem(
    strategyEventLogStorageKey,
    JSON.stringify(nextEntries)
  )
}

export function readStrategyEventLog(): StrategyEventLogEntry[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(strategyEventLogStorageKey)

    if (!stored) return []

    const parsed = JSON.parse(stored)

    if (!Array.isArray(parsed)) return []

    return parsed
      .map(normalizeEntry)
      .filter((entry): entry is StrategyEventLogEntry => entry !== null)
      .slice(-maxStrategyEventLogEntries)
  } catch {
    return []
  }
}

function normalizeEntry(value: unknown): StrategyEventLogEntry | null {
  if (typeof value !== 'object' || value === null) return null

  const entry = value as Partial<StrategyEventLogEntry>

  if (
    typeof entry.timestamp !== 'number' ||
    !Number.isFinite(entry.timestamp) ||
    typeof entry.type !== 'string' ||
    typeof entry.detail !== 'string'
  ) {
    return null
  }

  return {
    timestamp: entry.timestamp,
    type: entry.type as StrategyEventLogEntry['type'],
    detail: entry.detail,
    command: entry.command,
    confidence: entry.confidence,
    swapAction: entry.swapAction,
  }
}
