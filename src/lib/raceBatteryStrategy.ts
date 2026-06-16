import { calculateMpptInputWatts } from '@/lib/continuousEnergy'
import { rx2Config } from '@/lib/race/rx2Config'
import type { RacePrediction, PredictionConfidence } from '@/lib/racePrediction'
import type { TelemetryData } from '@/types/telemetry'

export type BatteryPackId = 'A' | 'B'

export type BatteryPackState = {
  id: BatteryPackId
  role: 'active' | 'spare'
  socPercent: number
  energyWh: number
  lastUpdatedAt: number
  isCharging: boolean
}

export type RaceBatteryState = {
  activePackId: BatteryPackId
  packs: Record<BatteryPackId, BatteryPackState>
  warnings?: string[]
}

export type SwapPlannerAction = 'no_swap' | 'plan_swap' | 'swap_now'

export type SwapRecommendation = {
  action: SwapPlannerAction
  confidence: PredictionConfidence
  reason: string
  activePackId: BatteryPackId
  sparePackId: BatteryPackId
  activeSocPercent: number
  spareSocPercent: number
  projectedEndSegmentSocPercent?: number
  projectedNextStopSocPercent?: number
  projectedEndDaySocPercent?: number
}

export const planSwapSocPercent = 30
export const forceSwapSocPercent = 20
export const meaningfulSpareAdvantagePercent = 10

export function createInitialRaceBatteryState({
  now = Date.now(),
  activeSocPercent = 100,
  spareSocPercent = 100,
  batteryCapacityWh = rx2Config.mainBatteryUsableWh,
}: {
  now?: number
  activeSocPercent?: number
  spareSocPercent?: number
  batteryCapacityWh?: number
} = {}): RaceBatteryState {
  return {
    activePackId: 'A',
    packs: {
      A: createPackState({
        id: 'A',
        role: 'active',
        socPercent: activeSocPercent,
        now,
        batteryCapacityWh,
      }),
      B: createPackState({
        id: 'B',
        role: 'spare',
        socPercent: spareSocPercent,
        now,
        batteryCapacityWh,
      }),
    },
  }
}

export function updateRaceBatteryStateFromTelemetry({
  state,
  telemetry,
  timestampMs = telemetry.timestamp,
  batteryCapacityWh = rx2Config.mainBatteryUsableWh,
}: {
  state: RaceBatteryState
  telemetry: TelemetryData
  timestampMs?: number
  batteryCapacityWh?: number
}): RaceBatteryState {
  const safeTimestampMs = Number.isFinite(timestampMs) ? timestampMs : Date.now()
  const safeState = validateRaceBatteryState({
    state,
    now: safeTimestampMs,
    batteryCapacityWh,
  })
  const activePackId = safeState.activePackId
  const sparePackId = otherPackId(activePackId)
  const activePack = safeState.packs[activePackId]
  const sparePack = safeState.packs[sparePackId]
  const lastUpdatedAt = Math.max(activePack.lastUpdatedAt, sparePack.lastUpdatedAt)
  const deltaSeconds = Math.max(0, (safeTimestampMs - lastUpdatedAt) / 1000)
  const mpptWatts = clamp(
    calculateMpptInputWatts(telemetry),
    0,
    rx2Config.solarStationMaxWatts
  )
  const spareEnergyWh = clamp(
    sparePack.energyWh + mpptWatts * deltaSeconds / 3600,
    0,
    batteryCapacityWh
  )
  const telemetryBatteryEnergyWh = finiteNumber(telemetry.batteryEnergyWh)
  const telemetrySocPercent = finiteNumber(telemetry.batterySocPercent)
  const warnings = [...(safeState.warnings ?? [])]

  if (
    telemetryBatteryEnergyWh !== undefined &&
    (telemetryBatteryEnergyWh < 0 || telemetryBatteryEnergyWh > batteryCapacityWh)
  ) {
    warnings.push('Active pack telemetry energy was outside usable battery capacity and was clamped.')
  }
  if (
    telemetrySocPercent !== undefined &&
    (telemetrySocPercent < 0 || telemetrySocPercent > 100)
  ) {
    warnings.push('Active pack telemetry SOC was outside 0-100% and was clamped.')
  }

  const activeEnergyWh = telemetryBatteryEnergyWh ??
    (telemetrySocPercent !== undefined
      ? socToEnergy(telemetrySocPercent, batteryCapacityWh)
      : activePack.energyWh)

  return normalizeRaceBatteryState(
    {
      activePackId,
      warnings,
      packs: {
        [activePackId]: {
          ...activePack,
          role: 'active',
          energyWh: clamp(activeEnergyWh, 0, batteryCapacityWh),
          socPercent: energyToSoc(activeEnergyWh, batteryCapacityWh),
          lastUpdatedAt: safeTimestampMs,
          isCharging: false,
        },
        [sparePackId]: {
          ...sparePack,
          role: 'spare',
          energyWh: spareEnergyWh,
          socPercent: energyToSoc(spareEnergyWh, batteryCapacityWh),
          lastUpdatedAt: safeTimestampMs,
          isCharging: mpptWatts > 0,
        },
      } as Record<BatteryPackId, BatteryPackState>,
    },
    batteryCapacityWh,
    safeTimestampMs
  )
}

