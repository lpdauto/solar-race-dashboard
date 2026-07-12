'use client'

import CloudTelemetryStatusCard from '@/components/CloudTelemetryStatusCard'
import TelemetryGauge from '@/components/TelemetryGauge'
import SystemHealthPanel from '@/components/SystemHealthPanel'
import {
  exportRaceSnapshotsToCsv,
  type RaceSnapshot,
} from '@/lib/raceSnapshots'
import type {
  TelemetryConnectionStatus,
  CloudTelemetryHealth,
  TelemetryData,
  TelemetryNodeId,
  TelemetrySource,
} from '@/types/telemetry'
import { telemetryNodeOptions } from '@/types/telemetry'

type TelemetryDashboardProps = {
  telemetry: TelemetryData | null
  status: TelemetryConnectionStatus
  source: TelemetrySource
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  connectionError?: string
  lastPacketAt?: number
  effectiveStatus: TelemetryConnectionStatus
  effectiveConnectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  effectiveLastPacketAt?: number
  cloudNode: TelemetryNodeId
  cloudHealth?: CloudTelemetryHealth | null
  snapshots?: RaceSnapshot[]
  onClearSnapshots?: () => void
  connect: () => void
  disconnect: () => void
  setSource: (source: TelemetrySource) => void
  setCloudNode: (node: TelemetryNodeId) => void
  showDevelopmentSources?: boolean
}

const statusStyles: Record<TelemetryConnectionStatus, string> = {
  disconnected: 'border-slate-300/30 bg-slate-300/10 text-slate-100',
  connecting: 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100',
  connected: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  warning: 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100',
  simulated: 'border-[#ff3ea5]/30 bg-[#ff3ea5]/10 text-[#ff8fcb]',
  error: 'border-red-400/30 bg-red-400/10 text-[#ff8fcb]',
}

const telemetrySources: TelemetrySource[] = [
  'simulator',
  'mock-esp32',
  'esp32',
  'cloud',
  'manual',
  'websocket',
  'serial',
  'ble',
  'canbus',
]

function celsiusToFahrenheit(valueC?: number | null) {
  return valueC === undefined || valueC === null
    ? undefined
    : valueC * 1.8 + 32
}

