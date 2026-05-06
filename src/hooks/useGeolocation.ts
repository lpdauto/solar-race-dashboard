'use client'

import { useEffect, useRef, useState } from 'react'

export type GeolocationStatus =
  | 'idle'
  | 'watching'
  | 'error'
  | 'unsupported'
  | 'permission-denied'

export type GeolocationState = {
  latitude: number | null
  longitude: number | null
  accuracyMeters: number | null
  speedMps: number | null
  headingDegrees: number | null
  timestamp: number | null
  status: GeolocationStatus
  errorMessage: string | null
  startWatching: () => void
  stopWatching: () => void
}

const watchOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 10000,
}

export function useGeolocation(): GeolocationState {
  const watchIdRef = useRef<number | null>(null)
  const [state, setState] = useState<
    Omit<GeolocationState, 'startWatching' | 'stopWatching'>
  >({
    latitude: null,
    longitude: null,
    accuracyMeters: null,
    speedMps: null,
    headingDegrees: null,
    timestamp: null,
    status: 'idle',
    errorMessage: null,
  })

  function stopWatching() {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    setState((current) => ({
      ...current,
      status: current.status === 'unsupported' ? 'unsupported' : 'idle',
    }))
  }

  function startWatching() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState((current) => ({
        ...current,
        status: 'unsupported',
        errorMessage:
          'GPS requires a secure context such as HTTPS or localhost.',
      }))
      return
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }

    setState((current) => ({
      ...current,
      status: 'watching',
      errorMessage: null,
    }))

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          speedMps: position.coords.speed,
          headingDegrees: position.coords.heading,
          timestamp: position.timestamp,
          status: 'watching',
          errorMessage: null,
        })
      },
      (error) => {
        const next = mapGeolocationError(error)

        setState((current) => ({
          ...current,
          status: next.status,
          errorMessage: next.message,
        }))
      },
      watchOptions
    )
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  return {
    ...state,
    startWatching,
    stopWatching,
  }
}

function mapGeolocationError(error: GeolocationPositionError): {
  status: GeolocationStatus
  message: string
} {
  if (error.code === error.PERMISSION_DENIED) {
    return {
      status: 'permission-denied',
      message: 'GPS permission was denied.',
    }
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return {
      status: 'error',
      message: 'GPS position is unavailable.',
    }
  }

  if (error.code === error.TIMEOUT) {
    return {
      status: 'error',
      message: 'GPS timed out before getting a fix.',
    }
  }

  return {
    status: 'error',
    message: error.message || 'GPS failed unexpectedly.',
  }
}
