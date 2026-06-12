'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  summarizeVehicleTelemetryStatus,
  vehicleNodeStatusLabel,
} from '@/lib/vehicleTelemetryStatus'
import type {
  CloudTelemetryHealth,
  TelemetryNodeId,
  VehicleNodeStatus,
} from '@/types/telemetry'

type CloudTelemetryStatusCardProps = {
  enabled: boolean
  node: TelemetryNodeId
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  lastPacketAt?: number
}

const vehicleStatusStyles: Record<VehicleNodeStatus, string> = {
  online: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  stale: 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100',
  offline: 'border-red-400/30 bg-red-400/10 text-[#ff8fcb]',
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
  const vehicleStatus = summarizeVehicleTelemetryStatus({
    packetAgeSeconds,
  })
  const redisStatus = health?.redis ?? (enabled ? 'checking' : 'idle')
  const cloudBackendStatus =
    health?.cloudBackendStatus ??
    (health?.redis === 'connected' || connectionStatus === 'connected'
      ? 'connected'
      : 'error')

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
        <VehicleStatusPill status={vehicleStatus.vehicleNodeStatus} />
      </div>

      {vehicleStatus.vehicleNodeStatus === 'stale' ? (
        <StatusBanner tone="warning">
          Vehicle ESP32 packet is older than 10 seconds.
        </StatusBanner>
      ) : null}
      {vehicleStatus.vehicleNodeStatus === 'offline' ? (
        <StatusBanner tone="stale">
          Vehicle ESP32 is offline. Cloud backend may still be connected.
        </StatusBanner>
      ) : null}
      {healthError ? (
        <StatusBanner tone="stale">{healthError}</StatusBanner>
      ) : null}

      <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
        <StatusMetric label="Node" value={node} />
        <StatusMetric
          label="Cloud Backend"
          value={cloudBackendStatus === 'connected' ? 'Connected' : 'Unavailable'}
        />
        <StatusMetric
          label="Vehicle ESP32"
          value={vehicleNodeStatusLabel(vehicleStatus.vehicleNodeStatus)}
        />
        <StatusMetric label="Redis" value={redisStatus} />
        <StatusMetric
          label="Last Vehicle Packet"
          value={
            lastPacketTimestamp
              ? new Date(lastPacketTimestamp).toLocaleTimeString()
              : '--'
          }
        />
        <StatusMetric
          label="Vehicle Packet Age"
          value={
            typeof packetAgeSeconds === 'number' &&
            Number.isFinite(packetAgeSeconds)
              ? `${packetAgeSeconds}s`
              : '--'
          }
        />
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <StatusMetric
          label="Telemetry Fresh"
          value={vehicleStatus.telemetryFresh ? 'true' : 'false'}
        />
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

function VehicleStatusPill({ status }: { status: VehicleNodeStatus }) {
  return (
    <span
      className={`rounded border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${vehicleStatusStyles[status]}`}
    >
      {vehicleNodeStatusLabel(status)}
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
          ? vehicleStatusStyles.stale
          : vehicleStatusStyles.offline
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
