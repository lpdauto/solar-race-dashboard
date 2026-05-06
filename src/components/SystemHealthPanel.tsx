'use client'

import type { TelemetryData } from '@/types/telemetry'

type SystemHealthPanelProps = {
  telemetry: TelemetryData | null
}

export default function SystemHealthPanel({ telemetry }: SystemHealthPanelProps) {
  const health = telemetry ? summarizeHealth(telemetry) : null

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <h3 className="text-base font-bold text-white">System Health</h3>
      {!health ? (
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Start telemetry simulation to evaluate system health.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <HealthTile label="Drivetrain" value={health.drivetrainStatus} />
          <HealthTile label="Thermal" value={health.thermalStatus} />
          <HealthTile label="Battery reserve" value={health.batteryReserve} />
          <HealthTile label="Charging" value={health.chargingStatus} />
          <HealthTile label="Endurance" value={health.enduranceCondition} />
        </div>
      )}
    </section>
  )
}

function HealthTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-lg font-bold text-white">{value}</p>
    </div>
  )
}

function summarizeHealth(telemetry: TelemetryData) {
  const thermalStatus =
    telemetry.controllerTempC > 88 || telemetry.motorTempC > 96
      ? 'Critical thermal load'
      : telemetry.controllerTempC > 78 || telemetry.motorTempC > 86
        ? 'Watch temperatures'
        : 'Stable'
  const batteryReserve =
    telemetry.batterySocPercent < 15
      ? 'Conserve energy'
      : telemetry.batterySocPercent < 30
        ? 'Watch reserve'
        : 'Stable'
  const drivetrainStatus =
    telemetry.batteryCurrent > 105
      ? 'Conserve energy'
      : telemetry.efficiencyWhPerMile > 140
        ? 'Watch temperatures'
        : 'Stable'
  const chargingStatus =
    telemetry.regenWatts > 300
      ? 'Regen active'
      : telemetry.solarPowerWatts > 1200
        ? 'Excellent'
        : 'Stable'
  const enduranceCondition =
    thermalStatus === 'Critical thermal load'
      ? 'Critical thermal load'
      : batteryReserve === 'Conserve energy'
        ? 'Conserve energy'
        : telemetry.efficiencyWhPerMile > 140
          ? 'Watch temperatures'
          : telemetry.solarPowerWatts > 1400 && telemetry.batterySocPercent > 50
            ? 'Excellent'
            : 'Stable'

  return {
    drivetrainStatus,
    thermalStatus,
    batteryReserve,
    chargingStatus,
    enduranceCondition,
  }
}
