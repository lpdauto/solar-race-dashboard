import type {
  TelemetryConnectionStatus,
  VehicleNodeStatus,
} from '@/types/telemetry'

export const vehicleOnlineThresholdMs = 10_000
export const vehicleOfflineThresholdMs = 60_000

export type VehicleTelemetryStatusSummary = {
  vehicleNodeStatus: VehicleNodeStatus
  telemetryFresh: boolean
  packetAgeMs: number | null
  packetAgeSeconds: number | null
  packetRateHz: number
  telemetryStatus: TelemetryConnectionStatus
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
}

export function classifyVehicleNodeStatusFromAgeMs(
  packetAgeMs: number | null | undefined
): VehicleNodeStatus {
  if (packetAgeMs === null || packetAgeMs === undefined) return 'offline'

  const safeAgeMs = Math.max(0, packetAgeMs)

  if (safeAgeMs < vehicleOnlineThresholdMs) return 'online'
  if (safeAgeMs < vehicleOfflineThresholdMs) return 'stale'

  return 'offline'
}

export function summarizeVehicleTelemetryStatus({
  packetAgeSeconds,
  packetRateHz,
}: {
  packetAgeSeconds: number | null | undefined
  packetRateHz?: number | null
}): VehicleTelemetryStatusSummary {
  const packetAgeMs =
    packetAgeSeconds === null || packetAgeSeconds === undefined
      ? null
      : Math.max(0, packetAgeSeconds * 1000)
  const vehicleNodeStatus = classifyVehicleNodeStatusFromAgeMs(packetAgeMs)
  const telemetryFresh = vehicleNodeStatus === 'online'

  return {
    vehicleNodeStatus,
    telemetryFresh,
    packetAgeMs,
    packetAgeSeconds:
      packetAgeMs === null ? null : Math.round(packetAgeMs / 1000),
    packetRateHz:
      vehicleNodeStatus === 'offline'
        ? 0
        : typeof packetRateHz === 'number' && Number.isFinite(packetRateHz)
          ? Math.max(0, packetRateHz)
          : 0,
    telemetryStatus:
      vehicleNodeStatus === 'online'
        ? 'connected'
        : vehicleNodeStatus === 'stale'
          ? 'warning'
          : 'disconnected',
    connectionStatus:
      vehicleNodeStatus === 'online' ? 'connected' : 'disconnected',
  }
}

export function vehicleNodeStatusLabel(status: VehicleNodeStatus) {
  if (status === 'online') return 'Vehicle Node Online'
  if (status === 'stale') return 'Vehicle Node Stale'

  return 'Vehicle Node Offline'
}
