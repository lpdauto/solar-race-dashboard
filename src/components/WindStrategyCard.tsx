'use client'

import type { WeatherPointForecast, WeatherStrategySummary } from '@/types/weather'

type WindStrategyCardProps = {
  summary: WeatherStrategySummary
  hottestForecast?: WeatherPointForecast
}

export default function WindStrategyCard({
  summary,
  hottestForecast,
}: WindStrategyCardProps) {
  const primaryAction = getPrimaryAction(summary, hottestForecast)

  return (
    <article className="rounded-lg border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
        Wind Strategy
      </p>
      <h3 className="mt-2 text-xl font-black text-white">
        {primaryAction.title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        {primaryAction.action}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniMetric
          label="Max headwind"
          value={`${summary.maxHeadwindMph.toFixed(1)} mph`}
        />
        <MiniMetric
          label="Max crosswind"
          value={`${summary.maxCrosswindMph.toFixed(1)} mph`}
        />
        <MiniMetric
          label="Cloud cover"
          value={`${summary.averageCloudCoverPercent.toFixed(0)}%`}
        />
      </div>
    </article>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-bold text-white">{value}</p>
    </div>
  )
}

function getPrimaryAction(
  summary: WeatherStrategySummary,
  hottestForecast?: WeatherPointForecast
) {
  if (summary.maxHeadwindMph >= 12) {
    return {
      title: 'Headwind energy penalty',
      action:
        'Reduce target speed and expect higher Wh/mile until live telemetry proves the model is stable.',
    }
  }

  if (summary.maxCrosswindMph >= 16) {
    return {
      title: 'Crosswind stability watch',
      action:
        'Watch vehicle stability and avoid aggressive steering corrections or sudden speed changes.',
    }
  }

  if (summary.averageCloudCoverPercent >= 60) {
    return {
      title: 'Reduced solar recovery',
      action:
        'Lower solar recovery expectations and protect battery reserve before climbs or exposed sections.',
    }
  }

  if ((hottestForecast?.temperatureF ?? 0) >= 98) {
    return {
      title: 'Thermal load watch',
      action:
        'High ambient temperature may push controller and motor temps upward. Keep cooling margin.',
    }
  }

  return {
    title: 'Weather supports normal pacing',
    action:
      'Maintain disciplined speed. Do not waste tailwind or solar advantage with unnecessary acceleration.',
  }
}
