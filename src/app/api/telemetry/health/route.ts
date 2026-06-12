import { NextResponse } from 'next/server'
import {
  loadTelemetryNodeStatuses,
  logTelemetryApiError,
  telemetryErrorJson,
} from '@/lib/redisTelemetry'
import { summarizeVehicleTelemetryStatus } from '@/lib/vehicleTelemetryStatus'

export async function GET() {
  try {
    const nodes = await loadTelemetryNodeStatuses()
    const latestVehicle = nodes.find((node) => node.node === 'vehicle')
    const vehicleStatus = summarizeVehicleTelemetryStatus({
      packetAgeSeconds: latestVehicle?.ageSeconds,
    })

    return NextResponse.json({
      ok: true,
      cloudBackendStatus: 'connected',
      healthEndpointStatus: 'healthy',
      redis: 'connected',
      latestVehiclePacketAgeSeconds: latestVehicle?.ageSeconds ?? null,
      latestVehiclePacketAgeMs: vehicleStatus.packetAgeMs,
      latestVehicleUpdatedAt: latestVehicle?.updated_at ?? null,
      latestVehicleNode: latestVehicle?.node ?? null,
      vehicleNodeStatus: vehicleStatus.vehicleNodeStatus,
      vehicleTelemetryFresh: vehicleStatus.telemetryFresh,
      lastRedisReadAt: new Date().toISOString(),
      nodes,
    })
  } catch (error) {
    logTelemetryApiError('/api/telemetry/health', error)

    return NextResponse.json(
      {
        ok: false,
        cloudBackendStatus: 'error',
        healthEndpointStatus: 'error',
        redis:
          telemetryErrorJson(error, 'Upstash Redis health check failed.').code ===
          'UPSTASH_REDIS_NOT_CONFIGURED'
            ? 'not_configured'
            : 'error',
        latestVehiclePacketAgeSeconds: null,
        latestVehiclePacketAgeMs: null,
        latestVehicleUpdatedAt: null,
        latestVehicleNode: null,
        vehicleNodeStatus: 'offline',
        vehicleTelemetryFresh: false,
        lastRedisReadAt: null,
        nodes: [],
        ...telemetryErrorJson(error, 'Upstash Redis health check failed.'),
      },
      { status: 500 }
    )
  }
}
