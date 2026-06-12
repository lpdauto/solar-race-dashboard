import {
  buildVehicleDisplayData,
  type VehicleDisplayData,
} from '@/lib/vehicleDisplay'

export type TftDriverDisplayData = {
  soc: number | null
  whPerMile: number | null
  checkpointDistanceMiles: number | null
  arrival: string
  status: string
  targetSpeedMph: number
  batterySocPercent?: number | null
  recommendedSpeedMph?: number
  currentWhPerMile?: number | null
  distanceToNextEventMiles?: number | null
  eta?: string
  command?: string
}

export function buildTftDriverDisplayData(payload: unknown): TftDriverDisplayData {
  const displayData = buildVehicleDisplayData(payload)

  return compactTftDriverDisplayData(displayData)
}

export function compactTftDriverDisplayData({
  soc,
  whPerMile,
  checkpointDistanceMiles,
  arrival,
  status,
  targetSpeedMph,
}: VehicleDisplayData): TftDriverDisplayData {
  return {
    soc,
    whPerMile,
    checkpointDistanceMiles,
    arrival,
    status: driverSafeStatus(status),
    targetSpeedMph,
    batterySocPercent: soc,
    recommendedSpeedMph: targetSpeedMph,
    currentWhPerMile: whPerMile,
    distanceToNextEventMiles: checkpointDistanceMiles,
    eta: arrival,
    command: driverSafeStatus(status),
  }
}

function driverSafeStatus(status: string) {
  const normalized = status.trim().toUpperCase()

  if (normalized === 'EXCELLENT' || normalized === 'ON TARGET') {
    return 'HOLD PACE'
  }
  if (normalized === 'WATCH EFF') return 'CONSERVE'
  if (normalized === 'SLOW DOWN') return 'SLOW DOWN'
  if (normalized === 'SWAP SOON') return 'SWAP SOON'
  if (normalized === 'SWAP NOW') return 'SWAP NOW'
  if (normalized === 'PUSH OK') return 'PUSH OK'

  return 'DATA STALE'
}
