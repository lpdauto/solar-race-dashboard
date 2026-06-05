import type { TelemetrySource } from '@/types/telemetry'

export type SafeSocResult = {
  value: number
  rawValue?: number
  fallbackUsed: boolean
  reason?: string
}

export function getSafeStrategySoc({
  rawValue,
  telemetrySource,
  fallbackSocPercent = 100,
}: {
  rawValue: number | undefined
  telemetrySource?: TelemetrySource
  fallbackSocPercent?: number
}): SafeSocResult {
  const fallback = clampSoc(fallbackSocPercent)

  if (rawValue === undefined || !Number.isFinite(rawValue)) {
    return {
      value: fallback,
      rawValue,
      fallbackUsed: true,
      reason: rawValue === undefined ? 'missing' : 'invalid',
    }
  }

  if (rawValue < 0 || rawValue > 100) {
    return {
      value: fallback,
      rawValue,
      fallbackUsed: true,
      reason: 'outside 0-100 range',
    }
  }

  // Preserve a true empty-pack report from live ESP32 telemetry. Simulator/manual
  // placeholder zeros are treated as missing so stopped sources do not create
  // false SWAP_NOW decisions before a real packet arrives.
  if (rawValue === 0 && telemetrySource !== 'esp32') {
    return {
      value: fallback,
      rawValue,
      fallbackUsed: true,
      reason: 'zero placeholder',
    }
  }

  return {
    value: clampSoc(rawValue),
    rawValue,
    fallbackUsed: false,
  }
}

function clampSoc(value: number) {
  if (!Number.isFinite(value)) return 100

  return Math.min(100, Math.max(0, value))
}
