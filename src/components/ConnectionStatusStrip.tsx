'use client'

import type { LiveTelemetryGpsPosition } from '@/lib/liveTelemetryGps'
import { hasVehicleLocationCoordinates, type VehicleLocation } from '@/lib/vehicleLocation'
import type {
  CloudTelemetryHealth,
  TelemetryConnectionStatus,
} from '@/types/telemetry'

type StatusTone = 'green' | 'yellow' | 'red' | 'gray'

type ConnectionState =
  | 'Connected'
  | 'Simulated'
  | 'Stale'
  | 'Disconnected'
  | 'Error'
  | 'Not configured'

type ConnectionItem = {
  name: string
  status: ConnectionState
  helper: string
  tone: StatusTone
}

const toneStyles: Record<StatusTone, string> = {
  green: 'bg-emerald-400 shadow-emerald-400/40',
  yellow: 'bg-yellow-300 shadow-yellow-300/40',
  red: 'bg-red-500 shadow-red-500/40',
  gray: 'bg-slate-500 shadow-slate-500/30',
}

export default function ConnectionStatusStrip({
  liveGps,
  vehicleLocation,
  telemetryConnected = false,
  telemetryStatus = 'disconnected',
  telemetryConnectionError,
  cloudHealth,
  vehiclePacketAgeSeconds,
}: {
  liveGps?: LiveTelemetryGpsPosition | null
  vehicleLocation?: VehicleLocation | null
  telemetryConnected?: boolean
  telemetryStatus?: TelemetryConnectionStatus
  telemetryConnectionError?: string
  cloudHealth?: CloudTelemetryHealth | null
  vehiclePacketAgeSeconds?: number | null
}) {
  const items: ConnectionItem[] = [
    cloudTelemetryCard({ cloudHealth, telemetryConnectionError }),
    vehicleTelemetryCard({
      telemetryStatus,
      telemetryConnected,
      vehiclePacketAgeSeconds,
      telemetryConnectionError,
    }),
    vehicleGpsCard({ vehicleLocation, liveGps, telemetryStatus, telemetryConnected }),
    batteryTelemetryCard('Battery A Telemetry', 'battery-a', cloudHealth),
    batteryTelemetryCard('Battery B Telemetry', 'battery-b', cloudHealth),
  ]

  return (
    <section
      className="grid max-w-full gap-2 rounded-lg border border-[#ff3ea5]/25 bg-black/35 p-2 shadow-xl shadow-black/20 backdrop-blur sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
      aria-label="Telemetry connection status"
    >
      {items.map((item) => (
        <article
          key={item.name}
          className="min-w-0 rounded-md border border-white/10 bg-white/[0.055] px-2.5 py-2"
        >
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full shadow-[0_0_12px_currentColor] ${toneStyles[item.tone]}`}
              aria-hidden="true"
            />
            <h2 className="truncate text-xs font-black text-white">
              {item.name}
            </h2>
          </div>
          <p className="mt-1 text-xs font-black text-[#ff8fcb]">
            {item.status}
          </p>
          <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-slate-300">
            {item.helper}
          </p>
        </article>
      ))}
    </section>
  )
}

function cloudTelemetryCard({
  cloudHealth,
  telemetryConnectionError,
}: {
  cloudHealth?: CloudTelemetryHealth | null
  telemetryConnectionError?: string
}): ConnectionItem {
  if (cloudHealth?.redis === 'not_configured') {
    return {
      name: 'Cloud Telemetry',
      status: 'Not configured',
      helper: 'Telemetry backend env vars missing',
      tone: 'gray',
    }
  }

  if (cloudHealth?.redis === 'error' || cloudHealth?.healthEndpointStatus === 'error') {
    return {
      name: 'Cloud Telemetry',
      status: 'Error',
      helper: cloudHealth.error ?? telemetryConnectionError ?? 'Backend health check failed',
      tone: 'red',
    }
  }

  if (cloudHealth?.redis === 'connected' || cloudHealth?.cloudBackendStatus === 'connected') {
    return {
      name: 'Cloud Telemetry',
      status: 'Connected',
      helper: 'Backend/API reachable',
      tone: 'green',
    }
  }

  if (telemetryConnectionError) {
    return {
      name: 'Cloud Telemetry',
      status: 'Error',
      helper: telemetryConnectionError,
      tone: 'red',
    }
  }

  return {
    name: 'Cloud Telemetry',
    status: 'Disconnected',
    helper: 'Waiting for backend health',
    tone: 'yellow',
  }
}

function vehicleTelemetryCard({
  telemetryStatus,
  telemetryConnected,
  vehiclePacketAgeSeconds,
  telemetryConnectionError,
}: {
  telemetryStatus: TelemetryConnectionStatus
  telemetryConnected: boolean
  vehiclePacketAgeSeconds?: number | null
  telemetryConnectionError?: string
}): ConnectionItem {
  if (telemetryStatus === 'error') {
    return {
      name: 'Vehicle Telemetry',
      status: 'Error',
      helper: telemetryConnectionError ?? 'Vehicle telemetry request failed',
      tone: 'red',
    }
  }

  if (telemetryStatus === 'simulated') {
    return {
      name: 'Vehicle Telemetry',
      status: 'Simulated',
      helper: 'Using simulator data',
      tone: 'yellow',
    }
  }

  if (telemetryStatus === 'warning') {
    return {
      name: 'Vehicle Telemetry',
      status: 'Stale',
      helper: formatAgeHelper(vehiclePacketAgeSeconds, 'Last vehicle packet'),
      tone: 'yellow',
    }
  }

  if (telemetryStatus === 'connected' || telemetryConnected) {
    return {
      name: 'Vehicle Telemetry',
      status: 'Connected',
      helper: formatAgeHelper(vehiclePacketAgeSeconds, 'Latest vehicle packet'),
      tone: 'green',
    }
  }

  return {
    name: 'Vehicle Telemetry',
    status: 'Disconnected',
    helper: 'Waiting for vehicle ESP32 packets',
    tone: 'gray',
  }
}

function vehicleGpsCard({
  vehicleLocation,
  liveGps,
  telemetryStatus,
  telemetryConnected,
}: {
  vehicleLocation?: VehicleLocation | null
  liveGps?: LiveTelemetryGpsPosition | null
  telemetryStatus: TelemetryConnectionStatus
  telemetryConnected: boolean
}): ConnectionItem {
  // Android phone GPS is the default vehicle GPS source whenever a device has
  // registered as the active provider, regardless of ESP32 telemetry state.
  if (vehicleLocation?.providerName) {
    const hasFix = hasVehicleLocationCoordinates(vehicleLocation)

    if (vehicleLocation.status === 'online' && hasFix) {
      return {
        name: 'Vehicle GPS',
        status: 'Connected',
        helper: `${vehicleLocation.providerName}: ${vehicleLocation.latitude!.toFixed(5)}, ${vehicleLocation.longitude!.toFixed(5)}`,
        tone: 'green',
      }
    }

    if (vehicleLocation.status === 'stale' && hasFix) {
      return {
        name: 'Vehicle GPS',
        status: 'Stale',
        helper: `${vehicleLocation.providerName} stale: ${vehicleLocation.latitude!.toFixed(5)}, ${vehicleLocation.longitude!.toFixed(5)}`,
        tone: 'yellow',
      }
    }

    if (vehicleLocation.status === 'searching') {
      return {
        name: 'Vehicle GPS',
        status: 'Disconnected',
        helper: `${vehicleLocation.providerName} is active; waiting for a GPS fix`,
        tone: 'yellow',
      }
    }

    return {
      name: 'Vehicle GPS',
      status: 'Disconnected',
      helper: `${vehicleLocation.providerName} is offline`,
      tone: 'gray',
    }
  }

  if (telemetryStatus === 'error') {
    return {
      name: 'Vehicle GPS',
      status: 'Error',
      helper: 'GPS depends on vehicle ESP32 telemetry',
      tone: 'red',
    }
  }

  if (telemetryStatus === 'simulated') {
    return {
      name: 'Vehicle GPS',
      status: 'Simulated',
      helper: liveGps
        ? `${liveGps.lat.toFixed(5)}, ${liveGps.lng.toFixed(5)}`
        : 'Using simulator GPS state',
      tone: 'yellow',
    }
  }

  if (telemetryStatus === 'warning') {
    return {
      name: 'Vehicle GPS',
      status: 'Stale',
      helper: 'Vehicle telemetry stale; GPS is not live',
      tone: 'yellow',
    }
  }

  if (!telemetryConnected && telemetryStatus !== 'connected') {
    return {
      name: 'Vehicle GPS',
      status: 'Disconnected',
      helper: 'GPS unavailable until vehicle ESP32 is connected',
      tone: 'gray',
    }
  }

  if (liveGps) {
    return {
      name: 'Vehicle GPS',
      status: 'Connected',
      helper: `${liveGps.lat.toFixed(5)}, ${liveGps.lng.toFixed(5)}`,
      tone: 'green',
    }
  }

  return {
    name: 'Vehicle GPS',
    status: 'Disconnected',
    helper: 'Waiting for vehicle GPS fix',
    tone: 'gray',
  }
}

function batteryTelemetryCard(
  name: 'Battery A Telemetry' | 'Battery B Telemetry',
  nodeId: 'battery-a' | 'battery-b',
  cloudHealth?: CloudTelemetryHealth | null
): ConnectionItem {
  const nodeHealth = findNodeHealth(cloudHealth, nodeId)

  if (!nodeHealth) {
    return {
      name,
      status: 'Not configured',
      helper: `${name.replace(' Telemetry', '')} node not reporting yet`,
      tone: 'gray',
    }
  }

  if (nodeHealth.ageSeconds === null || nodeHealth.ageSeconds === undefined) {
    return {
      name,
      status: 'Disconnected',
      helper: 'No packet timestamp available',
      tone: 'gray',
    }
  }

  if (nodeHealth.ageSeconds <= 30) {
    return {
      name,
      status: 'Connected',
      helper: formatAgeHelper(nodeHealth.ageSeconds, 'Latest BMS packet'),
      tone: 'green',
    }
  }

  if (nodeHealth.ageSeconds <= 120) {
    return {
      name,
      status: 'Stale',
      helper: formatAgeHelper(nodeHealth.ageSeconds, 'Last BMS packet'),
      tone: 'yellow',
    }
  }

  return {
    name,
    status: 'Disconnected',
    helper: formatAgeHelper(nodeHealth.ageSeconds, 'Last BMS packet'),
    tone: 'red',
  }
}

function findNodeHealth(
  cloudHealth: CloudTelemetryHealth | null | undefined,
  nodeId: 'battery-a' | 'battery-b'
) {
  const aliases =
    nodeId === 'battery-a'
      ? ['battery-a', 'batteryA', 'bms-a', 'bmsA', 'pack-a', 'packA']
      : ['battery-b', 'batteryB', 'bms-b', 'bmsB', 'pack-b', 'packB']

  return cloudHealth?.nodes?.find((nodeHealth) =>
    aliases.includes(String(nodeHealth.node))
  )
}

function formatAgeHelper(ageSeconds: number | null | undefined, label: string) {
  if (ageSeconds === null || ageSeconds === undefined) return label
  if (ageSeconds < 60) return `${label}: ${Math.round(ageSeconds)}s ago`

  return `${label}: ${Math.round(ageSeconds / 60)}m ago`
}
