'use client'

import { useEffect, useMemo, useState } from 'react'
import type { RoutePoint } from '@/data/raceRoute'
import { useGeolocation } from '@/hooks/useGeolocation'
import {
  classifyGpsAccuracy,
  type RouteMatchConfidence,
} from '@/lib/geo'
import { projectGpsToRoutePolyline } from '@/lib/routeGeometry'

type GpsStatusPanelProps = {
  routePoints: RoutePoint[]
  onMileUpdate: (mile: number) => void
  manualMode: boolean
  setManualMode: (value: boolean) => void
}

const confidenceStyles: Record<RouteMatchConfidence, string> = {
  high: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100',
  low: 'border-orange-400/40 bg-orange-400/10 text-orange-100',
  unreliable: 'border-red-400/40 bg-red-400/10 text-red-100',
}

export default function GpsStatusPanel({
  routePoints,
  onMileUpdate,
  manualMode,
  setManualMode,
}: GpsStatusPanelProps) {
  const geolocation = useGeolocation()
  const [testLat, setTestLat] = useState('')
  const [testLng, setTestLng] = useState('')
  const [testLocation, setTestLocation] = useState<{
    lat: number
    lng: number
    accuracyMeters: number
  } | null>(null)
  const gpsLocation =
    geolocation.latitude !== null && geolocation.longitude !== null
      ? {
          lat: geolocation.latitude,
          lng: geolocation.longitude,
          accuracyMeters: geolocation.accuracyMeters,
        }
      : null
  const currentLocation = testLocation ?? gpsLocation
  const routeMatch = useMemo(
    () =>
      currentLocation
        ? projectGpsToRoutePolyline(currentLocation, routePoints)
        : null,
    [currentLocation, routePoints]
  )
  const activeAccuracyMeters =
    testLocation?.accuracyMeters ?? geolocation.accuracyMeters
  const accuracyClass = classifyGpsAccuracy(activeAccuracyMeters)
  const canAutoUpdate =
    !manualMode &&
    routeMatch !== null &&
    (routeMatch.confidence === 'high' || routeMatch.confidence === 'medium')

  useEffect(() => {
    if (canAutoUpdate && routeMatch) {
      onMileUpdate(routeMatch.estimatedMile)
    }
  }, [canAutoUpdate, routeMatch, onMileUpdate])

  function startGpsMode() {
    setManualMode(false)
    geolocation.startWatching()
  }

  function useTestLocation() {
    const lat = Number(testLat)
    const lng = Number(testLng)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return
    }

    setTestLocation({
      lat,
      lng,
      accuracyMeters: 15,
    })
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-semibold text-teal-200">
            GPS assist mode
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            GPS works offline after the app is loaded. Internet is only needed for initial app load/API data.
          </p>
          <p className="mt-2 inline-flex rounded border border-teal-300/30 bg-teal-300/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-teal-100">
            Polyline snapping active
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startGpsMode}
            className="h-10 rounded-md bg-teal-300 px-3 text-sm font-bold text-slate-950 transition hover:bg-teal-200"
          >
            Start GPS
          </button>
          <button
            type="button"
            onClick={geolocation.stopWatching}
            className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-teal-300/40 hover:bg-white/10"
          >
            Stop GPS
          </button>
          <button
            type="button"
            onClick={() => setManualMode(!manualMode)}
            className={`h-10 rounded-md border px-3 text-sm font-bold transition ${
              manualMode
                ? 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100'
                : 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100'
            }`}
          >
            {manualMode ? 'Manual Mode' : 'GPS Auto Mode'}
          </button>
        </div>
      </div>

      {(geolocation.status === 'unsupported' ||
        geolocation.status === 'permission-denied' ||
        geolocation.status === 'error') && geolocation.errorMessage ? (
        <div className="rounded-md border border-red-400/35 bg-red-400/10 p-3 text-sm leading-6 text-red-100">
          {geolocation.errorMessage}{' '}
          {geolocation.status === 'unsupported'
            ? 'GPS requires a secure context such as HTTPS or localhost.'
            : ''}
        </div>
      ) : null}

      {routeMatch &&
      (routeMatch.confidence === 'low' ||
        routeMatch.confidence === 'unreliable') ? (
        <div className="rounded-md border border-yellow-300/35 bg-yellow-300/10 p-3 text-sm leading-6 text-yellow-100">
          GPS fix is too weak or too far from route. Manual mode recommended.
        </div>
      ) : null}

      {testLocation ? (
        <div className="rounded-md border border-violet-300/35 bg-violet-300/10 p-3 text-sm leading-6 text-violet-100">
          GPS Test Mode is using the entered test location instead of live GPS.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="GPS status" value={formatStatus(geolocation.status)} />
        <Metric label="Fix quality" value={accuracyClass} />
        <Metric
          label="Latitude"
          value={currentLocation?.lat.toFixed(5) ?? 'Waiting'}
        />
        <Metric
          label="Longitude"
          value={currentLocation?.lng.toFixed(5) ?? 'Waiting'}
        />
        <Metric
          label="Accuracy"
          value={
            activeAccuracyMeters !== null && activeAccuracyMeters !== undefined
              ? `${activeAccuracyMeters.toFixed(0)} m`
              : 'Waiting'
          }
        />
        <Metric
          label="Speed"
          value={
            geolocation.speedMps !== null
              ? `${(geolocation.speedMps * 2.23694).toFixed(1)} mph`
              : 'Unavailable'
          }
        />
        <Metric
          label="Heading"
          value={
            geolocation.headingDegrees !== null
              ? `${geolocation.headingDegrees.toFixed(0)} deg`
              : 'Unavailable'
          }
        />
        <Metric
          label="Interpolated mile"
          value={
            routeMatch ? routeMatch.estimatedMile.toFixed(1) : 'Waiting'
          }
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Distance from route
          </p>
          <p className="mt-1 text-2xl font-black text-white">
            {routeMatch
              ? `${routeMatch.distanceFromRouteMeters.toFixed(0)} m`
              : 'Waiting'}
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Confidence
          </p>
          {routeMatch ? (
            <span
              className={`mt-2 inline-flex rounded border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${confidenceStyles[routeMatch.confidence]}`}
            >
              {routeMatch.confidence}
            </span>
          ) : (
            <p className="mt-1 text-2xl font-black text-white">Waiting</p>
          )}
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Last update
          </p>
          <p className="mt-1 text-sm font-bold text-white">
            {geolocation.timestamp
              ? new Date(geolocation.timestamp).toLocaleTimeString()
              : 'No fix yet'}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-white/10 bg-black/20 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Projection segment
        </p>
        <p className="mt-2 text-sm font-bold text-white">
          {routeMatch
            ? `${routeMatch.nearestSegmentStart.label ?? `Mile ${routeMatch.nearestSegmentStart.mile}`} to ${
                routeMatch.nearestSegmentEnd.label ??
                `Mile ${routeMatch.nearestSegmentEnd.mile}`
              } (${Math.round(routeMatch.projectionRatio * 100)}%)`
            : 'Waiting for route match'}
        </p>
      </div>

      <section className="rounded-md border border-white/10 bg-white/[0.035] p-3">
        <h4 className="text-sm font-bold text-white">GPS Test Mode</h4>
        <p className="mt-1 text-sm leading-6 text-slate-400">
          Enter a latitude and longitude to test route snapping without actual GPS.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Test latitude
            </span>
            <input
              value={testLat}
              onChange={(event) => setTestLat(event.target.value)}
              placeholder="30.50830"
              className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-teal-300/60"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Test longitude
            </span>
            <input
              value={testLng}
              onChange={(event) => setTestLng(event.target.value)}
              placeholder="-97.67890"
              className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-teal-300/60"
            />
          </label>
          <button
            type="button"
            onClick={useTestLocation}
            className="h-10 rounded-md bg-teal-300 px-3 text-sm font-bold text-slate-950 transition hover:bg-teal-200"
          >
            Use test location
          </button>
          <button
            type="button"
            onClick={() => setTestLocation(null)}
            className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-teal-300/40 hover:bg-white/10"
          >
            Clear test location
          </button>
        </div>
      </section>
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

function formatStatus(status: string) {
  if (status === 'permission-denied') return 'Permission denied'
  return status.charAt(0).toUpperCase() + status.slice(1)
}
