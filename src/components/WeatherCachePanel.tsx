'use client'

import { useEffect, useState } from 'react'
import type { RaceDay } from '@/data/raceRoute'
import {
  cacheWeatherForDay,
  clearCachedWeatherForDay,
  createMockWeatherForRoute,
  fetchWeatherForRoutePoints,
  getWeatherCacheAgeText,
  loadCachedWeatherForDay,
} from '@/lib/weatherEngine'

type WeatherCachePanelProps = {
  raceRoute: RaceDay[]
}

type CacheStatus = {
  dayNumber: number
  exists: boolean
  ageText: string
  source: string
}

export default function WeatherCachePanel({ raceRoute }: WeatherCachePanelProps) {
  const [statuses, setStatuses] = useState<CacheStatus[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function refreshStatuses() {
    setStatuses(
      raceRoute.map((raceDay) => {
        const cached = loadCachedWeatherForDay(raceDay.day)
        const firstForecast = cached?.forecasts[0]

        return {
          dayNumber: raceDay.day,
          exists: Boolean(cached),
          ageText: cached ? getWeatherCacheAgeText(cached.cachedAt) : 'No cache',
          source: firstForecast?.source ?? 'none',
        }
      })
    )
  }

  useEffect(() => {
    refreshStatuses()
  }, [])

  function clearWeatherCache() {
    raceRoute.forEach((raceDay) => clearCachedWeatherForDay(raceDay.day))
    refreshStatuses()
    setMessage('Weather cache cleared.')
  }

  async function preloadAllDays() {
    setLoading(true)
    setMessage(null)

    for (const raceDay of raceRoute) {
      try {
        const forecasts = navigator.onLine
          ? await fetchWeatherForRoutePoints(raceDay.routePoints)
          : []

        cacheWeatherForDay(
          raceDay.day,
          forecasts.length > 0
            ? forecasts
            : createMockWeatherForRoute(raceDay.day, raceDay.routePoints)
        )
      } catch {
        cacheWeatherForDay(
          raceDay.day,
          createMockWeatherForRoute(raceDay.day, raceDay.routePoints)
        )
      }
    }

    refreshStatuses()
    setLoading(false)
    setMessage('Weather cache preload complete.')
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-bold text-white">Weather Cache</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Weather requires internet to refresh. Cached weather remains available offline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={preloadAllDays}
            disabled={loading}
            className="h-10 rounded-md bg-[#ff3ea5] px-3 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f] disabled:opacity-60"
          >
            {loading ? 'Preloading...' : 'Preload all days'}
          </button>
          <button
            type="button"
            onClick={clearWeatherCache}
            className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10"
          >
            Clear weather cache
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-md border border-[#ff3ea5]/30 bg-[#ff3ea5]/10 p-3 text-sm leading-6 text-[#ff8fcb]">
          {message}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statuses.map((status) => (
          <div
            key={status.dayNumber}
            className="rounded-md border border-white/10 bg-black/20 p-3"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Day {status.dayNumber}
            </p>
            <p
              className={`mt-2 text-lg font-bold ${
                status.exists ? 'text-emerald-200' : 'text-yellow-100'
              }`}
            >
              {status.exists ? 'Cached' : 'Missing'}
            </p>
            <p className="mt-1 text-sm text-slate-400">{status.ageText}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
              {status.source}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}


