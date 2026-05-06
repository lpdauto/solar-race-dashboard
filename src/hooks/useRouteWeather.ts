'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RoutePoint } from '@/data/raceRoute'
import {
  cacheWeatherForDay,
  calculateWeatherStrategy,
  createMockWeatherForRoute,
  fetchWeatherForRoutePoints,
  getWeatherCacheAgeText,
  loadCachedWeatherForDay,
  markForecastsAsCache,
} from '@/lib/weatherEngine'
import type {
  WeatherPointForecast,
  WeatherStrategySummary,
} from '@/types/weather'

type SourceSummary = 'Live' | 'Cached' | 'Mock'

export function useRouteWeather(dayNumber: number, routePoints: RoutePoint[]) {
  const [forecasts, setForecasts] = useState<WeatherPointForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sourceSummary, setSourceSummary] = useState<SourceSummary>('Mock')
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  const refreshWeather = useCallback(async () => {
    setLoading(true)
    setError(null)

    const cached = loadCachedWeatherForDay(dayNumber)

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (cached) {
        setForecasts(markForecastsAsCache(cached.forecasts))
        setCachedAt(cached.cachedAt)
        setSourceSummary('Cached')
      } else {
        setForecasts(createMockWeatherForRoute(dayNumber, routePoints))
        setCachedAt(null)
        setSourceSummary('Mock')
      }

      setLoading(false)
      return
    }

    try {
      const liveForecasts = await fetchWeatherForRoutePoints(routePoints)

      if (liveForecasts.length === 0) {
        throw new Error('No live weather points were available.')
      }

      cacheWeatherForDay(dayNumber, liveForecasts)
      setForecasts(liveForecasts)
      setCachedAt(new Date().toISOString())
      setSourceSummary('Live')
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : 'Weather refresh failed.'
      )

      if (cached) {
        setForecasts(markForecastsAsCache(cached.forecasts))
        setCachedAt(cached.cachedAt)
        setSourceSummary('Cached')
      } else {
        setForecasts(createMockWeatherForRoute(dayNumber, routePoints))
        setCachedAt(null)
        setSourceSummary('Mock')
      }
    } finally {
      setLoading(false)
    }
  }, [dayNumber, routePoints])

  useEffect(() => {
    refreshWeather()
  }, [refreshWeather])

  const strategySummary: WeatherStrategySummary = useMemo(
    () => calculateWeatherStrategy(routePoints, forecasts),
    [forecasts, routePoints]
  )

  return {
    forecasts,
    strategySummary,
    loading,
    error,
    sourceSummary,
    refreshWeather,
    cachedAt,
    cacheAgeText: cachedAt ? getWeatherCacheAgeText(cachedAt) : 'No cache',
  }
}
