'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import {
  publicRaceSponsors,
  type PublicRaceStatus,
} from '@/lib/publicRaceStatus'

type FetchState = 'loading' | 'live' | 'offline'

const PublicRaceLeafletMap = dynamic(() => import('./PublicRaceLeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] items-center justify-center bg-[#050505] text-sm font-bold text-slate-300 md:h-[520px]">
      Loading race map...
    </div>
  ),
})

const mockFallback: PublicRaceStatus = {
  speedMph: 28.4,
  avgSpeedMph: 26.9,
  currentPlace: '3rd',
  placeTotal: 22,
  standingsSourceUrl: 'https://www.solarcarchallenge.org/',
  standingsLastUpdated: 'Waiting for standings',
  milesCompleted: 142.6,
  milesLeft: 477.2,
  totalMiles: 619.8,
  currentTime: '--:--',
  weatherLocation: 'Palestine, TX',
  weatherTempF: 91,
  weatherCondition: 'Sunny',
  weatherWindMph: 8,
  weatherWindDirection: 'SE',
  currentDay: 2,
  totalDays: 5,
  currentSegment: 'Palestine to Hearne',
  nextStop: 'Hearne checkpoint',
  eta: '2:36 PM',
  status: 'On target',
  lat: 31.7621,
  lng: -95.6308,
  routeProgressPct: 23,
  instagramUrl: 'https://www.instagram.com/',
  sponsors: publicRaceSponsors,
}

