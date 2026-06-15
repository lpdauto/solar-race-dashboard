'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useEffect, useState, type ReactNode } from 'react'
import { findTeamMemberById, type TeamMember } from '@/data/teamMembers'
import {
  emptyPublicRaceCrew,
  loadPublicRaceCrew,
  publicRaceCrewChangedEventName,
  publicRaceCrewStorageKey,
  type PublicRaceCrewSelection,
} from '@/lib/publicRaceCrew'
import {
  publicRaceSponsors,
  type PublicRaceStatus,
} from '@/lib/publicRaceStatus'
import {
  syncPublicRaceJournal,
  visiblePublicJournalPosts,
  type PublicJournalPost,
} from '@/lib/publicRaceJournal'

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
  dataSource: 'mock',
  telemetryAgeSeconds: null,
  telemetryUpdatedAt: null,
  routeConfidence: 'unavailable',
  distanceFromRouteMeters: null,
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

const supportUrl = 'https://buymeacoffee.com/racerx2'
// Conservative public polling protects Upstash free-tier command limits as fans leave tracker tabs open.
const publicRaceStatusPollIntervalMs = 30_000
const publicRaceCrewPollIntervalMs = 60_000

export default function RaceTrackerClient() {
  const [raceStatus, setRaceStatus] = useState<PublicRaceStatus>(mockFallback)
  const [fetchState, setFetchState] = useState<FetchState>('loading')
  const [lastUpdated, setLastUpdated] = useState<string>('Waiting for update')
  const [currentCrew, setCurrentCrew] =
    useState<PublicRaceCrewSelection>(emptyPublicRaceCrew)
  const [journalPosts, setJournalPosts] = useState<PublicJournalPost[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadRaceStatus() {
      if (document.visibilityState !== 'visible') return

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

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void loadRaceStatus()
      }
    }

    void loadRaceStatus()
    const intervalId = window.setInterval(
      loadRaceStatus,
      publicRaceStatusPollIntervalMs
    )
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function syncCurrentCrew() {
      if (document.visibilityState !== 'visible') return

      const nextCrew = await loadPublicRaceCrew()

      if (!cancelled) {
        setCurrentCrew(nextCrew)
      }
    }

    function syncStoredCurrentCrew(event: StorageEvent) {
      if (event.key === publicRaceCrewStorageKey) {
        syncCurrentCrew()
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void syncCurrentCrew()
      }
    }

    void syncCurrentCrew()
    const intervalId = window.setInterval(
      syncCurrentCrew,
      publicRaceCrewPollIntervalMs
    )
    window.addEventListener(publicRaceCrewChangedEventName, syncCurrentCrew)
    window.addEventListener('storage', syncStoredCurrentCrew)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener(publicRaceCrewChangedEventName, syncCurrentCrew)
      window.removeEventListener('storage', syncStoredCurrentCrew)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    setJournalPosts(
      syncPublicRaceJournal({
        raceStatus,
        currentCrew,
      })
    )
  }, [raceStatus, currentCrew])

  const progressPercent = raceStatus.routeProgressPct
  const leftSponsors = raceStatus.sponsors.filter((_, index) => index % 2 === 0)
  const rightSponsors = raceStatus.sponsors.filter((_, index) => index % 2 === 1)
  const driver = findTeamMemberById(currentCrew.driverId)
  const passenger = findTeamMemberById(currentCrew.passengerId)
  const visibleJournal = visiblePublicJournalPosts(journalPosts).slice(0, 4)
  return (
    <main className="min-h-screen bg-[#080808] px-2 py-2 text-white sm:px-5 sm:py-4 lg:px-8">
      <div className="mx-auto grid max-w-[1540px] grid-cols-1 gap-3 xl:grid-cols-[150px_minmax(0,1fr)_150px] xl:gap-4 2xl:grid-cols-[180px_minmax(0,1fr)_180px]">
        <SponsorRail
          sponsors={leftSponsors}
          crewCard={<PublicCrewCard label="Driver" member={driver} />}
        />

        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:gap-4">
        <header className="flex flex-col gap-2 rounded-lg border border-[#ff3ea5]/25 bg-[#101010] p-3 shadow-2xl shadow-black/25 sm:flex-row sm:items-end sm:justify-between sm:p-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff8fcb] sm:text-xs">
              Public Race Feed
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:mt-2 sm:text-4xl">
              RX2 Live Race Tracker
            </h1>
            <p className="mt-1 text-xs font-bold text-slate-300 sm:mt-2 sm:text-base">
              Solar Car Challenge 2026 · Day {raceStatus.currentDay} of{' '}
              {raceStatus.totalDays} · Fort Worth → Fort Stockton
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold sm:gap-2 sm:text-sm">
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
                ? raceStatus.dataSource === 'telemetry'
                  ? 'Live telemetry feed'
                  : 'Public demo feed'
                : fetchState === 'loading'
                ? 'Loading feed'
                : 'Using last update'}
            </span>
            <span className="rounded-md border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-sky-100">
              {raceStatus.dataSource === 'telemetry'
                ? telemetryFreshnessLabel(raceStatus.telemetryAgeSeconds)
                : 'Telemetry standby'}
            </span>
            <span className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-slate-300">
              Updated {lastUpdated}
            </span>
          </div>
        </header>

        <section className="overflow-hidden rounded-lg border border-white/10 bg-[#101010] shadow-2xl shadow-black/25">
          <PublicRaceLeafletMap raceStatus={raceStatus} />
        </section>

        <section className="grid gap-2 xl:hidden sm:grid-cols-2">
          <PublicCrewCard label="Driver" member={driver} compact />
          <PublicCrewCard label="Passenger" member={passenger} compact />
        </section>

        <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <MetricTile label="Current Speed" value={`${raceStatus.speedMph.toFixed(1)} mph`} accent="hot" />
          <MetricTile label="Average Speed" value={`${raceStatus.avgSpeedMph.toFixed(1)} mph`} accent="rose" />
          <MetricTile
            label="Current Place"
            value={`${raceStatus.currentPlace} of ${raceStatus.placeTotal}`}
            detail={`Standings ${raceStatus.standingsLastUpdated}`}
            accent="blush"
          />
          <MetricTile
            label="Total Miles Completed / Miles Left"
            value={`${raceStatus.milesCompleted.toFixed(1)} / ${raceStatus.milesLeft.toFixed(1)}`}
            detail={`${progressPercent.toFixed(0)}% complete`}
            accent="magenta"
          />
          <MetricTile label="Current Time" value={raceStatus.currentTime} accent="pale" />
          <MetricTile
            label="Weather"
            value={`${raceStatus.weatherTempF}°F`}
            detail={`${raceStatus.weatherCondition} · ${raceStatus.weatherLocation} · Wind ${raceStatus.weatherWindMph} mph ${raceStatus.weatherWindDirection}`}
            accent="soft"
          />
        </section>

        <section className="rounded-lg border border-white/10 bg-[#101010] p-3 shadow-xl shadow-black/20 sm:p-4">
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
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-3 lg:grid-cols-6">
            <StatusField label="Current day" value={`Day ${raceStatus.currentDay} of ${raceStatus.totalDays}`} />
            <StatusField label="Current segment" value={raceStatus.currentSegment} />
            <StatusField label="Next stop" value={raceStatus.nextStop} />
            <StatusField label="ETA" value={raceStatus.eta} />
            <StatusField label="Status" value={raceStatus.status} />
            <StatusField
              label="GPS confidence"
              value={routeConfidenceLabel(
                raceStatus.routeConfidence,
                raceStatus.distanceFromRouteMeters
              )}
            />
          </div>
        </section>

        <FuelTheCrewWidget />

        <LatestTeamJournal posts={visibleJournal} />

        <SponsorGrid sponsors={raceStatus.sponsors} />
        </div>

        <SponsorRail
          sponsors={rightSponsors}
          crewCard={<PublicCrewCard label="Passenger" member={passenger} />}
        />
      </div>
    </main>
  )
}

