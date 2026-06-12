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
type DonationTierId = 'coffee' | 'lunch' | 'dinner'

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

const donationUrl = 'https://gofund.me/7a74fcab3'
const donationClickStorageKey = 'rx2-fuel-the-crew-clicks'
const donationTiers: Array<{
  id: DonationTierId
  title: string
  amount: string
  description: string
}> = [
  {
    id: 'coffee',
    title: 'Buy the Crew a Coffee',
    amount: '$5',
    description: 'Keep our track strategists caffeinated for the afternoon stint!',
  },
  {
    id: 'lunch',
    title: 'Buy a Driver Lunch',
    amount: '$15',
    description: 'Fuel the driver stepping out of the cockpit at the next control stop!',
  },
  {
    id: 'dinner',
    title: 'Buy us Dinner',
    amount: '$20',
    description: 'Long days driving require proper Texas BBQ!',
  },
]

export default function RaceTrackerClient() {
  const [raceStatus, setRaceStatus] = useState<PublicRaceStatus>(mockFallback)
  const [fetchState, setFetchState] = useState<FetchState>('loading')
  const [lastUpdated, setLastUpdated] = useState<string>('Waiting for update')
  const [currentCrew, setCurrentCrew] =
    useState<PublicRaceCrewSelection>(emptyPublicRaceCrew)
  const [journalPosts, setJournalPosts] = useState<PublicJournalPost[]>([])
  const [donationClicks, setDonationClicks] = useState<
    Record<DonationTierId, number>
  >({
    coffee: 0,
    lunch: 0,
    dinner: 0,
  })

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

  useEffect(() => {
    let cancelled = false

    async function syncCurrentCrew() {
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

    syncCurrentCrew()
    const intervalId = window.setInterval(syncCurrentCrew, 15_000)
    window.addEventListener(publicRaceCrewChangedEventName, syncCurrentCrew)
    window.addEventListener('storage', syncStoredCurrentCrew)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener(publicRaceCrewChangedEventName, syncCurrentCrew)
      window.removeEventListener('storage', syncStoredCurrentCrew)
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

  useEffect(() => {
    setDonationClicks(readDonationClicks())
  }, [])

  const progressPercent = raceStatus.routeProgressPct
  const leftSponsors = raceStatus.sponsors.filter((_, index) => index % 2 === 0)
  const rightSponsors = raceStatus.sponsors.filter((_, index) => index % 2 === 1)
  const driver = findTeamMemberById(currentCrew.driverId)
  const passenger = findTeamMemberById(currentCrew.passengerId)
  const visibleJournal = visiblePublicJournalPosts(journalPosts).slice(0, 4)
  const featuredDonationTier = featuredFuelTier()

  function handleDonationClick(tierId: DonationTierId) {
    setDonationClicks((currentClicks) => {
      const nextClicks = {
        ...currentClicks,
        [tierId]: (currentClicks[tierId] ?? 0) + 1,
      }

      window.localStorage.setItem(
        donationClickStorageKey,
        JSON.stringify(nextClicks)
      )

      return nextClicks
    })
  }

  return (
    <main className="min-h-screen bg-[#080808] px-3 py-4 text-white sm:px-5 lg:px-8">
      <div className="mx-auto grid max-w-[1540px] grid-cols-1 gap-4 xl:grid-cols-[150px_minmax(0,1fr)_150px] 2xl:grid-cols-[180px_minmax(0,1fr)_180px]">
        <SponsorRail
          sponsors={leftSponsors}
          crewCard={<PublicCrewCard label="Driver" member={driver} />}
        />

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

        <section className="grid gap-3 xl:hidden sm:grid-cols-2">
          <PublicCrewCard label="Driver" member={driver} />
          <PublicCrewCard label="Passenger" member={passenger} />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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

        <FuelTheCrewWidget
          featuredTier={featuredDonationTier}
          clickCounts={donationClicks}
          onTierClick={handleDonationClick}
        />

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

function FuelTheCrewWidget({
  featuredTier,
  clickCounts,
  onTierClick,
}: {
  featuredTier: DonationTierId
  clickCounts: Record<DonationTierId, number>
  onTierClick: (tierId: DonationTierId) => void
}) {
  return (
    <section className="rounded-lg border border-[#ff3ea5]/35 bg-[#140711] p-4 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff8fcb]">
            Support the Road Crew
          </p>
          <h2 className="mt-1 text-2xl font-black text-white">Fuel the Crew</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-300">
            Pick a small boost for the students keeping the race day moving.
          </p>
        </div>
        <span className="rounded-md border border-[#ff8fcb]/35 bg-[#ff3ea5]/10 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#ffd6e9]">
          {featuredTier === 'coffee'
            ? 'Morning boost'
            : featuredTier === 'lunch'
              ? 'Lunch stop energy'
              : 'Dinner run'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {donationTiers.map((tier) => {
          const isFeatured = tier.id === featuredTier

          return (
            <a
              key={tier.id}
              href={donationUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => onTierClick(tier.id)}
              className={`rounded-md border p-4 transition hover:-translate-y-0.5 ${
                isFeatured
                  ? 'border-[#ff8fcb]/60 bg-[#ff3ea5]/15 shadow-[0_0_24px_rgba(255,62,165,0.16)]'
                  : 'border-white/10 bg-black/25 hover:border-[#ff3ea5]/35'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-black text-white">{tier.title}</h3>
                <span className="rounded border border-[#ff3ea5]/35 bg-[#ff3ea5]/10 px-2 py-1 text-sm font-black text-[#ff8fcb]">
                  {tier.amount}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold leading-6 text-slate-300">
                {tier.description}
              </p>
              {clickCounts[tier.id] > 0 ? (
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#ff8fcb]">
                  Opened {clickCounts[tier.id]} time
                  {clickCounts[tier.id] === 1 ? '' : 's'} here
                </p>
              ) : null}
            </a>
          )
        })}
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

function featuredFuelTier(): DonationTierId {
  const hour = new Date().getHours()

  if (hour < 11) return 'coffee'
  if (hour < 17) return 'lunch'
  return 'dinner'
}

function readDonationClicks(): Record<DonationTierId, number> {
  if (typeof window === 'undefined') {
    return { coffee: 0, lunch: 0, dinner: 0 }
  }

  try {
    const stored = window.localStorage.getItem(donationClickStorageKey)

    if (!stored) return { coffee: 0, lunch: 0, dinner: 0 }

    const parsed = JSON.parse(stored) as Partial<Record<DonationTierId, number>>

    return {
      coffee: Number.isFinite(parsed.coffee) ? Number(parsed.coffee) : 0,
      lunch: Number.isFinite(parsed.lunch) ? Number(parsed.lunch) : 0,
      dinner: Number.isFinite(parsed.dinner) ? Number(parsed.dinner) : 0,
    }
  } catch {
    return { coffee: 0, lunch: 0, dinner: 0 }
  }
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
}: {
  label: 'Driver' | 'Passenger'
  member: TeamMember | null
}) {
  return (
    <section className="rounded-lg border border-[#ff3ea5]/35 bg-[#140711] p-3 shadow-xl shadow-black/20">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff8fcb]">
        Current {label}
      </p>
      <div className="mt-3 grid gap-3">
        <div className="relative aspect-square w-full overflow-hidden rounded-md border border-[#ff8fcb]/35 bg-black">
          {member?.imageSrc ? (
            <Image
              src={member.imageSrc}
              alt={member.imageAlt}
              fill
              sizes="(min-width: 1280px) 150px, (min-width: 640px) 45vw, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-5xl font-black text-[#ff8fcb]/70">
              ?
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xl font-black leading-tight text-white xl:text-lg 2xl:text-xl">
            {member?.name ?? 'Unassigned'}
          </p>
          <p className="mt-2 text-sm font-bold leading-5 text-slate-300">
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
    <div className="rounded-lg border border-[#ff3ea5]/25 bg-[#120a10] p-4 shadow-xl shadow-black/20">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#d58aad]">
        {label}
      </p>
      <p className={`mt-3 text-2xl font-black ${colorClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-sm font-bold text-[#caa0b6]">{detail}</p> : null}
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
