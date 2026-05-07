'use client'

import TelemetryGauge from '@/components/TelemetryGauge'
import SystemHealthPanel from '@/components/SystemHealthPanel'
import type {
  TelemetryConnectionStatus,
  TelemetryData,
  TelemetrySource,
} from '@/types/telemetry'

type TelemetryDashboardProps = {
  telemetry: TelemetryData | null
  status: TelemetryConnectionStatus
  source: TelemetrySource
  connect: () => void
  disconnect: () => void
  setSource: (source: TelemetrySource) => void
}

const statusStyles: Record<TelemetryConnectionStatus, string> = {
  disconnected: 'border-slate-300/30 bg-slate-300/10 text-slate-100',
  connecting: 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100',
  connected: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  simulated: 'border-[#ff3ea5]/30 bg-[#ff3ea5]/10 text-[#ff8fcb]',
  error: 'border-red-400/30 bg-red-400/10 text-[#ff8fcb]',
}

const telemetrySources: TelemetrySource[] = [
  'simulator',
  'websocket',
  'serial',
  'ble',
  'canbus',
]

export default function TelemetryDashboard({
  telemetry,
  status,
  source,
  connect,
  disconnect,
  setSource,
}: TelemetryDashboardProps) {
  const warnings = telemetry ? buildWarnings(telemetry) : []

  return (
    <section className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <h3 className="text-base font-bold text-white">Live Telemetry</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Simulator mode is active today; websocket, serial, BLE, and CAN hooks are reserved for hardware integration.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge label={status} className={statusStyles[status]} />
          <Badge
            label={source}
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
            {telemetrySources.map((telemetrySource) => (
              <option key={telemetrySource} value={telemetrySource}>
                {telemetrySource}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={connect}
          className="h-10 rounded-md bg-[#ff3ea5] px-3 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f]"
        >
          Start simulation
        </button>
        <button
          type="button"
          onClick={disconnect}
          className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10"
        >
          Stop simulation
        </button>
      </div>

      {status === 'error' ? (
        <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm leading-6 text-[#ff8fcb]">
          This telemetry source is reserved for future hardware integration. Switch back to simulator mode for live demo data.
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
        <TelemetryGauge label="Battery Power" value={telemetry ? telemetry.batteryPowerWatts / 1000 : null} unit="kW" min={-2} max={10} warningThreshold={6.5} dangerThreshold={8.5} precision={2} />
        <TelemetryGauge label="Solar Power" value={telemetry?.solarPowerWatts} unit="W" min={0} max={2200} precision={0} />
        <TelemetryGauge label="Controller Temp" value={telemetry?.controllerTempC} unit="C" min={20} max={100} warningThreshold={75} dangerThreshold={85} precision={1} />
        <TelemetryGauge label="Motor Temp" value={telemetry?.motorTempC} unit="C" min={20} max={110} warningThreshold={85} dangerThreshold={95} precision={1} />
        <TelemetryGauge label="Efficiency" value={telemetry?.efficiencyWhPerMile} unit="Wh/mi" min={20} max={190} warningThreshold={120} dangerThreshold={140} precision={0} />
        <TelemetryGauge label="Regen Power" value={telemetry?.regenWatts} unit="W" min={0} max={2000} precision={0} />
      </div>

      <SystemHealthPanel telemetry={telemetry} />
    </section>
  )
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

function buildWarnings(telemetry: TelemetryData) {
  const warnings: string[] = []

  if (telemetry.controllerTempC > 85) {
    warnings.push('Controller temperature critical.')
  }

  if (telemetry.motorTempC > 95) {
    warnings.push('Motor overheating risk.')
  }

  if (telemetry.batterySocPercent < 15) {
    warnings.push('Battery reserve critically low.')
  }

  if (telemetry.batteryCurrent > 100) {
    warnings.push('High current draw detected.')
  }

  if (telemetry.efficiencyWhPerMile > 140) {
    warnings.push('Vehicle efficiency degraded.')
  }

  return warnings
}


