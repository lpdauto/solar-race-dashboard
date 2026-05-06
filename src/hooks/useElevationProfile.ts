'use client'

import { useEffect, useMemo, useState } from 'react'
import type { RoutePoint } from '@/data/raceRoute'
import {
  calculateElevationStats,
  fetchElevationProfile,
  type ElevationFetchResult,
} from '@/lib/elevation'

type ElevationHookState = ElevationFetchResult & {
  loading: boolean
}

const elevationCache = new Map<string, Promise<ElevationFetchResult>>()

export function useElevationProfile(day: number, routePoints: RoutePoint[]) {
  const cacheKey = useMemo(
    () => `${day}:${routePoints.map((point) => `${point.mile}-${point.lat}-${point.lng}`).join('|')}`,
    [day, routePoints]
  )

  const [state, setState] = useState<ElevationHookState>({
    profile: [],
    usedFallback: false,
    loading: true,
  })

  useEffect(() => {
    let isMounted = true
    const existingRequest =
      elevationCache.get(cacheKey) ??
      fetchElevationProfile(routePoints, day)

    elevationCache.set(cacheKey, existingRequest)
    setState((current) => ({ ...current, loading: true }))

    existingRequest.then((result) => {
      if (isMounted) {
        setState({
          ...result,
          loading: false,
        })
      }
    })

    return () => {
      isMounted = false
    }
  }, [cacheKey, day, routePoints])

  const stats = useMemo(
    () => calculateElevationStats(state.profile),
    [state.profile]
  )

  return {
    ...state,
    stats,
  }
}