export default function RaceTrackerClient() {
  const [raceStatus, setRaceStatus] = useState<PublicRaceStatus>(mockFallback)
  const [fetchState, setFetchState] = useState<FetchState>('loading')
  const [lastUpdated, setLastUpdated] = useState<string>('Waiting for update')

  useEffect(() => {
    let cancelled = false

    async function loadRaceStatus() {
      try {
        const response = await fetch('/api/public-race-status', {
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = (await response.json()) as PublicRaceStatus

        if (!cancelled) {
          setRaceStatus(data)
          setFetchState('live')
          setLastUpdated(new Date().toLocaleTimeString())
        }
      } catch {
        if (!cancelled) {
          setFetchState('offline')
        }
      }
    }

    loadRaceStatus()
    const intervalId = window.setInterval(loadRaceStatus, 10_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  const progressPercent = raceStatus.routeProgressPct
  const leftSponsors = raceStatus.sponsors.filter((_, index) => index % 2 === 0)
  const rightSponsors = raceStatus.sponsors.filter((_, index) => index % 2 === 1)

  return (
    <main className="min-h-screen bg-[#080808] px-3 py-4 text-white sm:px-5 lg:px-8">
      <div className="mx-auto grid max-w-[1540px] grid-cols-1 gap-4 xl:grid-cols-[150px_minmax(0,1fr)_150px] 2xl:grid-cols-[180px_minmax(0,1fr)_180px]">
        <SponsorRail sponsors={leftSponsors} />

        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <header className="flex flex-col gap-3 rounded-lg border border-[#ff3ea5]/25 bg-[#101010] p-4 shadow-2xl shadow-black/25 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff8fcb]">
              Public Race Feed
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
              RX2 Live Race Tracker
            </h1>
            <p className="mt-2 text-sm font-bold text-slate-300 sm:text-base">
              Solar Car Challenge 2026 · Day {raceStatus.currentDay} of{' '}
              {raceStatus.totalDays} · Fort Worth → Fort Stockton
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <span
              className={`rounded-md border px-3 py-2 ${
                fetchState === 'live'
                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                  : fetchState === 'loading'
                  ? 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100'
                  : 'border-red-400/30 bg-red-400/10 text-red-100'
              }`}
            >
              {fetchState === 'live'
                ? 'Live mock feed'
                : fetchState === 'loading'
                ? 'Loading feed'
                : 'Using last update'}
            </span>
            <span className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-slate-300">
              Updated {lastUpdated}
            </span>
          </div>
        </header>

        <section className="overflow-hidden rounded-lg border border-white/10 bg-[#101010] shadow-2xl shadow-black/25">
          <PublicRaceLeafletMap raceStatus={raceStatus} />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricTile label="Current Speed" value={`${raceStatus.speedMph.toFixed(1)} mph`} accent="blue" />
          <MetricTile label="Average Speed" value={`${raceStatus.avgSpeedMph.toFixed(1)} mph`} accent="pink" />
          <MetricTile
            label="Current Place"
            value={`${raceStatus.currentPlace} of ${raceStatus.placeTotal}`}
            detail={`Standings ${raceStatus.standingsLastUpdated}`}
            accent="green"
          />
          <MetricTile
            label="Total Miles Completed / Miles Left"
            value={`${raceStatus.milesCompleted.toFixed(1)} / ${raceStatus.milesLeft.toFixed(1)}`}
            detail={`${progressPercent.toFixed(0)}% complete`}
            accent="orange"
          />
          <MetricTile label="Current Time" value={raceStatus.currentTime} accent="yellow" />
          <MetricTile
            label="Weather"
            value={`${raceStatus.weatherTempF}°F`}
            detail={`${raceStatus.weatherCondition} · ${raceStatus.weatherLocation} · Wind ${raceStatus.weatherWindMph} mph ${raceStatus.weatherWindDirection}`}
            accent="white"
          />
        </section>

        <section className="rounded-lg border border-white/10 bg-[#101010] p-4 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff8fcb]">
                Current Race Status
              </p>
              <h2 className="mt-1 text-2xl font-black text-white">
                {raceStatus.status}
              </h2>
            </div>
            <p className="text-sm font-bold text-slate-300">
              ETA {raceStatus.eta}
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatusField label="Current day" value={`Day ${raceStatus.currentDay} of ${raceStatus.totalDays}`} />
            <StatusField label="Current segment" value={raceStatus.currentSegment} />
            <StatusField label="Next stop" value={raceStatus.nextStop} />
            <StatusField label="ETA" value={raceStatus.eta} />
            <StatusField label="Status" value={raceStatus.status} />
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-[#101010] p-4 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff8fcb]">
                Latest Race Updates
              </p>
              <p className="mt-2 text-sm font-bold text-slate-300">
                Follow our daily photos and race updates on Instagram.
              </p>
            </div>
            <a
              href={raceStatus.instagramUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-[#ff3ea5]/40 bg-[#ff3ea5]/10 px-4 py-2 text-sm font-black text-white hover:bg-[#ff3ea5]/20"
            >
              View Instagram Updates
            </a>
          </div>
        </section>

        <SponsorGrid sponsors={raceStatus.sponsors} />
        </div>

        <SponsorRail sponsors={rightSponsors} />
      </div>
    </main>
  )
}

function SponsorRail({
  sponsors,
}: {
  sponsors: Array<{ name: string; logoUrl?: string; sponsorUrl?: string }>
}) {
  return (
    <aside className="hidden xl:flex">
      <div className="sticky top-4 flex w-full flex-col gap-3">
        {sponsors.map((sponsor) => (
          <SponsorLogo key={sponsor.name} sponsor={sponsor} />
        ))}
      </div>
    </aside>
  )
}

function SponsorGrid({
  sponsors,
}: {
  sponsors: Array<{ name: string; logoUrl?: string; sponsorUrl?: string }>
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:hidden">
      {sponsors.map((sponsor) => (
        <SponsorLogo key={sponsor.name} sponsor={sponsor} />
      ))}
    </section>
  )
}

function SponsorLogo({
  sponsor,
}: {
  sponsor: { name: string; logoUrl?: string; sponsorUrl?: string }
}) {
  const content = (
    <>
      {sponsor.logoUrl ? (
        <img
          src={sponsor.logoUrl}
          alt={`${sponsor.name} logo`}
          loading="lazy"
          className="max-h-14 w-full object-contain"
        />
      ) : (
        <span className="text-center text-sm font-black text-slate-950">
          {sponsor.name}
        </span>
      )}
    </>
  )

  if (sponsor.sponsorUrl && sponsor.sponsorUrl !== '#') {
    return (
      <a
        href={sponsor.sponsorUrl}
        target="_blank"
        rel="noreferrer"
        title={sponsor.name}
        className="flex min-h-20 items-center justify-center rounded-lg border border-[#ff3ea5]/20 bg-white p-3 shadow-xl shadow-black/20"
      >
        {content}
      </a>
    )
  }

  return (
    <div
      title={sponsor.name}
      className="flex min-h-20 items-center justify-center rounded-lg border border-[#ff3ea5]/20 bg-white p-3 shadow-xl shadow-black/20"
    >
      {content}
    </div>
  )
}

function MetricTile({
  label,
  value,
  detail,
  accent,
}: {
  label: string
  value: string
  detail?: string
  accent: 'blue' | 'pink' | 'green' | 'orange' | 'yellow' | 'white'
}) {
  const colorClass = {
    blue: 'text-sky-300',
    pink: 'text-[#ff8fcb]',
    green: 'text-emerald-300',
    orange: 'text-orange-300',
    yellow: 'text-yellow-200',
    white: 'text-white',
  }[accent]

  return (
    <div className="rounded-lg border border-white/10 bg-[#101010] p-4 shadow-xl shadow-black/20">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className={`mt-3 text-2xl font-black ${colorClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-sm font-bold text-slate-400">{detail}</p> : null}
    </div>
  )
}

function StatusField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/30 p-3">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-base font-black text-white">{value}</p>
    </div>
  )
}
