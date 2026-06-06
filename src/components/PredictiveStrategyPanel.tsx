'use client'

import { useEffect, useMemo, useState } from 'react'
import StrategyRecommendationCard from '@/components/StrategyRecommendationCard'
import type { RaceDay, RouteSegment } from '@/data/raceRoute'
import { useElevationProfile } from '@/hooks/useElevationProfile'
import {
  generateOfflineRaceEngineerSummary,
  requestOnlineRaceEngineerSummary,
  type AiRaceEngineerInput,
  type AiRaceEngineerResponse,
} from '@/lib/aiRaceEngineer'
import {
  carSetupChangedEventName,
  defaultCarSetup,
  readStoredCarSetup,
  simulateDayEnergy,
  type CarSetup,
} from '@/lib/energy'
import type { RaceSnapshot } from '@/lib/raceSnapshots'
import { generatePredictiveStrategy } from '@/lib/strategyEngine'
import type { TelemetryData } from '@/types/telemetry'

type PredictiveStrategyPanelProps = {
  raceDay: RaceDay
  currentMile: number
  currentSegment: RouteSegment | null
  telemetry: TelemetryData | null
  recentSnapshots?: RaceSnapshot[]
  isTraileringActive?: boolean
}

const modeStyles = {
  Conserve: 'border-yellow-300/35 bg-yellow-300/10 text-yellow-100',
  Normal: 'border-[#ff3ea5]/35 bg-[#ff3ea5]/10 text-[#ff8fcb]',
  Attack: 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100',
}

const swapUrgencyStyles = {
  LOW: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100',
  MEDIUM: 'border-yellow-300/35 bg-yellow-300/10 text-yellow-100',
  HIGH: 'border-orange-400/35 bg-orange-400/10 text-orange-100',
  CRITICAL: 'border-red-400/35 bg-red-400/10 text-[#ff8fcb]',
}

