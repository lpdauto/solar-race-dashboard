'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import ConnectionStatusStrip from '@/components/ConnectionStatusStrip'
import CourseMap from '@/components/CourseMap'
import { raceRoute, type RiskLevel } from '@/data/raceRoute'
import { useTelemetry } from '@/hooks/useTelemetry'
import { getLiveTelemetryGpsPosition } from '@/lib/liveTelemetryGps'
import { calculatePublicRouteProgress } from '@/lib/publicRaceRoute'
import {
  normalizeVehicleLocationFromGpsProviderStatus,
  type VehicleLocationGpsProviderStatus,
} from '@/lib/vehicleLocation'

const riskStyles: Record<RiskLevel, string> = {
  low: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100',
  high: 'border-orange-400/40 bg-orange-400/10 text-orange-100',
  severe: 'border-red-400/40 bg-red-400/10 text-[#ff8fcb]',
}

export default function HomePage() {
  const [courseMapExpanded, setCourseMapExpanded] = useState(false)
  const telemetryController = useTelemetry()
  const [gpsProviderStatus, setGpsProviderStatus] =
    useState<VehicleLocationGpsProviderStatus | null>(null)
  const vehicleLocation = useMemo(
    () => normalizeVehicleLocationFromGpsProviderStatus(gpsProviderStatus),
    [gpsProviderStatus]
  )

  useEffect(() => {
    let cancelled = false

    async function pollGpsProviderStatus() {
      try {
        const response = await fetch('/api/vehicle/gps/status', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })

        if (!response.ok) return

        const nextStatus =
          (await response.json()) as VehicleLocationGpsProviderStatus

        if (!cancelled) {
          setGpsProviderStatus(nextStatus)
        }
      } catch {
        // Keep the last known vehicle location through temporary API read failures.
      }
    }

    void pollGpsProviderStatus()
    const intervalId = window.setInterval(pollGpsProviderStatus, 5000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  const vehicleTelemetryLive =
    telemetryController.effectiveStatus === 'connected' ||
    telemetryController.effectiveStatus === 'simulated'
  const telemetryLiveGps = vehicleTelemetryLive
    ? getLiveTelemetryGpsPosition(telemetryController.telemetry)
    : null
  const liveGps =
    vehicleLocation.source === 'phone' &&
    typeof vehicleLocation.latitude === 'number' &&
    typeof vehicleLocation.longitude === 'number'
      ? {
          lat: vehicleLocation.latitude,
          lng: vehicleLocation.longitude,
          fix: vehicleLocation.status === 'online' || vehicleLocation.status === 'stale',
          ageMs: vehicleLocation.ageMs ?? undefined,
          heading: vehicleLocation.heading ?? undefined,
          elevationFt: vehicleLocation.altitudeFeet ?? undefined,
        }
      : telemetryLiveGps
  const routeProgress = liveGps
    ? calculatePublicRouteProgress({ lat: liveGps.lat, lng: liveGps.lng })
    : null
  const currentVehicleMapLocation = liveGps
    ? {
        ...liveGps,
        label:
          routeProgress?.confidence === 'off-route'
            ? 'Live cloud GPS - off route / test location'
            : vehicleLocation.source === 'phone'
              ? `Vehicle GPS - Android phone (${vehicleLocation.status})`
              : 'Live cloud GPS',
      }
    : undefined

  return (
    <main className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="relative overflow-hidden rounded-lg border border-[#ff3ea5]/20 bg-[#050505] p-4 shadow-2xl shadow-black/20 sm:p-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage: "url('/racer-x2-mark.svg')",
              backgroundPosition: 'center 45%',
              backgroundRepeat: 'no-repeat',
              backgroundSize: 'min(64rem, 88vw)',
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(255,62,165,0.18),transparent_22rem),linear-gradient(90deg,rgba(0,0,0,0.1),rgba(0,0,0,0.76))]" />
          <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff8fcb]">
                2026 Cross-Texas Solar Car Challenge
              </p>
              <h1 className="mt-3 flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 text-3xl font-black text-white sm:text-4xl">
                <span className="font-black italic tracking-tight text-[#ff3ea5] drop-shadow-[0_0_16px_rgba(255,62,165,0.45)]">
                  RACER X²
                </span>
                <span>Solar Race Strategy</span>
                <span>Dashboard</span>
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Interactive route navigation, terrain risk, and energy planning for Temple City&apos;s all-female solar car team.
              </p>
            </div>
            <ConnectionStatusStrip
              liveGps={liveGps}
              vehicleLocation={vehicleLocation}
              telemetryStatus={telemetryController.effectiveStatus}
              telemetryConnectionError={telemetryController.connectionError}
              cloudHealth={telemetryController.cloudHealth}
              vehiclePacketAgeSeconds={telemetryController.effectivePacketAgeSeconds}
              telemetryConnected={vehicleTelemetryLive}
            />
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {raceRoute.map((raceDay) => (
            <article
              key={raceDay.day}
              className="flex min-h-64 flex-col rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-[#ff3ea5]/40 hover:bg-white/[0.07]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#ff8fcb]">
                    Day {raceDay.day}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-white">
                    {raceDay.start.split(',')[0]} to {raceDay.end.split(',')[0]}
                  </h2>
                </div>
                <RiskBadge risk={raceDay.riskLevel} />
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <dt className="text-slate-400">Miles</dt>
                  <dd className="mt-1 font-semibold text-white">
                    {raceDay.distanceMiles.toFixed(1)}
                  </dd>
                </div>
                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <dt className="text-slate-400">Date</dt>
                  <dd className="mt-1 font-semibold text-white">
                    {raceDay.date.replace(', 2026', '')}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                {raceDay.highways.map((highway) => (
                  <span
                    key={highway}
                    className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-slate-200"
                  >
                    {highway}
                  </span>
                ))}
              </div>

              <Link
                href={`/day/${raceDay.day}/race-captain`}
                className="mt-auto inline-flex h-11 items-center justify-center rounded-md bg-[#ff3ea5] px-4 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f]"
              >
                View Day
              </Link>
            </article>
          ))}
        </section>

        <CollapsibleTile
          title="Overall Course Map"
          expanded={courseMapExpanded}
          onToggle={() => setCourseMapExpanded((expanded) => !expanded)}
        >
          {courseMapExpanded ? (
            <CourseMap
              days={raceRoute}
              currentLocation={currentVehicleMapLocation}
              heightClass="h-[360px] md:h-[500px]"
            />
          ) : null}
        </CollapsibleTile>
      </div>
    </main>
  )
}

function CollapsibleTile({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <span className="rounded border border-[#ff3ea5]/30 bg-[#ff3ea5]/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-[#ff8fcb]">
          {expanded ? 'Collapse' : 'Expand'}
        </span>
      </button>
      {expanded ? <div className="mt-4">{children}</div> : null}
    </section>
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




