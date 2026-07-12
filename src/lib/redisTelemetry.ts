import 'server-only'

import { Redis } from '@upstash/redis'
import {
  telemetryNodeOptions,
  type TelemetryNodeId,
} from '@/types/telemetry'

const maxTelemetryHistoryPackets = 1000
const telemetryHistoryWriteIntervalMs = 60_000
const telemetryHistoryThrottleTtlSeconds = 60
const lastHistoryWriteByNode = new Map<TelemetryNodeId, number>()

export type TelemetryLatestRow = {
  id: TelemetryNodeId
  node: TelemetryNodeId
  payload: unknown
  updated_at: string
}

export type TelemetryNodeStatus = {
  node: TelemetryNodeId
  updated_at: string | null
  ageSeconds: number | null
}

export const defaultTelemetryNode: TelemetryNodeId = 'vehicle'

export class RedisTelemetryConfigError extends Error {
  constructor() {
    super(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured.'
    )
    this.name = 'RedisTelemetryConfigError'
  }
}

export function createRedisTelemetryClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()

  if (!url || !token) {
    throw new RedisTelemetryConfigError()
  }

  return new Redis({
    url,
    token,
  })
}

export async function storeTelemetryPacket({
  node,
  payload,
  updatedAt,
}: {
  node: TelemetryNodeId
  payload: unknown
  updatedAt?: string
}) {
  const redis = createRedisTelemetryClient()
  const latestRow: TelemetryLatestRow = {
    id: node,
    node,
    payload,
    updated_at: updatedAt ?? new Date().toISOString(),
  }

  await redis.set(latestKey(node), latestRow)

  if (shouldAttemptHistoryWrite(node, latestRow.updated_at)) {
    const throttleStored = await redis.set(
      historyThrottleKey(node),
      latestRow.updated_at,
      {
        ex: telemetryHistoryThrottleTtlSeconds,
        nx: true,
      }
    )

    lastHistoryWriteByNode.set(node, Date.parse(latestRow.updated_at))

    if (throttleStored) {
      await redis.lpush(historyKey(node), latestRow)
      await redis.ltrim(historyKey(node), 0, maxTelemetryHistoryPackets - 1)
    }
  }

  return latestRow
}

export async function loadLatestTelemetry(node: TelemetryNodeId) {
  const redis = createRedisTelemetryClient()

  return redis.get<TelemetryLatestRow>(latestKey(node))
}

export async function loadTelemetryNodeStatuses() {
  const redis = createRedisTelemetryClient()
  const nodes = [...telemetryNodeOptions]
  const latestPackets = await Promise.all(
    nodes.map((node) => redis.get<TelemetryLatestRow>(latestKey(node)))
  )

  return nodes.map((node, index): TelemetryNodeStatus => {
    const updatedAt = latestPackets[index]?.updated_at ?? null

    return {
      node,
      updated_at: updatedAt,
      ageSeconds: updatedAt
        ? Math.max(0, Math.round((Date.now() - Date.parse(updatedAt)) / 1000))
        : null,
    }
  })
}

export async function verifyTelemetryPacketStored(node: TelemetryNodeId) {
  return Boolean(await loadLatestTelemetry(node))
}

export function normalizeTelemetryNode(value: unknown): TelemetryNodeId {
  if (typeof value !== 'string') return defaultTelemetryNode

  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : defaultTelemetryNode
}

export function logTelemetryApiError(
  route: string,
  error: unknown,
  details: Record<string, unknown> = {}
) {
  console.error('[telemetry-api]', {
    route,
    storage: 'upstash-redis',
    ...details,
    errorName: error instanceof Error ? error.name : undefined,
    errorMessage:
      error instanceof Error ? error.message : 'Unknown telemetry API error.',
  })
}

export function telemetryErrorJson(error: unknown, fallback: string) {
  if (error instanceof RedisTelemetryConfigError) {
    return {
      error: error.message,
      code: 'UPSTASH_REDIS_NOT_CONFIGURED',
    }
  }

  return {
    error: error instanceof Error ? error.message : fallback,
    code: 'UPSTASH_REDIS_REQUEST_FAILED',
  }
}

export function latestKey(node: TelemetryNodeId) {
  return `latest:${node}`
}

export function historyKey(node: TelemetryNodeId) {
  return `history:${node}`
}

export function historyThrottleKey(node: TelemetryNodeId) {
  return `history:last-write:${node}`
}

function shouldAttemptHistoryWrite(node: TelemetryNodeId, updatedAt: string) {
  const updatedAtMs = Date.parse(updatedAt)
  const lastHistoryWriteAt = lastHistoryWriteByNode.get(node)

  if (!Number.isFinite(updatedAtMs)) return true
  if (lastHistoryWriteAt === undefined) return true

  return updatedAtMs - lastHistoryWriteAt >= telemetryHistoryWriteIntervalMs
}
