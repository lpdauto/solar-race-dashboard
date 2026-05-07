'use client'

import type { RoutePoint } from '@/data/raceRoute'
import { useRouteWeather } from '@/hooks/useRouteWeather'
import type { WeatherRisk } from '@/types/weather'
import WindStrategyCard from '@/components/WindStrategyCard'

type WeatherWindPanelProps = {
  dayNumber: number
  routePoints: RoutePoint[]
  currentMile?: number
  currentRaceSpeedMph?: number
}

const riskStyles: Record<WeatherRisk, string> = {
  low: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100',
  high: 'border-orange-400/40 bg-orange-400/10 text-orange-100',
  severe: 'border-red-400/40 bg-red-400/10 text-[#ff8fcb]',
}

export default function WeatherWindPanel({
  dayNumber,
  routePoints,
  currentMile,
  currentRaceSpeedMph,
}: WeatherWindPanelProps) {
  const {
    forecasts,
    strategySummary,
    loading,
    error,
    sourceSummary,
    refreshWeather,
    cacheAgeText,
  } = useRouteWeather(dayNumber, routePoints)
  const hottestForecast = forecasts.reduce(
    (hottest, forecast) =>
      !hottest || forecast.temperatureF > hottest.temperatureF
        ? forecast
        : hottest,
    forecasts[0]
  )

  return (
    <section className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <h3 className="text-base font-bold text-white">Weather + Wind Engine</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Weather adjustments are advisory in Phase 11. Phase 12/13 can feed wind and solar radiation into the energy model.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            label={strategySummary.weatherRisk}
            className={riskStyles[strategySummary.weatherRisk]}
          />
          <Badge
            label={sourceSummary}
            className="border-violet-300/30 bg-violet-300/10 text-violet-100"
          />
          <button
            type="button"
            onClick={refreshWeather}
            className="h-9 rounded-md bg-[#ff3ea5] px-3 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f]"
          >
            Refresh weather
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-md border border-white/10 bg-black/20 p-4 text-sm font-semibold text-[#ff8fcb]">
          Loading weather strategy...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-yellow-300/30 bg-yellow-300/10 p-3 text-sm leading-6 text-yellow-100">
          Live weather unavailable: {error}. Using {sourceSummary.toLowerCase()} weather.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Avg headwind" value={`${strategySummary.averageHeadwindMph.toFixed(1)} mph`} />
        <Metric label="Max headwind" value={`${strategySummary.maxHeadwindMph.toFixed(1)} mph`} />
        <Metric label="Max crosswind" value={`${strategySummary.maxCrosswindMph.toFixed(1)} mph`} />
        <Metric label="Avg cloud cover" value={`${strategySummary.averageCloudCoverPercent.toFixed(0)}%`} />
        <Metric label="Avg solar" value={`${strategySummary.averageSolarRadiationWm2.toFixed(0)} W/m2`} />
        <Metric label="Speed adjustment" value={`${strategySummary.recommendedSpeedAdjustmentMph} mph`} />
      </div>

      <WindStrategyCard
        summary={strategySummary}
        hottestForecast={hottestForecast}
      />

      <div className="grid gap-2">
        {strategySummary.notes.map((note) => (
          <div
            key={note}
            className="rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-200"
          >
            {note}
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric
          label="Current mile"
          value={currentMile !== undefined ? currentMile.toFixed(1) : 'Manual'}
        />
        <Metric
          label="Race speed"
          value={
            currentRaceSpeedMph !== undefined
              ? `${currentRaceSpeedMph.toFixed(1)} mph`
              : 'Telemetry optional'
          }
        />
        <Metric label="Cache age" value={cacheAgeText} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {forecasts
          .slice()
          .sort((a, b) => a.routePointMile - b.routePointMile)
          .map((forecast) => (
            <article
              key={`${forecast.routePointMile}-${forecast.lat}-${forecast.lng}`}
              className="rounded-lg border border-white/10 bg-black/20 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">
                    Mile {forecast.routePointMile}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {forecast.label ?? `${forecast.lat.toFixed(2)}, ${forecast.lng.toFixed(2)}`}
                  </p>
                </div>
                <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs font-bold uppercase text-slate-300">
                  {forecast.source}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <ForecastMetric label="Temp" value={`${forecast.temperatureF.toFixed(0)}F`} />
                <ForecastMetric label="Wind" value={`${forecast.windSpeedMph.toFixed(0)} mph`} />
                <ForecastMetric label="Gust" value={forecast.windGustMph ? `${forecast.windGustMph.toFixed(0)} mph` : '--'} />
                <ForecastMetric label="Clouds" value={`${forecast.cloudCoverPercent.toFixed(0)}%`} />
                <ForecastMetric label="Rain" value={forecast.precipitationProbabilityPercent !== undefined ? `${forecast.precipitationProbabilityPercent}%` : '--'} />
                <ForecastMetric label="Solar" value={forecast.shortwaveRadiationWm2 !== undefined ? `${forecast.shortwaveRadiationWm2.toFixed(0)}` : '--'} />
              </dl>
            </article>
          ))}
      </div>
    </section>
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

function ForecastMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-100">{value}</dd>
    </div>
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


