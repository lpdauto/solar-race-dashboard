'use client'

import { useEffect, useMemo, useState } from 'react'
import type { RaceDay, RiskLevel } from '@/data/raceRoute'
import { useElevationProfile } from '@/hooks/useElevationProfile'
import {
  carSetupChangedEventName,
  defaultCarSetup,
  readStoredCarSetup,
  simulateDayEnergy,
  type CarSetup,
} from '@/lib/energy'

type EnergySimulationPanelProps = {
  raceDay: RaceDay
}

const riskStyles: Record<RiskLevel, string> = {
  low: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100',
  high: 'border-orange-400/40 bg-orange-400/10 text-orange-100',
  severe: 'border-red-400/40 bg-red-400/10 text-[#ff8fcb]',
}

export default function EnergySimulationPanel({
  raceDay,
}: EnergySimulationPanelProps) {
  const { stats, loading } = useElevationProfile(raceDay.day, raceDay.routePoints)
  const [carSetup, setCarSetup] = useState<CarSetup>(defaultCarSetup)

  useEffect(() => {
    function syncCarSetup() {
      setCarSetup(readStoredCarSetup())
    }

    syncCarSetup()
    window.addEventListener(carSetupChangedEventName, syncCarSetup)
    window.addEventListener('storage', syncCarSetup)

    return () => {
      window.removeEventListener(carSetupChangedEventName, syncCarSetup)
      window.removeEventListener('storage', syncCarSetup)
    }
  }, [])

  const simulation = useMemo(
    () =>
      simulateDayEnergy({
        distanceMiles: raceDay.distanceMiles,
        elevationStats: stats,
        carSetup,
      }),
    [carSetup, raceDay.distanceMiles, stats]
  )

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-md border border-white/10 bg-black/20 p-6 text-sm font-semibold text-[#ff8fcb]">
        Loading energy model...
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#ff8fcb]">
            Physics-based day estimate
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Uses current car setup, sampled elevation, solar recovery, and regen assumptions.
          </p>
        </div>
        <RiskBadge risk={simulation.riskLevel} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Estimated Wh/mile" value={`${simulation.estimatedWhPerMile.toFixed(1)} Wh/mi`} />
        <Metric label="Flat-road use" value={`${formatWh(simulation.flatRoadWh)}`} />
        <Metric label="Climb penalty" value={`${formatWh(simulation.climbWh)}`} />
        <Metric label="Regen recovery" value={`${formatWh(simulation.regenWh)}`} />
        <Metric label="Solar recovery" value={`${formatWh(simulation.solarWh)}`} />
        <Metric label="Net battery use" value={`${simulation.netKwh.toFixed(2)} kWh`} />
        <Metric label="Battery percent used" value={`${simulation.batteryPercentUsed.toFixed(0)}%`} />
        <Metric label="Predicted finish SOC" value={`${simulation.predictedFinishSocPercent.toFixed(0)}%`} />
        <Metric label="Cruise speed" value={`${carSetup.cruiseSpeedMph} mph`} />
      </div>

      <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-200">
        {strategyText(simulation.riskLevel)}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  )
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span
      className={`rounded border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${riskStyles[risk]}`}
    >
      {risk}
    </span>
  )
}

function formatWh(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} kWh`
  }

  return `${value.toFixed(0)} Wh`
}

function strategyText(risk: RiskLevel) {
  if (risk === 'high' || risk === 'severe') {
    return 'High energy risk. Slow down, reduce acceleration, monitor controller temperature, and consider trailer-risk sections before compounding battery losses.'
  }

  if (risk === 'medium') {
    return 'Medium energy risk. Hold a steady aero-efficient speed and protect state of charge on climbs before increasing pace.'
  }

  return 'Low energy risk. The route is manageable with this setup, but keep speed disciplined and preserve reserve for traffic, wind, or weather changes.'
}