export function setActivePack(
  state: RaceBatteryState,
  activePackId: BatteryPackId,
  now = Date.now()
): RaceBatteryState {
  return normalizeRaceBatteryState({
    activePackId,
    packs: {
      A: {
        ...state.packs.A,
        role: activePackId === 'A' ? 'active' : 'spare',
        isCharging: activePackId !== 'A' && state.packs.A.isCharging,
        lastUpdatedAt: now,
      },
      B: {
        ...state.packs.B,
        role: activePackId === 'B' ? 'active' : 'spare',
        isCharging: activePackId !== 'B' && state.packs.B.isCharging,
        lastUpdatedAt: now,
      },
    },
  })
}

export function setBatteryPackSoc({
  state,
  packId,
  socPercent,
  now = Date.now(),
  batteryCapacityWh = rx2Config.mainBatteryUsableWh,
}: {
  state: RaceBatteryState
  packId: BatteryPackId
  socPercent: number
  now?: number
  batteryCapacityWh?: number
}): RaceBatteryState {
  const nextSoc = clamp(socPercent, 0, 100)

  return normalizeRaceBatteryState({
    ...state,
    packs: {
      ...state.packs,
      [packId]: {
        ...state.packs[packId],
        socPercent: nextSoc,
        energyWh: socToEnergy(nextSoc, batteryCapacityWh),
        lastUpdatedAt: now,
      },
    },
  })
}

export function executeBatterySwap(
  state: RaceBatteryState,
  now = Date.now()
): RaceBatteryState {
  return setActivePack(state, otherPackId(state.activePackId), now)
}

export function validateRaceBatteryState({
  state,
  now = Date.now(),
  batteryCapacityWh = rx2Config.mainBatteryUsableWh,
}: {
  state: RaceBatteryState
  now?: number
  batteryCapacityWh?: number
}): RaceBatteryState {
  return normalizeRaceBatteryState(state, batteryCapacityWh, now)
}

