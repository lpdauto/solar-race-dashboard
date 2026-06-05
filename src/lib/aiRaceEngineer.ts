import type { RaceSnapshot } from '@/lib/raceSnapshots'
import type { SwapRecommendation } from '@/lib/batterySwapAdvisor'
import type { PredictiveStrategyResult } from '@/lib/strategyEngine'
import type { TelemetryData } from '@/types/telemetry'

export type AppProfile = 'owner' | 'team'

export type AiRaceEngineerInput = {
  appProfile: AppProfile
  currentDay: number
  currentMile: number
  telemetry: TelemetryData | null
  strategy: PredictiveStrategyResult
  swapAdvice: SwapRecommendation
  recentSnapshots?: RaceSnapshot[]
}

export type AiRaceEngineerResponse = {
  available: boolean
  summary: string
  recommendation: string
  cautions: string[]
  source: 'offline-template' | 'online-ai'
  aiAllowed: boolean
  errorMessage?: string
  rateLimited?: boolean
  remainingMinuteRequests?: number
  remainingDailyRequests?: number
}

export function isAiEnabledForProfile(profile: AppProfile) {
  return profile === 'owner'
}

export function generateOfflineRaceEngineerSummary(
  input: AiRaceEngineerInput
): AiRaceEngineerResponse {
  const aiAllowed = isAiEnabledForProfile(input.appProfile)
  const cautions = buildCautions(input)
  const projectedFinishSoc = input.strategy.projectedFinishSoc.toFixed(0)

  return {
    available: true,
    summary: `Day ${input.currentDay}, mile ${input.currentMile.toFixed(1)}: ${input.strategy.raceMode} mode with projected finish SOC at ${projectedFinishSoc}%. Battery swap advisor says ${input.swapAdvice.action}.`,
    recommendation: input.strategy.driverAction,
    cautions,
    source: 'offline-template',
    aiAllowed,
  }
}

export async function requestOnlineRaceEngineerSummary(
  input: AiRaceEngineerInput
): Promise<AiRaceEngineerResponse> {
  if (!isAiEnabledForProfile(input.appProfile)) {
    return {
      ...generateOfflineRaceEngineerSummary(input),
      aiAllowed: false,
    }
  }

  try {
    const response = await fetch('/api/race-engineer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        error?: string
        remainingMinuteRequests?: number
        remainingDailyRequests?: number
      } | null

      return {
        ...generateOfflineRaceEngineerSummary(input),
        errorMessage:
          errorBody?.error ?? 'AI Race Engineer request failed. Offline insight shown.',
        rateLimited: response.status === 429,
        remainingMinuteRequests: errorBody?.remainingMinuteRequests,
        remainingDailyRequests: errorBody?.remainingDailyRequests,
      }
    }

    return (await response.json()) as AiRaceEngineerResponse
  } catch {
    return {
      ...generateOfflineRaceEngineerSummary(input),
      errorMessage: 'AI Race Engineer request failed. Offline insight shown.',
    }
  }
}

function buildCautions(input: AiRaceEngineerInput) {
  const cautions: string[] = []
  const controllerTempC = input.telemetry?.controllerTempC ?? 0
  const motorTempC = input.telemetry?.motorTempC ?? 0
  const latestSnapshot = input.recentSnapshots?.at(-1)

  if (controllerTempC > 85) {
    cautions.push('Controller temperature is critical; reduce throttle demand.')
  } else if (controllerTempC > 75) {
    cautions.push('Controller temperature is elevated; watch the trend.')
  }

  if (motorTempC > 95) {
    cautions.push('Motor temperature is critical; ease load immediately.')
  } else if (motorTempC > 85) {
    cautions.push('Motor temperature is elevated; avoid hard acceleration.')
  }

  if (!input.telemetry) {
    cautions.push('Telemetry is disconnected; using model-only strategy output.')
  } else if (Date.now() - input.telemetry.timestamp > 15_000) {
    cautions.push('Telemetry is stale; confirm the latest car data before acting.')
  }

  if ((latestSnapshot?.warningsCount ?? 0) > 0) {
    cautions.push(`${latestSnapshot?.warningsCount} recent telemetry warning(s) are active.`)
  }

  if (input.swapAdvice.urgency === 'HIGH' || input.swapAdvice.urgency === 'CRITICAL') {
    cautions.push(`Battery swap urgency is ${input.swapAdvice.urgency}.`)
  }

  return cautions.length > 0 ? cautions : ['No major offline cautions detected.']
}
