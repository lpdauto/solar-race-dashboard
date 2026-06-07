'use client'

import { useEffect, useMemo, useState } from 'react'
import type {
  CloudTelemetryHealth,
  TelemetryFreshness,
  TelemetryNodeId,
} from '@/types/telemetry'

type CloudTelemetryStatusCardProps = {
  enabled: boolean
  node: TelemetryNodeId
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  lastPacketAt?: number
}

const freshnessStyles: Record<TelemetryFreshness, string> = {
  idle: 'border-slate-300/30 bg-slate-300/10 text-slate-100',
  healthy: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  warning: 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100',
  stale: 'border-red-400/30 bg-red-400/10 text-[#ff8fcb]',
}

export default function CloudTelemetryStatusCard({
  enabled,
  node,
  connectionStatus,
  lastPacketAt,
}: CloudTelemetryStatusCardProps) {
  const [health, setHealth] = useState<CloudTelemetryHealth | null>(null)
  const [healthError, setHealthError] = useState<string | undefined>()
  const selectedNodeHealth = useMemo(
    () => findSelectedNodeHealth(health, node),
    [health, node]
  )
  const fallbackPacketAgeSeconds = useMemo(
    () => getFallbackPacketAgeSeconds(lastPacketAt),
    [lastPacketAt]
  )
  const packetAgeSeconds =
    selectedNodeHealth?.ageSeconds ?? fallbackPacketAgeSeconds
  const lastPacketTimestamp =
    selectedNodeHealth?.updated_at ??
    (lastPacketAt ? new Date(lastPacketAt).toISOString() : null)
  const freshness = classifyFreshness(packetAgeSeconds)
  const redisStatus = health?.redis ?? (enabled ? 'checking' : 'idle')
  const displayedConnectionStatus = getDisplayedConnectionStatus({
    health,
    freshness,
    fallbackConnectionStatus: connectionStatus,
  })

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    async function fetchHealth() {
      try {
        const response = await fetch('/api/telemetry/health', {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        })
        const nextHealth = (await response.json()) as CloudTelemetryHealth

        if (cancelled) return

        setHealth(nextHealth)
        setHealthError(response.ok ? undefined : nextHealth.error)
      } catch (error) {
        if (cancelled) return

        setHealth(null)
        setHealthError(
          error instanceof Error
            ? error.message
            : 'Failed to check cloud telemetry health.'
        )
      }
    }

    void fetchHealth()
    const intervalId = window.setInterval(() => {
      void fetchHealth()
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [enabled])

  if (!enabled) {
    return null
  }

  return (
    <section className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-bold text-white">Cloud Telemetry Status</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Vercel API to Upstash Redis to dashboard read path.
          </p>
        </div>
        <StatusPill label={freshness} tone={freshness} />
      </div>

      {freshness === 'warning' ? (
        <StatusBanner tone="warning">
          Cloud telemetry packet is older than 5 seconds.
        </StatusBanner>
      ) : null}
      {freshness === 'stale' ? (
        <StatusBanner tone="stale">
          Cloud telemetry is stale. Confirm ESP32 hotspot uplink and Vercel
          ingest token.
        </StatusBanner>
      ) : null}
      {healthError ? (
        <StatusBanner tone="stale">{healthError}</StatusBanner>
      ) : null}

      <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
        <StatusMetric label="Node" value={node} />
        <StatusMetric label="Connection" value={displayedConnectionStatus} />
        <StatusMetric label="Redis" value={redisStatus} />
        <StatusMetric
          label="Last packet"
          value={
            lastPacketTimestamp
              ? new Date(lastPacketTimestamp).toLocaleTimeString()
              : '--'
          }
        />
        <StatusMetric
          label="Packet age"
          value={packetAgeSeconds !== undefined ? `${packetAgeSeconds}s` : '--'}
        />
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <StatusMetric
          label="Health node"
          value={selectedNodeHealth?.node ?? '--'}
        />
        <StatusMetric
          label="Health updated"
          value={
            selectedNodeHealth?.updated_at
              ? new Date(selectedNodeHealth.updated_at).toLocaleTimeString()
              : '--'
          }
        />
        <StatusMetric
          label="Health age"
          value={
            selectedNodeHealth?.ageSeconds !== null &&
            selectedNodeHealth?.ageSeconds !== undefined
              ? `${selectedNodeHealth.ageSeconds}s`
              : '--'
          }
        />
      </div>
    </section>
  )
}

function StatusPill({
  label,
  tone,
}: {
  label: string
  tone: TelemetryFreshness
}) {
  return (
    <span
      className={`rounded border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${freshnessStyles[tone]}`}
    >
      {label}
    </span>
  )
}

function StatusBanner({
  children,
  tone,
}: {
  children: string
  tone: 'warning' | 'stale'
}) {
  return (
    <p
      className={`rounded-md border p-3 text-sm font-semibold ${
        tone === 'warning'
          ? freshnessStyles.warning
          : freshnessStyles.stale
      }`}
    >
      {children}
    </p>
  )
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words font-bold text-white">{value}</p>
    </div>
  )
}

function classifyFreshness(ageSeconds?: number): TelemetryFreshness {
  if (ageSeconds === undefined) return 'idle'
  if (ageSeconds < 5) return 'healthy'
  if (ageSeconds <= 15) return 'warning'

  return 'stale'
}

function findSelectedNodeHealth(
  health: CloudTelemetryHealth | null,
  node: TelemetryNodeId
) {
  if (!health) return null

  const selectedNodeHealth = health.nodes?.find(
    (nodeHealth) => nodeHealth.node === node
  )

  if (selectedNodeHealth) return selectedNodeHealth

  if (node === 'vehicle') {
    return {
      node: health.latestVehicleNode ?? node,
      updated_at: health.latestVehicleUpdatedAt,
      ageSeconds: health.latestVehiclePacketAgeSeconds,
    }
  }

  return null
}

function getFallbackPacketAgeSeconds(lastPacketAt?: number) {
  return lastPacketAt
    ? Math.max(0, Math.round((Date.now() - lastPacketAt) / 1000))
    : undefined
}

function getDisplayedConnectionStatus({
  health,
  freshness,
  fallbackConnectionStatus,
}: {
  health: CloudTelemetryHealth | null
  freshness: TelemetryFreshness
  fallbackConnectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
}) {
  if (!health) return fallbackConnectionStatus
  if (health.redis !== 'connected') return 'error'
  if (freshness === 'stale') return 'disconnected'
  if (freshness === 'idle') return 'connecting'

  return 'connected'
}