export default function PredictiveStrategyPanel({
  raceDay,
  currentMile,
  currentSegment,
  telemetry,
  recentSnapshots = [],
  isTraileringActive = false,
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
        telemetrySource: telemetry?.source,
        startingSocPercent: 100,
        spareBatterySocPercent: carSetup.spareBatterySocPercent,
        isTraileringActive,
      }),
    [
      carSetup.spareBatterySocPercent,
      currentMile,
      currentSegment,
      energySimulation,
      isTraileringActive,
      raceDay,
      telemetry,
    ]
  )
  const raceEngineerInsight = useMemo(
    () =>
      generateOfflineRaceEngineerSummary({
        appProfile: carSetup.appProfile,
        currentDay: raceDay.day,
        currentMile,
        telemetry,
        strategy,
        swapAdvice: strategy.swapAdvice,
        recentSnapshots,
      }),
    [
      carSetup.appProfile,
      currentMile,
      raceDay.day,
      recentSnapshots,
      strategy,
      telemetry,
    ]
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

      <BatterySwapCard swapAdvice={strategy.swapAdvice} />

      <RouteIntelligenceCard routeIntelligence={strategy.routeIntelligence} />

      <RaceEngineerInsightPanel
        appProfile={carSetup.appProfile}
        insight={raceEngineerInsight}
        requestInput={{
          appProfile: carSetup.appProfile,
          currentDay: raceDay.day,
          currentMile,
          telemetry,
          strategy,
          swapAdvice: strategy.swapAdvice,
          recentSnapshots,
        }}
      />

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

function RouteIntelligenceCard({
  routeIntelligence,
}: {
  routeIntelligence: ReturnType<typeof generatePredictiveStrategy>['routeIntelligence']
}) {
  const trailering = routeIntelligence.traileringOption

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
            Route Intelligence
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Next {routeIntelligence.lookaheadMiles} miles analyzed for route risk,
            pacing opportunities, and trailering tradeoffs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {routeIntelligence.elevationAdjusted ? (
            <span className="w-fit rounded border border-emerald-300/35 bg-emerald-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-100">
              Elevation-adjusted
            </span>
          ) : null}
          <span className="w-fit rounded border border-yellow-300/35 bg-yellow-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-yellow-100">
            {trailering.action}
          </span>
        </div>
      </div>

      {routeIntelligence.elevationWarnings?.length ? (
        <div className="mt-3 rounded-md border border-yellow-300/25 bg-yellow-300/10 p-3 text-sm leading-6 text-yellow-100">
          {routeIntelligence.elevationWarnings[0]}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <RouteIntelList
          title="Top Risks"
          emptyText="No major route risks in the lookahead."
          items={routeIntelligence.risks.slice(0, 3).map((risk) => ({
            title: risk.title,
            badge: risk.severity,
            mileMarker: risk.mileMarker,
            reason: risk.reason,
          }))}
        />
        <RouteIntelList
          title="Top Opportunities"
          emptyText="No major opportunities in the lookahead."
          items={routeIntelligence.opportunities.slice(0, 3).map((opportunity) => ({
            title: opportunity.title,
            badge: opportunity.value,
            mileMarker: opportunity.mileMarker,
            reason: opportunity.reason,
          }))}
        />
      </div>

      <div className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3">
        <p className="text-sm leading-6 text-slate-200">
          <span className="font-bold text-white">Trailering strategy: </span>
          {trailering.reason}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <SmallMetric
            label="Energy saved"
            value={`${trailering.estimatedEnergySavedWh.toFixed(0)} Wh`}
          />
          <SmallMetric
            label="Mileage penalty"
            value={`${trailering.mileagePenalty.toFixed(1)} mi`}
          />
          <SmallMetric
            label="Driven SOC"
            value={`${trailering.projectedSocIfDriven.toFixed(1)}%`}
          />
          <SmallMetric
            label="Trailered SOC"
            value={`${trailering.projectedSocIfTrailered.toFixed(1)}%`}
          />
        </div>
      </div>
    </div>
  )
}

function RouteIntelList({
  title,
  emptyText,
  items,
}: {
  title: string
  emptyText: string
  items: Array<{
    title: string
    badge: string
    mileMarker: number
    reason: string
  }>
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-slate-300">{emptyText}</p>
      ) : (
        <div className="mt-2 grid gap-2">
          {items.map((item) => (
            <div
              key={`${title}-${item.title}-${item.mileMarker}`}
              className="rounded border border-white/10 bg-black/20 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-white">{item.title}</p>
                <span className="rounded border border-white/10 bg-white/10 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-200">
                  {item.badge}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-[#ff8fcb]">
                Mile {item.mileMarker.toFixed(1)}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                {item.reason}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RaceEngineerInsightPanel({
  appProfile,
  insight,
  requestInput,
}: {
  appProfile: CarSetup['appProfile']
  insight: AiRaceEngineerResponse
  requestInput: AiRaceEngineerInput
}) {
  const [requestedInsight, setRequestedInsight] =
    useState<AiRaceEngineerResponse | null>(null)
  const [isRequesting, setIsRequesting] = useState(false)
  const displayedInsight = requestedInsight ?? insight
  const aiStatus =
    appProfile === 'owner'
      ? 'AI enabled when internet and API access are available.'
      : 'AI disabled. Offline strategy engine active.'

  useEffect(() => {
    setRequestedInsight(null)
  }, [insight])

  async function askAiRaceEngineer() {
    if (appProfile !== 'owner' || isRequesting) return

    setIsRequesting(true)

    try {
      setRequestedInsight(await requestOnlineRaceEngineerSummary(requestInput))
    } finally {
      setIsRequesting(false)
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
            Race Engineer Insight
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            {displayedInsight.summary}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="w-fit rounded border border-violet-300/30 bg-violet-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-violet-100">
            {displayedInsight.source}
          </span>
          {appProfile === 'owner' ? (
            <button
              type="button"
              onClick={askAiRaceEngineer}
              disabled={isRequesting}
              className="h-8 rounded-md bg-[#ff3ea5] px-3 text-xs font-bold text-slate-950 transition hover:bg-[#ff2f9f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRequesting ? 'Asking...' : 'Ask AI Race Engineer'}
            </button>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-200">
        <span className="font-bold text-white">Recommendation: </span>
        {displayedInsight.recommendation}
      </p>

      <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm font-semibold text-slate-200">
        {aiStatus}
      </div>

      {displayedInsight.errorMessage ? (
        <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm font-semibold text-[#ff8fcb]">
          {displayedInsight.errorMessage}
          {displayedInsight.rateLimited ? ' Offline insight is shown instead.' : ''}
        </div>
      ) : null}

      {displayedInsight.remainingMinuteRequests !== undefined ||
      displayedInsight.remainingDailyRequests !== undefined ? (
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <SmallMetric
            label="Minute budget"
            value={
              displayedInsight.remainingMinuteRequests !== undefined
                ? `${displayedInsight.remainingMinuteRequests} left`
                : '--'
            }
          />
          <SmallMetric
            label="Daily budget"
            value={
              displayedInsight.remainingDailyRequests !== undefined
                ? `${displayedInsight.remainingDailyRequests} left`
                : '--'
            }
          />
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        {displayedInsight.cautions.map((caution) => (
          <div
            key={caution}
            className="rounded-md border border-yellow-300/25 bg-yellow-300/10 p-3 text-sm leading-6 text-yellow-100"
          >
            {caution}
          </div>
        ))}
      </div>
    </div>
  )
}

function BatterySwapCard({
  swapAdvice,
}: {
  swapAdvice?: ReturnType<typeof generatePredictiveStrategy>['swapAdvice']
}) {
  if (!swapAdvice) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
          Battery Swap
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-200">
          Battery swap advisor unavailable
        </p>
      </div>
    )
  }

  const urgencyClass = swapUrgencyStyles[swapAdvice.urgency]

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
            Battery Swap
          </p>
          <p className="mt-2 text-2xl font-black text-white">
            {swapAdvice.action}
          </p>
        </div>
        <span
          className={`w-fit rounded border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${urgencyClass}`}
        >
          {swapAdvice.urgency}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-200">
        {swapAdvice.reason || 'Battery swap advisor unavailable'}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <SmallMetric
          label="Continue SOC"
          value={`${swapAdvice.projectedSocIfContinue.toFixed(1)}%`}
        />
        <SmallMetric
          label="After swap SOC"
          value={`${swapAdvice.projectedSocAfterSwap.toFixed(1)}%`}
        />
        <SmallMetric
          label="Swap mile"
          value={
            swapAdvice.recommendedSwapMile !== undefined
              ? swapAdvice.recommendedSwapMile.toFixed(1)
              : '--'
          }
        />
      </div>
    </div>
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

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  )
}


