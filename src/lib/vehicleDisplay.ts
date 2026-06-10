export type VehicleDisplayData = {
  soc: number | null
  whPerMile: number | null
  checkpointDistanceMiles: number | null
  arrival: string
  status: string
  targetSpeedMph: number
}

const defaultTargetSpeedMph = 30

export function buildVehicleDisplayData(payload: unknown): VehicleDisplayData {
  const packet = isJsonObject(payload) ? payload : {}
  const speedMph = finiteNumber(packet.speedMph)
  const packPowerWatts =
    finiteNumber(packet.packPowerWatts) ??
    finiteNumber(packet.batteryPowerWatts)
  const soc =
    finiteNumber(packet.packSoc) ??
    finiteNumber(packet.soc) ??
    finiteNumber(packet.batterySocPercent)
  const whPerMile =
    speedMph !== undefined &&
    speedMph > 1 &&
    packPowerWatts !== undefined &&
    packPowerWatts > 0
      ? packPowerWatts / speedMph
      : null

  return {
    soc: soc === undefined ? null : Math.round(clamp(soc, 0, 100)),
    whPerMile: whPerMile === null ? null : Math.round(whPerMile),
    checkpointDistanceMiles: null,
    arrival: '--:--',
    status: classifyDriverStatus({ speedMph, packPowerWatts, whPerMile }),
    targetSpeedMph: defaultTargetSpeedMph,
  }
}

function classifyDriverStatus({
  speedMph,
  packPowerWatts,
  whPerMile,
}: {
  speedMph?: number
  packPowerWatts?: number
  whPerMile: number | null
}) {
  if (
    speedMph === undefined ||
    speedMph <= 1 ||
    packPowerWatts === undefined ||
    packPowerWatts <= 0 ||
    whPerMile === null
  ) {
    return 'WAITING DATA'
  }

  if (whPerMile < 130) return 'EXCELLENT'
  if (whPerMile < 170) return 'ON TARGET'
  if (whPerMile < 220) return 'WATCH EFF'
  return 'SLOW DOWN'
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
