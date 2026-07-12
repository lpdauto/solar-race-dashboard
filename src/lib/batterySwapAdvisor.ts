import type { RaceDay } from '@/data/raceRoute'
import { rx2Config } from '@/lib/race/rx2Config'

// Legacy Compatibility: retained for the historical predictive strategy/debug path.
// Visible Race Captain and Strategy decisions use raceBatteryStrategy.ts.

export type BatteryState = {
  id: 'A' | 'B'
  socPercent: number
  usableWh: number
  location: 'car' | 'trailer'
  chargingWatts?: number
}

export type SwapAdvisorInput = {
  inCarBattery: BatteryState
  spareBattery: BatteryState
  currentDay: RaceDay
  currentMile: number
  distanceToNextStop: number
  estimatedWhToNextStop: number
  estimatedWhToNextOperationalOpportunity: number
  estimatedWhToFinishDay: number
  nextOperationalOpportunityType: string
  nextOperationalOpportunityMile: number
  reserveSocPercent: number
  expectedSwapMinutes: number
}

export type SwapRecommendation = {
  action: 'CONTINUE' | 'DELAY_SWAP' | 'SWAP_AT_NEXT_STOP' | 'SWAP_NOW'
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  reason: string
  projectedSocIfContinue: number
  projectedSocAfterSwap: number
  recommendedSwapMile?: number
  debug: SwapAdvisorDebug
}

export type SwapAdvisorDebug = {
  swapAdvisorInputSoc: number
  swapAdvisorInputSpareSoc: number
  estimatedWhToNextStop: number
  estimatedWhToNextOperationalOpportunity: number
  estimatedWhToFinishDay: number
  batteryCapacityWh: number
  projectedContinueSocRaw: number
  projectedSwapSocRaw: number
  projectedSocToNextStopRaw: number
  projectedFinishDaySocRaw: number
  projectedSocAtNextOpportunity: number
  projectedSocAtFinishDayInformational: number
  nextOperationalOpportunityType: string
  nextOperationalOpportunityMile: number
}

const meaningfulSocAdvantagePercent = 5

// Offline deterministic advisor. No AI, network calls, or nondeterministic inputs.
export function adviseBatterySwap({
  inCarBattery,
  spareBattery,
  currentDay,
  currentMile,
  distanceToNextStop,
  estimatedWhToNextStop,
  estimatedWhToNextOperationalOpportunity,
  estimatedWhToFinishDay,
  nextOperationalOpportunityType,
  nextOperationalOpportunityMile,
  reserveSocPercent = rx2Config.reserveSocPercent,
  expectedSwapMinutes: _expectedSwapMinutes,
}: SwapAdvisorInput): SwapRecommendation {
  const usableWh = positiveWh(inCarBattery.usableWh, rx2Config.mainBatteryUsableWh)
  const spareUsableWh = positiveWh(spareBattery.usableWh, rx2Config.mainBatteryUsableWh)
  const inCarSoc = clampSoc(inCarBattery.socPercent)
  const spareSoc = clampSoc(spareBattery.socPercent)
  const projectedSocToNextStopRaw = projectSocAfterUseRaw({
    socPercent: inCarSoc,
    usableWh,
    expectedWh: estimatedWhToNextOperationalOpportunity,
  })
  const projectedContinueSocRaw = projectSocAfterUseRaw({
    socPercent: inCarSoc,
    usableWh,
    expectedWh: estimatedWhToNextOperationalOpportunity,
  })
  const projectedSwapSocRaw = projectSocAfterUseRaw({
    socPercent: spareSoc,
    usableWh: spareUsableWh,
    expectedWh: estimatedWhToNextOperationalOpportunity,
  })
  const projectedFinishDaySocRaw = projectSocAfterUseRaw({
    socPercent: inCarSoc,
    usableWh,
    expectedWh: estimatedWhToFinishDay,
  })
  const projectedSocToNextStop = clampSoc(projectedSocToNextStopRaw)
  const projectedSocIfContinue = clampSoc(projectedContinueSocRaw)
  const projectedSocAfterSwap = clampSoc(projectedSwapSocRaw)
  const recommendedSwapMile = Math.min(
    currentDay.distanceMiles,
    Math.max(currentMile, currentMile + Math.max(0, distanceToNextStop))
  )
  const debug = {
    swapAdvisorInputSoc: inCarSoc,
    swapAdvisorInputSpareSoc: spareSoc,
    estimatedWhToNextStop,
    estimatedWhToNextOperationalOpportunity,
    estimatedWhToFinishDay,
    batteryCapacityWh: usableWh,
    projectedContinueSocRaw,
    projectedSwapSocRaw,
    projectedSocToNextStopRaw,
    projectedFinishDaySocRaw,
    projectedSocAtNextOpportunity: projectedSocIfContinue,
    projectedSocAtFinishDayInformational: clampSoc(projectedFinishDaySocRaw),
    nextOperationalOpportunityType,
    nextOperationalOpportunityMile,
  }

  if (!hasMeaningfulSpareAdvantage(inCarSoc, spareSoc)) {
    return {
      action: 'DELAY_SWAP',
      urgency: projectedSocIfContinue < reserveSocPercent ? 'HIGH' : 'MEDIUM',
      reason: 'Spare battery is not meaningfully better than the in-car battery.',
      projectedSocIfContinue,
      projectedSocAfterSwap,
      debug,
    }
  }

  if (projectedSocIfContinue < reserveSocPercent) {
    return {
      action: 'SWAP_NOW',
      urgency: 'CRITICAL',
      reason: `In-car battery is projected below reserve before the next operational opportunity at mile ${nextOperationalOpportunityMile.toFixed(1)}.`,
      projectedSocIfContinue,
      projectedSocAfterSwap,
      recommendedSwapMile: currentMile,
      debug,
    }
  }

  if (projectedFinishDaySocRaw < reserveSocPercent) {
    return {
      action: 'CONTINUE',
      urgency: 'MEDIUM',
      reason: 'Current pack can reach the next operational opportunity; full-day one-pack projection is below reserve and should be handled with swaps, charging, or trailering later.',
      projectedSocIfContinue,
      projectedSocAfterSwap,
      recommendedSwapMile,
      debug,
    }
  }

  return {
    action: 'CONTINUE',
    urgency: 'LOW',
    reason: 'In-car battery is projected to reach the next operational opportunity above reserve.',
    projectedSocIfContinue,
    projectedSocAfterSwap,
    debug,
  }
}

function projectSocAfterUseRaw({
  socPercent,
  usableWh,
  expectedWh,
}: {
  socPercent: number
  usableWh: number
  expectedWh: number
}) {
  const socUsed = usableWh > 0 ? (Math.max(0, expectedWh) / usableWh) * 100 : 100

  return socPercent - socUsed
}

function hasMeaningfulSpareAdvantage(inCarSoc: number, spareSoc: number) {
  return spareSoc - inCarSoc >= meaningfulSocAdvantagePercent
}

function positiveWh(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function clampSoc(value: number) {
  if (!Number.isFinite(value)) return 0

  return Math.min(100, Math.max(0, value))
}