function telemetryFreshnessLabel(ageSeconds: number | null) {
  if (ageSeconds === null) return 'Telemetry age unknown'
  if (ageSeconds < 5) return 'Telemetry fresh'
  if (ageSeconds < 60) return `${ageSeconds}s telemetry age`
  return `${Math.round(ageSeconds / 60)}m telemetry delay`
}

function routeConfidenceLabel(
  confidence: PublicRaceStatus['routeConfidence'],
  distanceMeters: number | null
) {
  if (confidence === 'unavailable') return 'Waiting for GPS'

  const distanceLabel =
    distanceMeters === null
      ? ''
      : ` - ${
          distanceMeters < 1000
            ? `${distanceMeters} m`
            : `${(distanceMeters / 1000).toFixed(1)} km`
        } off route`

  return `${confidence}${distanceLabel}`
}

function FuelTheCrewWidget() {
  return (
    <section className="rounded-lg border border-[#ff3ea5]/35 bg-[#140711] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff8fcb]">
            Support the Road Crew
          </p>
          <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">Fuel the Crew</h2>
          <p className="mt-1 text-sm font-bold leading-5 text-slate-300 sm:mt-2 sm:leading-6">
            Help keep the students fed, hydrated, and smiling between stops.
          </p>
        </div>
        <a
          href={supportUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center rounded-md border border-[#ff8fcb]/50 bg-[#ff3ea5]/10 p-2 transition hover:-translate-y-0.5 hover:bg-[#ff3ea5]/20 sm:w-auto"
        >
          <img
            src="/race-images/support/buy-me-a-coffee-button.png"
            alt="Buy me a coffee"
            className="h-12 w-auto"
          />
        </a>
      </div>
    </section>
  )
}

function LatestTeamJournal({ posts }: { posts: PublicJournalPost[] }) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#101010] p-4 shadow-xl shadow-black/20">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff8fcb]">
          Latest Team Journal
        </p>
        <h2 className="mt-1 text-2xl font-black text-white">
          Notes from the route
        </h2>
      </div>

      {posts.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {posts.map((post) => (
            <article
              key={post.id}
              className="rounded-md border border-white/10 bg-black/25 p-4"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-black text-white">{post.title}</h3>
                  <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    Day {post.day} - {post.city}
                  </p>
                </div>
                <p className="text-sm font-bold text-slate-400">
                  {formatJournalTime(post.publishAt)}
                </p>
              </div>
              <p className="mt-3 text-sm font-bold leading-6 text-slate-300">
                {post.message}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-white/10 bg-black/25 p-4 text-sm font-bold leading-6 text-slate-300">
          Coming soon.
        </p>
      )}
    </section>
  )
}

function formatJournalTime(timestamp: string) {
  const parsed = Date.parse(timestamp)

  if (!Number.isFinite(parsed)) return 'Posting soon'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  }).format(new Date(parsed))
}

