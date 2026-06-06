import { rx2Config } from '@/lib/race/rx2Config'

export const minRealisticWhPerMile = 40
export const maxRealisticWhPerMile = 400

export type SafeWhPerMileResult = {
  value: number
  rawValue?: number
  fallbackUsed: boolean
  reason?: string
}

export function getRawTelemetryWhPerMile(input?: {
  efficiencyWhPerMile?: number
  whPerMile?: number
} | null) {
  return input?.efficiencyWhPerMile ?? input?.whPerMile
}

export function getSafeWhPerMile(
  rawValue: number | undefined,
  fallback = rx2Config.defaultRaceWhPerMile
): SafeWhPerMileResult {
  const safeFallback = isUsableWhPerMile(fallback)
    ? clampWhPerMile(fallback)
    : rx2Config.defaultRaceWhPerMile

  if (!isUsableWhPerMile(rawValue)) {
    return {
      value: safeFallback,
      rawValue,
      fallbackUsed: true,
      reason: rawValue === undefined ? 'missing' : 'below realistic floor',
    }
  }

  const usableRawValue = rawValue as number
  const value = clampWhPerMile(usableRawValue)

  return {
    value,
    rawValue,
    fallbackUsed: value !== usableRawValue,
    reason: value !== usableRawValue ? 'above sanity cap' : undefined,
  }
}

export function isUsableWhPerMile(value: number | undefined) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minRealisticWhPerMile
  )
}

export function clampWhPerMile(value: number) {
  if (!Number.isFinite(value)) return rx2Config.defaultRaceWhPerMile

  return Math.min(maxRealisticWhPerMile, Math.max(minRealisticWhPerMile, value))
}
