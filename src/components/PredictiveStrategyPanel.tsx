'use client'

import { useEffect, useMemo, useState } from 'react'
import StrategyRecommendationCard from '@/components/StrategyRecommendationCard'
import type { RaceDay, RouteSegment } from '@/data/raceRoute'
import { useElevationProfile } from '@/hooks/useElevationProfile'
import {
  carSetupChangedEventName,
  defaultCarSetup,
  readStoredCarSetup,
  simulateDayEnergy,
  type CarSetup,
} from '@/lib/energy'
import { generatePredictiveStrategy } from '@/lib/strategyEngine'
import type { TelemetryData } from '@/types/telemetry'

type PredictiveStrategyPanelProps = {
  raceDay: RaceDay
  currentMile: number
  currentSegment: RouteSegment | null
  telemetry: TelemetryData | null
}

const modeStyles = {
  Conserve: 'border-yellow-300/35 bg-yellow-300/10 text-yellow-100',
  Normal: 'border-[#ff3ea5]/35 bg-[#ff3ea5]/10 text-[#ff8fcb]',
  Attack: 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100',
}

export default function PredictiveStrategyPanel({
  raceDay,
  currentMile,
  currentSegment,
  telemetry,
}: PredictiveStrategyPanelProps) {
  const { stats } = useElevationProfile(raceDay.day, raceDay.routePoints)
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

  const energySimulation = useMemo(
    () =>
      simulateDayEnergy({
        distanceMiles: raceDay.distanceMiles,
        elevationStats: stats,
        carSetup,
      }),
    [carSetup, raceDay.distanceMiles, stats]
  )
  const strategy = useMemo(
    () =>
      generatePredictiveStrategy({
        raceDay,
        currentMile,
        currentSegment,
        energySimulation,
        telemetry,
      }),
    [currentMile, currentSegment, energySimulation, raceDay, telemetry]
  )

  return (
    <section className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <h3 className="text-base font-bold text-white">
            Predictive Strategy Engine
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Compares live telemetry against the energy model and current route context.
          </p>
        </div>
        <span
          className={`rounded border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${modeStyles[strategy.raceMode]}`}
        >
          {strategy.raceMode} mode
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="rounded-lg border border-[#ff3ea5]/25 bg-[#ff3ea5]/10 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ff8fcb]">
            Recommended Speed
          </p>
          <p className="mt-2 text-5xl font-black text-white">
            {strategy.recommendedSpeedMph}
            <span className="ml-2 text-lg text-slate-300">mph</span>
          </p>
          <p className="mt-3 text-sm leading-6 text-[#ff8fcb]">
            {strategy.driverAction}
          </p>
        </div>
        <Metric
          label="Projected finish SOC"
          value={`${strategy.projectedFinishSoc.toFixed(1)}%`}
        />
        <Metric label="Thermal risk" value={strategy.thermalRisk} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Current Wh/mile"
          value={`${strategy.currentWhPerMile.toFixed(0)} Wh/mi`}
        />
        <Metric
          label="Model Wh/mile"
          value={`${strategy.modelWhPerMile.toFixed(0)} Wh/mi`}
        />
        <Metric
          label="Efficiency delta"
          value={`${strategy.efficiencyDeltaPercent.toFixed(1)}%`}
        />
      </div>

      <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-200">
        <span className="font-bold text-white">Chase action: </span>
        {strategy.chaseAction}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {strategy.recommendations.map((recommendation) => (
          <StrategyRecommendationCard
            key={`${recommendation.title}-${recommendation.action}`}
            recommendation={recommendation}
          />
        ))}
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  )
}


