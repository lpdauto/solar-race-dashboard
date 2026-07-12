import { NextResponse } from 'next/server'
import {
  defaultTelemetryNode,
  loadLatestTelemetry,
  loadTelemetryNodeStatuses,
  logTelemetryApiError,
  type TelemetryLatestRow,
  type TelemetryNodeStatus,
  telemetryErrorJson,
} from '@/lib/redisTelemetry'
import { summarizeVehicleTelemetryStatus } from '@/lib/vehicleTelemetryStatus'

export async function GET() {
  try {
    const [nodes, latestVehicleRow] = await Promise.all([
      loadTelemetryNodeStatuses(),
      loadLatestTelemetry(defaultTelemetryNode),
    ])
    const latestVehicle = nodes.find((node) => node.node === 'vehicle')
    const latestVehicleUpdatedAt = getVehicleHeartbeatUpdatedAt(
      latestVehicleRow,
      latestVehicle?.updated_at ?? null
    )
    const latestVehiclePacketAgeSeconds = getVehiclePacketAgeSeconds({
      updatedAt: latestVehicleUpdatedAt,
      fallbackAgeSeconds: latestVehicleRow ? null : latestVehicle?.ageSeconds,
    })
    const vehicleStatus = summarizeVehicleTelemetryStatus({
      packetAgeSeconds: latestVehiclePacketAgeSeconds,
    })
    const normalizedNodes = normalizeVehicleNodeStatus({
      nodes,
      updatedAt: latestVehicleUpdatedAt,
      ageSeconds: latestVehiclePacketAgeSeconds,
    })

    return noStoreJson({
      ok: true,
      cloudBackendStatus: 'connected',
      healthEndpointStatus: 'healthy',
      redis: 'connected',
      latestVehiclePacketAgeSeconds,
      latestVehiclePacketAgeMs: vehicleStatus.packetAgeMs,
      latestVehicleUpdatedAt,
      latestVehicleNode:
        latestVehicleUpdatedAt === null ? null : latestVehicle?.node ?? 'vehicle',
      vehicleNodeStatus: vehicleStatus.vehicleNodeStatus,
      vehicleTelemetryFresh: vehicleStatus.telemetryFresh,
      lastRedisReadAt: new Date().toISOString(),
      nodes: normalizedNodes,
    })
  } catch (error) {
    logTelemetryApiError('/api/telemetry/health', error)

    return noStoreJson(
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

function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function getVehicleHeartbeatUpdatedAt(
  latestVehicleRow: TelemetryLatestRow | null,
  fallbackUpdatedAt: string | null
) {
  if (!latestVehicleRow) return validTimestampString(fallbackUpdatedAt)

  const payload = objectValue(latestVehicleRow.payload)
  const vehicleUpdatedAt = validTimestampString(payload.vehicleUpdatedAt)

  if (vehicleUpdatedAt) return vehicleUpdatedAt

  if (isAndroidGpsRefresh(latestVehicleRow, payload)) return null

  return validTimestampString(latestVehicleRow.updated_at)
}

function getVehiclePacketAgeSeconds({
  updatedAt,
  fallbackAgeSeconds,
}: {
  updatedAt: string | null
  fallbackAgeSeconds?: number | null
}) {
  if (updatedAt === null) return null

  if (
    typeof fallbackAgeSeconds === 'number' &&
    Number.isFinite(fallbackAgeSeconds)
  ) {
    return fallbackAgeSeconds
  }

  return Math.max(0, Math.round((Date.now() - Date.parse(updatedAt)) / 1000))
}

function normalizeVehicleNodeStatus({
  nodes,
  updatedAt,
  ageSeconds,
}: {
  nodes: TelemetryNodeStatus[]
  updatedAt: string | null
  ageSeconds: number | null
}) {
  let foundVehicle = false
  const normalizedNodes = nodes.map((node) => {
    if (node.node !== 'vehicle') return node

    foundVehicle = true

    return {
      ...node,
      updated_at: updatedAt,
      ageSeconds,
    }
  })

  if (!foundVehicle) {
    normalizedNodes.unshift({
      node: 'vehicle',
      updated_at: updatedAt,
      ageSeconds,
    })
  }

  return normalizedNodes
}

function isAndroidGpsRefresh(
  latestVehicleRow: TelemetryLatestRow,
  payload: Record<string, unknown>
) {
  if (payload.gpsSource !== 'android-gps') return false

  const rowUpdatedAt = Date.parse(latestVehicleRow.updated_at)
  const gpsUpdatedAt = Date.parse(String(payload.gpsUpdatedAt ?? ''))

  return (
    Number.isFinite(rowUpdatedAt) &&
    Number.isFinite(gpsUpdatedAt) &&
    Math.abs(rowUpdatedAt - gpsUpdatedAt) < 5_000
  )
}

function validTimestampString(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null

  return Number.isFinite(Date.parse(value)) ? value : null
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