export function planBatterySwap({
  batteryState,
  prediction,
}: {
  batteryState: RaceBatteryState
  prediction: RacePrediction
}): SwapRecommendation {
  const activePackId = batteryState.activePackId
  const sparePackId = otherPackId(activePackId)
  const activeSocPercent = batteryState.packs[activePackId].socPercent
  const spareSocPercent = batteryState.packs[sparePackId].socPercent
  const projectedEndSegmentSocPercent =
    prediction.projectedEndSegmentSocPercent
  const projectedNextStopSocPercent = prediction.projectedNextStopSocPercent
  const projectedEndDaySocPercent = prediction.projectedEndDaySocPercent
  const spareAdvantage = spareSocPercent - activeSocPercent
  const spareMeaningfullyBetter = spareAdvantage >= meaningfulSpareAdvantagePercent
  const spareWeak = spareSocPercent < planSwapSocPercent
  const bothPacksLow =
    activeSocPercent < forceSwapSocPercent &&
    spareSocPercent < planSwapSocPercent
  const bothPacksInPlanningBand =
    activeSocPercent < planSwapSocPercent &&
    spareSocPercent < planSwapSocPercent
  const baseConfidence = combineConfidence(
    prediction.confidence,
    spareWeak ? 'low' : 'high'
  )
  const projectedCritical =
    below(projectedEndSegmentSocPercent, forceSwapSocPercent) ||
    below(projectedNextStopSocPercent, rx2Config.absoluteMinimumSocPercent)
  const projectedPlanning =
    below(projectedEndSegmentSocPercent, planSwapSocPercent) ||
    below(projectedNextStopSocPercent, planSwapSocPercent)

  if (bothPacksLow) {
    return recommendation({
      action: spareMeaningfullyBetter ? 'swap_now' : 'no_swap',
      confidence: 'low',
      reason:
        spareMeaningfullyBetter
          ? 'Both packs are low, but the spare pack is meaningfully higher. Swap only if needed to protect the active pack, reduce speed, and prioritize charging before the next segment.'
          : 'Both packs are low and the spare pack is not meaningfully higher. Hold current pack, reduce speed, and prioritize charging before the next segment.',
      activePackId,
      sparePackId,
      activeSocPercent,
      spareSocPercent,
      projectedEndSegmentSocPercent,
      projectedNextStopSocPercent,
      projectedEndDaySocPercent,
    })
  }

  if (activeSocPercent < forceSwapSocPercent) {
    if (!spareMeaningfullyBetter) {
      return recommendation({
        action: 'no_swap',
        confidence: 'low',
        reason:
          'Active pack is below force-swap reserve, but the spare pack is not meaningfully higher. Hold current pack, reduce speed, and reassess at the next stop.',
        activePackId,
        sparePackId,
        activeSocPercent,
        spareSocPercent,
        projectedEndSegmentSocPercent,
        projectedNextStopSocPercent,
        projectedEndDaySocPercent,
      })
    }

    return recommendation({
      action: 'swap_now',
      confidence: combineConfidence(baseConfidence, spareWeak ? 'low' : 'high'),
      reason:
        'Swap now. Active pack is below force-swap reserve and the spare pack is meaningfully higher.',
      activePackId,
      sparePackId,
      activeSocPercent,
      spareSocPercent,
      projectedEndSegmentSocPercent,
      projectedNextStopSocPercent,
      projectedEndDaySocPercent,
    })
  }

  if (bothPacksInPlanningBand) {
    return recommendation({
      action: 'plan_swap',
      confidence: 'low',
      reason:
        'Both packs are low. Plan a judged swap only if race operations require it; do not blind swap to a weak spare. Reduce speed and prioritize charging.',
      activePackId,
      sparePackId,
      activeSocPercent,
      spareSocPercent,
      projectedEndSegmentSocPercent,
      projectedNextStopSocPercent,
      projectedEndDaySocPercent,
    })
  }

  if (projectedCritical) {
    return recommendation({
      action: spareMeaningfullyBetter ? 'swap_now' : 'plan_swap',
      confidence: combineConfidence(baseConfidence, spareMeaningfullyBetter ? 'medium' : 'low'),
      reason: spareMeaningfullyBetter
        ? 'Swap now. Active pack is projected below force-swap reserve before the next safe opportunity.'
        : 'Active pack projection is critical, but the spare is not meaningfully stronger. Plan a judged swap and reduce speed.',
      activePackId,
      sparePackId,
      activeSocPercent,
      spareSocPercent,
      projectedEndSegmentSocPercent,
      projectedNextStopSocPercent,
      projectedEndDaySocPercent,
    })
  }

  if (
    activeSocPercent < planSwapSocPercent ||
    projectedPlanning
  ) {
    if (!spareMeaningfullyBetter) {
      return recommendation({
        action: 'no_swap',
        confidence: combineConfidence(baseConfidence, 'low'),
        reason:
          'Active pack is in the planning band, but the spare pack is not meaningfully better. Avoid an unnecessary swap and conserve energy.',
        activePackId,
        sparePackId,
        activeSocPercent,
        spareSocPercent,
        projectedEndSegmentSocPercent,
        projectedNextStopSocPercent,
        projectedEndDaySocPercent,
      })
    }

    return recommendation({
      action: 'plan_swap',
      confidence: baseConfidence,
      reason:
        'Plan swap at next stop. Active pack is projected below 30% before the next segment.',
      activePackId,
      sparePackId,
      activeSocPercent,
      spareSocPercent,
      projectedEndSegmentSocPercent,
      projectedNextStopSocPercent,
      projectedEndDaySocPercent,
    })
  }

  return recommendation({
    action: 'no_swap',
    confidence: baseConfidence,
    reason:
      prediction.confidence === 'low'
        ? 'No deterministic swap trigger yet, but prediction confidence is low. Verify telemetry before committing.'
        : 'No swap needed. Active pack projected to reach next stop above reserve.',
    activePackId,
    sparePackId,
    activeSocPercent,
    spareSocPercent,
    projectedEndSegmentSocPercent,
    projectedNextStopSocPercent,
    projectedEndDaySocPercent,
  })
}

function createPackState({
  id,
  role,
  socPercent,
  now,
  batteryCapacityWh,
}: {
  id: BatteryPackId
  role: BatteryPackState['role']
  socPercent: number
  now: number
  batteryCapacityWh: number
}): BatteryPackState {
  const safeSoc = clamp(socPercent, 0, 100)

  return {
    id,
    role,
    socPercent: safeSoc,
    energyWh: socToEnergy(safeSoc, batteryCapacityWh),
    lastUpdatedAt: now,
    isCharging: role === 'spare',
  }
}