export default function TelemetryDashboard({
  telemetry,
  status,
  source,
  connectionStatus,
  connectionError,
  lastPacketAt,
  effectiveStatus,
  effectiveConnectionStatus,
  effectiveLastPacketAt,
  cloudNode,
  cloudHealth,
  snapshots = [],
  onClearSnapshots,
  connect,
  disconnect,
  setSource,
  setCloudNode,
  showDevelopmentSources = false,
}: TelemetryDashboardProps) {
  const warnings = telemetry ? buildWarnings(telemetry) : []
  const visibleTelemetrySources = showDevelopmentSources
    ? telemetrySources
    : telemetrySources.filter(
        (telemetrySource) =>
          telemetrySource === 'cloud' || telemetrySource === 'esp32'
      )

  return (
    <section className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <h3 className="text-base font-bold text-white">Live Telemetry</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Use simulator data, local ESP32 polling, or Cloud Telemetry for hosted race updates. Target Efficiency: 30-45 Wh/mi.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            label={effectiveStatus}
            className={statusStyles[effectiveStatus]}
          />
          <Badge
            label={telemetrySourceLabel(source)}
            className="border-violet-300/30 bg-violet-300/10 text-violet-100"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Source
          </span>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as TelemetrySource)}
            className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-[#ff3ea5]/60"
          >
            {visibleTelemetrySources.map((telemetrySource) => (
              <option key={telemetrySource} value={telemetrySource}>
                {telemetrySourceLabel(telemetrySource)}
              </option>
            ))}
          </select>
        </label>
        {source === 'cloud' ? (
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Node
            </span>
            <select
              value={cloudNode}
              onChange={(event) =>
                setCloudNode(event.target.value as TelemetryNodeId)
              }
              className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-[#ff3ea5]/60"
            >
              {telemetryNodeOptions.map((node) => (
                <option key={node} value={node}>
                  {telemetryNodeLabel(node)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={connect}
          className="h-10 rounded-md bg-[#ff3ea5] px-3 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f]"
        >
          {source === 'esp32'
            ? 'Start ESP32'
            : source === 'cloud'
            ? 'Start Cloud'
            : 'Start simulation'}
        </button>
        <button
          type="button"
          onClick={disconnect}
          className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10"
        >
          Stop telemetry
        </button>
      </div>

      <CloudTelemetryStatusCard
        enabled={source === 'cloud'}
        node={cloudNode}
        connectionStatus={effectiveConnectionStatus}
        lastPacketAt={effectiveLastPacketAt}
        health={cloudHealth}
      />

      <div className="grid gap-3 rounded-md border border-white/10 bg-black/20 p-3 text-sm sm:grid-cols-3">
        <ConnectionMetric label="Source" value={telemetrySourceLabel(source)} />
        <ConnectionMetric
          label="Connection"
          value={effectiveConnectionStatus}
        />
        <ConnectionMetric
          label="Last packet"
          value={formatLastPacketAge(effectiveLastPacketAt)}
        />
        {effectiveStatus === 'error' && connectionError ? (
          <div className="sm:col-span-3 text-sm font-semibold text-[#ff8fcb]">
            {connectionError}
          </div>
        ) : null}
      </div>

      {effectiveStatus === 'error' ? (
        <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm leading-6 text-[#ff8fcb]">
          {connectionError ??
            'This telemetry source is reserved for future hardware integration. Switch back to simulator mode for live demo data.'}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="grid gap-2">
          {warnings.map((warning) => (
            <div
              key={warning}
              className="rounded-md border border-yellow-300/30 bg-yellow-300/10 p-3 text-sm font-semibold text-yellow-100"
            >
              {warning}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <TelemetryGauge label="Speed" value={telemetry?.speedMph} unit="mph" min={0} max={45} precision={1} />
        <TelemetryGauge label="Battery SOC" value={telemetry?.batterySocPercent} unit="%" min={0} max={100} warningThreshold={30} dangerThreshold={85} precision={1} />
        <TelemetryGauge label="Battery Voltage" value={telemetry?.batteryVoltage} unit="V" min={68} max={86} precision={1} />
        <TelemetryGauge label="Battery Current" value={telemetry?.batteryCurrent} unit="A" min={-30} max={130} warningThreshold={85} dangerThreshold={105} precision={1} />
        <TelemetryGauge label="Battery Power" value={telemetry?.batteryPowerWatts !== undefined ? telemetry.batteryPowerWatts / 1000 : null} unit="kW" min={-2} max={10} warningThreshold={6.5} dangerThreshold={8.5} precision={2} />
        <TelemetryGauge label="Solar Power" value={telemetry?.solarPowerWatts ?? telemetry?.mpptPowerWatts} unit="W" min={0} max={2200} precision={0} />
        <TelemetryGauge label="Controller Temp" value={celsiusToFahrenheit(telemetry?.controllerTempC)} unit="F" min={68} max={212} warningThreshold={167} dangerThreshold={185} precision={1} />
        <TelemetryGauge label="Motor Temp" value={celsiusToFahrenheit(telemetry?.motorTempC)} unit="F" min={68} max={230} warningThreshold={185} dangerThreshold={203} precision={1} />
        <TelemetryGauge label="Efficiency" value={telemetry?.efficiencyWhPerMile ?? telemetry?.whPerMile} unit="Wh/mi" min={20} max={70} warningThreshold={45} dangerThreshold={55} precision={0} />
        <TelemetryGauge label="Regen Power" value={telemetry?.regenWatts} unit="W" min={0} max={2000} precision={0} />
      </div>

      <section className="grid gap-3 rounded-md border border-white/10 bg-black/20 p-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <EnergyDebugMetric
          label="Net Power"
          value={formatSignedWatts(telemetry?.netPowerWatts)}
          tone={
            telemetry?.netPowerWatts === undefined
              ? 'neutral'
              : telemetry.netPowerWatts >= 0
                ? 'positive'
                : 'negative'
          }
        />
        <EnergyDebugMetric
          label="Energy Consumed"
          value={formatWh(telemetry?.energyConsumedWh)}
        />
        <EnergyDebugMetric
          label="Energy Recovered"
          value={formatWh(telemetry?.energyRecoveredWh)}
          tone="positive"
        />
        <EnergyDebugMetric
          label="Battery Energy"
          value={formatWh(telemetry?.batteryEnergyWh)}
        />
      </section>

      <SystemHealthPanel telemetry={telemetry} />

      <RecentStrategyLog
        snapshots={snapshots}
        onClearSnapshots={onClearSnapshots}
      />
    </section>
  )
}

function RecentStrategyLog({
  snapshots,
  onClearSnapshots,
}: {
  snapshots: RaceSnapshot[]
  onClearSnapshots?: () => void
}) {
  const recentSnapshots = snapshots.slice(-5).reverse()
  const hasSnapshots = snapshots.length > 0

  function downloadCsv() {
    if (!hasSnapshots || typeof window === 'undefined' || typeof document === 'undefined') {
      return
    }

    const csv = exportRaceSnapshotsToCsv(snapshots)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `rx2-strategy-log-${formatDownloadTimestamp(new Date())}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h3 className="text-base font-bold text-white">Recent Strategy Log</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadCsv}
            disabled={!hasSnapshots}
            className="h-9 rounded-md border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Download CSV
          </button>
          <button
            type="button"
            onClick={onClearSnapshots}
            disabled={!onClearSnapshots || !hasSnapshots}
            className="h-9 rounded-md border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear Log
          </button>
        </div>
      </div>

      {recentSnapshots.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-slate-400">
          No strategy snapshots recorded yet.
        </p>
      ) : (
        <div className="mt-3 grid gap-2">
          {recentSnapshots.map((snapshot) => (
            <article
              key={`${snapshot.timestamp}-${snapshot.currentMile}`}
              className="grid gap-2 rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm md:grid-cols-[0.8fr_0.7fr_0.7fr_1.4fr_0.8fr_0.9fr]"
            >
              <LogField label="Time" value={formatSnapshotTime(snapshot.timestamp)} />
              <LogField label="Speed" value={`${snapshot.speedMph.toFixed(1)} mph`} />
              <LogField label="SOC" value={`${snapshot.batterySocPercent.toFixed(0)}%`} />
              <LogField label="Command" value={snapshot.command ?? '--'} />
              <LogField
                label="Finish SOC"
                value={
                  snapshot.projectedFinishSoc !== undefined
                    ? `${snapshot.projectedFinishSoc.toFixed(0)}%`
                    : '--'
                }
              />
              <LogField label="Swap" value={snapshot.swapAction ?? '--'} />
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function LogField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate font-semibold text-slate-100" title={value}>
        {value}
      </p>
    </div>
  )
}

function formatSnapshotTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString()
}

function formatDownloadTimestamp(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}-${hours}${minutes}`
}

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`rounded border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${className}`}
    >
      {label}
    </span>
  )
}

function ConnectionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-bold text-white">{value}</p>
    </div>
  )
}

function EnergyDebugMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'positive' | 'negative'
}) {
  const valueColor =
    tone === 'positive'
      ? 'text-emerald-200'
      : tone === 'negative'
        ? 'text-[#ff8fcb]'
        : 'text-white'

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-xl font-black ${valueColor}`}>{value}</p>
    </div>
  )
}

function telemetrySourceLabel(source: TelemetrySource) {
  if (source === 'mock-esp32') return 'Mock ESP32'
  if (source === 'esp32') return 'ESP32 Live'
  if (source === 'cloud') return 'Cloud Telemetry'

  return source
}

function telemetryNodeLabel(node: TelemetryNodeId) {
  if (node === 'mppt') return 'MPPT'
  if (node === 'spare-battery') return 'Spare Battery'

  return node.charAt(0).toUpperCase() + node.slice(1)
}

function formatSignedWatts(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '--'

  const sign = value > 0 ? '+' : ''

  return `${sign}${value.toFixed(0)} W`
}

function formatWh(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '--'

  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(2)} kWh`
  }

  return `${value.toFixed(0)} Wh`
}

function formatLastPacketAge(timestamp?: number) {
  if (!timestamp) return '--'

  const ageSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  const ageLabel =
    ageSeconds < 60
      ? `${ageSeconds}s ago`
      : `${Math.floor(ageSeconds / 60)}m ${ageSeconds % 60}s ago`

  return `${ageLabel} (${new Date(timestamp).toLocaleTimeString()})`
}

function buildWarnings(telemetry: TelemetryData) {
  const warnings: string[] = []
  const controllerTempC = telemetry.controllerTempC ?? 0
  const motorTempC = telemetry.motorTempC ?? 0
  const efficiencyWhPerMile = telemetry.efficiencyWhPerMile ?? telemetry.whPerMile ?? 0

  if (controllerTempC > 85) {
    warnings.push('Controller temperature critical.')
  }

  if (motorTempC > 95) {
    warnings.push('Motor overheating risk.')
  }

  if (telemetry.batterySocPercent < 15) {
    warnings.push('Battery reserve critically low.')
  }

  if (telemetry.batteryCurrent > 100) {
    warnings.push('High current draw detected.')
  }

  if (efficiencyWhPerMile > 55) {
    warnings.push('High consumption detected. Target efficiency is 30-45 Wh/mi.')
  }

  return warnings
}


