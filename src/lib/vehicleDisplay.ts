export type VehicleDisplayData = {
  soc: number | null
  whPerMile: number | null
  checkpointDistanceMiles: number | null
  arrival: string
  status: string
  targetSpeedMph: number
  gpsSource: 'phone' | 'esp32' | 'none'
  gpsAgeMs: number | null
  gpsStatus: string
  gpsLat: number | null
  gpsLng: number | null
  gpsSpeedMph: number | null
  gpsHeading: number | null
  gpsElevationFt: number | null
  gpsAccuracy: number | null
  gpsProviderDeviceName: string | null
}

const defaultTargetSpeedMph = 35

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
  const checkpointDistanceMiles =
    finiteNumber(packet.checkpointDistanceMiles) ??
    finiteNumber(packet.distanceToNextEventMiles) ??
    finiteNumber(packet.nextStopMiles)
  const arrival = stringValue(packet.arrival) ?? stringValue(packet.eta)
  const directWhPerMile =
    finiteNumber(packet.whPerMile) ??
    finiteNumber(packet.efficiencyWhPerMile) ??
    finiteNumber(packet.predictedWhPerMile) ??
    finiteNumber(packet.currentWhPerMile)
  const targetSpeedMph =
    finiteNumber(packet.targetSpeedMph) ??
    finiteNumber(packet.recommendedSpeedMph) ??
    defaultTargetSpeedMph
  const whPerMile =
    directWhPerMile ??
    (speedMph !== undefined &&
    speedMph > 1 &&
    packPowerWatts !== undefined &&
    packPowerWatts > 0
      ? packPowerWatts / speedMph
      : null)

  return {
    soc: soc === undefined ? null : Math.round(clamp(soc, 0, 100)),
    whPerMile: whPerMile === null ? null : Math.round(whPerMile),
    checkpointDistanceMiles: checkpointDistanceMiles ?? null,
    arrival: arrival ?? '--:--',
    status:
      stringValue(packet.status) ??
      stringValue(packet.command) ??
      classifyDriverStatus({ speedMph, packPowerWatts, whPerMile }),
    targetSpeedMph: Math.round(targetSpeedMph),
    gpsSource: gpsSource(packet.gpsSource, packet),
    gpsAgeMs: finiteNumber(packet.gpsAgeMs) ?? null,
    gpsStatus: stringValue(packet.gpsStatus) ?? 'offline',
    gpsLat: finiteNumber(packet.gpsLat) ?? null,
    gpsLng: finiteNumber(packet.gpsLng) ?? null,
    gpsSpeedMph: finiteNumber(packet.gpsSpeedMph) ?? null,
    gpsHeading: finiteNumber(packet.gpsHeading) ?? null,
    gpsElevationFt: finiteNumber(packet.gpsElevationFt) ?? null,
    gpsAccuracy: finiteNumber(packet.gpsAccuracy) ?? null,
    gpsProviderDeviceName: stringValue(packet.gpsProviderDeviceName) ?? null,
  }
}

function gpsSource(
  value: unknown,
  packet: Record<string, unknown>
): VehicleDisplayData['gpsSource'] {
  if (value === 'phone' || value === 'esp32' || value === 'none') return value
  if (finiteNumber(packet.gpsLat) !== undefined && finiteNumber(packet.gpsLng) !== undefined) {
    return 'esp32'
  }

  return 'none'
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

  if (whPerMile < 30) return 'EXCELLENT'
  if (whPerMile < 45) return 'ON TARGET'
  if (whPerMile < 65) return 'WATCH EFF'
  return 'SLOW DOWN'
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