function recommendation(input: SwapRecommendation): SwapRecommendation {
  return input
}

function normalizeRaceBatteryState(
  state: RaceBatteryState,
  batteryCapacityWh = rx2Config.mainBatteryUsableWh,
  now = Date.now()
): RaceBatteryState {
  const warnings = [...(state.warnings ?? [])]
  const requestedActivePackId = isPackId(state.activePackId)
    ? state.activePackId
    : 'A'
  const activeRolePackIds = (['A', 'B'] as BatteryPackId[]).filter(
    (packId) => state.packs?.[packId]?.role === 'active'
  )
  const activePackId =
    state.packs?.[requestedActivePackId] !== undefined
      ? requestedActivePackId
      : activeRolePackIds[0] ?? 'A'
  const sparePackId = otherPackId(activePackId)

  if (!isPackId(state.activePackId)) {
    warnings.push('Battery state active pack id was invalid and was reset to Pack A.')
  }
  if (!state.packs?.[activePackId] || !state.packs?.[sparePackId]) {
    warnings.push('Battery state was missing one or more packs and was rebuilt safely.')
  }
  if (activeRolePackIds.length !== 1 || activeRolePackIds[0] !== activePackId) {
    warnings.push('Battery pack roles were inconsistent and were recovered from activePackId.')
  }

  const activePack = sanitizePack({
    pack: state.packs?.[activePackId],
    id: activePackId,
    role: 'active',
    batteryCapacityWh,
    now,
    warnings,
  })
  const sparePack = sanitizePack({
    pack: state.packs?.[sparePackId],
    id: sparePackId,
    role: 'spare',
    batteryCapacityWh,
    now,
    warnings,
  })

  return {
    activePackId,
    packs: {
      [activePackId]: activePack,
      [sparePackId]: sparePack,
    } as Record<BatteryPackId, BatteryPackState>,
    warnings: dedupeWarnings(warnings),
  }
}

function sanitizePack({
  pack,
  id,
  role,
  batteryCapacityWh,
  now,
  warnings,
}: {
  pack?: BatteryPackState
  id: BatteryPackId
  role: BatteryPackState['role']
  batteryCapacityWh: number
  now: number
  warnings: string[]
}): BatteryPackState {
  if (!pack) {
    warnings.push(`Pack ${id} was missing and was restored at 100% SOC.`)
    return createPackState({
      id,
      role,
      socPercent: 100,
      now,
      batteryCapacityWh,
    })
  }

  if (!Number.isFinite(pack.socPercent) || pack.socPercent < 0 || pack.socPercent > 100) {
    warnings.push(`Pack ${id} SOC was outside 0-100% and was clamped.`)
  }
  if (!Number.isFinite(pack.energyWh) || pack.energyWh < 0 || pack.energyWh > batteryCapacityWh) {
    warnings.push(`Pack ${id} energy was outside usable capacity and was clamped.`)
  }

  const energyWh = clamp(pack.energyWh, 0, batteryCapacityWh)
  const socPercent = Number.isFinite(pack.energyWh)
    ? energyToSoc(energyWh, batteryCapacityWh)
    : clamp(pack.socPercent, 0, 100)

  return {
    ...pack,
    id,
    role,
    socPercent,
    energyWh,
    lastUpdatedAt: Number.isFinite(pack.lastUpdatedAt)
      ? pack.lastUpdatedAt
      : now,
    isCharging: role === 'spare' && Boolean(pack.isCharging),
  }
}

function isPackId(value: unknown): value is BatteryPackId {
  return value === 'A' || value === 'B'
}

function otherPackId(packId: BatteryPackId): BatteryPackId {
  return packId === 'A' ? 'B' : 'A'
}

function combineConfidence(
  left: PredictionConfidence,
  right: PredictionConfidence
): PredictionConfidence {
  if (left === 'low' || right === 'low') return 'low'
  if (left === 'medium' || right === 'medium') return 'medium'

  return 'high'
}

function below(value: number | undefined, threshold: number) {
  return value !== undefined && Number.isFinite(value) && value < threshold
}

function socToEnergy(socPercent: number, batteryCapacityWh: number) {
  return (clamp(socPercent, 0, 100) / 100) * batteryCapacityWh
}

function energyToSoc(energyWh: number, batteryCapacityWh: number) {
  if (batteryCapacityWh <= 0) return 0

  return clamp((energyWh / batteryCapacityWh) * 100, 0, 100)
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min

  return Math.min(max, Math.max(min, value))
}

function dedupeWarnings(warnings: string[]) {
  return [...new Set(warnings)]
}
