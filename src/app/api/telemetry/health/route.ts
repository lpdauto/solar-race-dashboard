import { NextResponse } from 'next/server'
import {
  loadTelemetryNodeStatuses,
  logTelemetryApiError,
  telemetryErrorJson,
} from '@/lib/redisTelemetry'

export async function GET() {
  try {
    const nodes = await loadTelemetryNodeStatuses()
    const latestVehicle = nodes.find((node) => node.node === 'vehicle')

    return NextResponse.json({
      ok: true,
      redis: 'connected',
      latestVehiclePacketAgeSeconds: latestVehicle?.ageSeconds ?? null,
      latestVehicleUpdatedAt: latestVehicle?.updated_at ?? null,
      latestVehicleNode: latestVehicle?.node ?? null,
      nodes,
    })
  } catch (error) {
    logTelemetryApiError('/api/telemetry/health', error)

    return NextResponse.json(
      {
        ok: false,
        redis:
          telemetryErrorJson(error, 'Upstash Redis health check failed.').code ===
          'UPSTASH_REDIS_NOT_CONFIGURED'
            ? 'not_configured'
            : 'error',
        latestVehiclePacketAgeSeconds: null,
        latestVehicleUpdatedAt: null,
        latestVehicleNode: null,
        nodes: [],
        ...telemetryErrorJson(error, 'Upstash Redis health check failed.'),
      },
      { status: 500 }
    )
  }
}