function SponsorRail({
  sponsors,
  crewCard,
}: {
  sponsors: Array<{ name: string; logoUrl?: string; sponsorUrl?: string }>
  crewCard?: ReactNode
}) {
  return (
    <aside className="hidden xl:flex">
      <div className="sticky top-4 flex w-full flex-col gap-3">
        {sponsors.map((sponsor) => (
          <SponsorLogo key={sponsor.name} sponsor={sponsor} />
        ))}
        {crewCard}
      </div>
    </aside>
  )
}

function PublicCrewCard({
  label,
  member,
  compact = false,
}: {
  label: 'Driver' | 'Passenger'
  member: TeamMember | null
  compact?: boolean
}) {
  return (
    <section className="rounded-lg border border-[#ff3ea5]/35 bg-[#140711] p-2.5 shadow-xl shadow-black/20 sm:p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff8fcb] sm:text-xs">
        Current {label}
      </p>
      <div
        className={`mt-2 gap-3 sm:mt-3 ${
          compact ? 'flex items-center sm:grid' : 'grid'
        }`}
      >
        <div
          className={`relative shrink-0 overflow-hidden rounded-md border border-[#ff8fcb]/35 bg-black ${
            compact ? 'h-24 w-24 sm:h-auto sm:w-full sm:aspect-square' : 'aspect-square w-full'
          }`}
        >
          {member?.imageSrc ? (
            <Image
              src={member.imageSrc}
              alt={member.imageAlt}
              fill
              sizes="(min-width: 1280px) 150px, (min-width: 640px) 45vw, 100vw"
              className="scale-125 object-cover object-[center_68%]"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-3xl font-black text-[#ff8fcb]/70 sm:text-5xl">
              ?
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-black leading-tight text-white sm:text-xl xl:text-lg 2xl:text-xl">
            {member?.name ?? 'Unassigned'}
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-300 sm:mt-2 sm:text-sm">
            {member?.role ?? 'Set in Operations'}
          </p>
        </div>
      </div>
    </section>
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
  const showNameWithLogo = sponsor.name === 'Ed Chen'
  const content = (
    <>
      {sponsor.logoUrl ? (
        <span className="flex w-full flex-col items-center gap-2">
          <img
            src={sponsor.logoUrl}
            alt={`${sponsor.name} logo`}
            loading="lazy"
            className="max-h-14 w-full object-contain"
          />
          {showNameWithLogo ? (
            <span className="text-center text-xs font-black text-slate-950">
              {sponsor.name}
            </span>
          ) : null}
        </span>
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
  accent: 'hot' | 'rose' | 'blush' | 'magenta' | 'pale' | 'soft'
}) {
  const colorClass = {
    hot: 'text-[#ff3ea5]',
    rose: 'text-[#ff74bd]',
    blush: 'text-[#ff9fce]',
    magenta: 'text-[#ff5bb4]',
    pale: 'text-[#ffd6e9]',
    soft: 'text-[#ffc1df]',
  }[accent]

  return (
    <div className="rounded-lg border border-[#ff3ea5]/25 bg-[#120a10] p-3 shadow-xl shadow-black/20 sm:p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#d58aad] sm:text-xs">
        {label}
      </p>
      <p className={`mt-2 text-xl font-black sm:mt-3 sm:text-2xl ${colorClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs font-bold text-[#caa0b6] sm:text-sm">{detail}</p> : null}
    </div>
  )
}

function StatusField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/30 p-2.5 sm:p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-xs">
        {label}
      </p>
      <p className="mt-1.5 text-sm font-black text-white sm:mt-2 sm:text-base">{value}</p>
    </div>
  )
}
