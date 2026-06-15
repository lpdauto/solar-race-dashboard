import { parseEsp32TelemetryPacket } from '@/lib/esp32Telemetry'
import {
  calculateCompletedRoutePercentage,
  calculatePublicRouteProgress,
  nextStopForProgress,
  publicSccRoute,
  type PublicRouteProgress,
} from '@/lib/publicRaceRoute'
import type { TelemetryLatestRow } from '@/lib/redisTelemetry'
import { getLiveTelemetryGpsPosition } from '@/lib/liveTelemetryGps'

export type PublicSponsor = {
  name: string
  logoUrl?: string
  sponsorUrl?: string
}

export type PublicRaceStatus = {
  dataSource: 'telemetry' | 'mock'
  telemetryAgeSeconds: number | null
  telemetryUpdatedAt: string | null
  routeConfidence: PublicRouteProgress['confidence'] | 'live' | 'unavailable'
  distanceFromRouteMeters: number | null
  speedMph: number
  avgSpeedMph: number
  currentPlace: string
  placeTotal: number
  standingsSourceUrl: string
  standingsLastUpdated: string
  milesCompleted: number
  milesLeft: number
  totalMiles: number
  currentTime: string
  weatherLocation: string
  weatherTempF: number
  weatherCondition: string
  weatherWindMph: number
  weatherWindDirection: string
  currentDay: number
  totalDays: number
  currentSegment: string
  nextStop: string
  eta: string
  status: string
  lat: number
  lng: number
  routeProgressPct: number
  instagramUrl: string
  sponsors: PublicSponsor[]
}

export const publicRaceSponsors: PublicSponsor[] = [
  {
    name: 'Off Road Performance',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/9841a2d2-1e34-4f6c-bb07-1574302c52a9/Asset+1%402x.png?format=750w',
    sponsorUrl: 'https://www.rpm-garage.com/',
  },
  {
    name: 'Highland',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/9e5826a9-199e-409b-9111-2c0c228160e8/Highland_wordmark_black-3-scaled.png?format=750w',
    sponsorUrl: 'https://highlandfleets.com/',
  },
  {
    name: 'Sherfab',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/3e2c56c7-2c6a-4802-bf1d-8403792c6718/sherfab-logo-h.webp?format=500w',
    sponsorUrl: 'https://www.sherfab.com/',
  },
  {
    name: 'Motivo',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/3835cb31-41a8-411a-96c1-030ba629c9e6/Motivo-PNG-1.webp?format=750w',
    sponsorUrl: 'https://www.motivo.com/',
  },
  { name: 'Precise Pharmacy, Inc', sponsorUrl: '#' },
  {
    name: 'Land Bank of Taiwan',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/fe6dd1cc-e7fe-4d9c-b921-ada63919b0eb/Logo-Landban.png?format=500w',
    sponsorUrl: 'https://www.landbank.com.tw/En',
  },
  {
    name: 'Biltmore Metal Fabricators',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/45caafba-b420-484d-8629-711c16be636e/Race+Suit+Draft.png?format=750w',
    sponsorUrl: 'https://biltmf.com/',
  },
  {
    name: 'LA STEM Collective',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/eff00a4f-1783-4df2-bdb3-3c1fa6655624/LA-STEM-Logo.png?format=500w',
    sponsorUrl: 'https://lastemcollective.org/',
  },
  {
    name: 'Mission Solar Energy',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/1df779be-5eea-417d-8852-913f184cce3a/Race+Suit+Draft+%282%29.png?format=750w',
    sponsorUrl: 'https://www.missionsolar.com/',
  },
  {
    name: 'Temple City',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/d0ac6b6f-31af-4584-a138-52026763958b/Document.png?format=300w',
    sponsorUrl: 'https://www.templecityca.gov/',
  },
  {
    name: 'Ed Chen',
    logoUrl: '/race-images/sponsors/temple-city.png',
    sponsorUrl: '#',
  },
  { name: 'Thomas Hunsucker', sponsorUrl: '#' },
]

export function getMockPublicRaceStatus(now = new Date()): PublicRaceStatus {
  const milesCompleted = 185.4
  const milesLeft = 620.8
  const totalMiles = milesCompleted + milesLeft

  return {
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
    standingsLastUpdated: formatPublicDateTime(now),
    milesCompleted,
    milesLeft,
    totalMiles,
    currentTime: formatPublicTime(now),
    weatherLocation: 'Palestine, TX',
    weatherTempF: 91,
    weatherCondition: 'Sunny',
    weatherWindMph: 8,
    weatherWindDirection: 'SE',
    currentDay: 2,
    totalDays: 5,
    currentSegment: 'Palestine High School to Leon ISD',
    nextStop: 'Leon ISD Junior & Senior High School',
    eta: '2:36 PM',
    status: 'On target',
    lat: 31.7621,
    lng: -95.6308,
    routeProgressPct: calculateCompletedRoutePercentage({
      milesCompleted,
      totalMiles,
    }),
    instagramUrl: 'https://www.instagram.com/',
    sponsors: publicRaceSponsors,
  }
}

export function getPublicRaceStatusFromTelemetry(
  latestRow: TelemetryLatestRow | null | undefined,
  now = new Date()
): PublicRaceStatus {
  if (!latestRow) {
    return getMockPublicRaceStatus(now)
  }

  const telemetry = parseEsp32TelemetryPacket(
    (latestRow.payload ?? {}) as Parameters<typeof parseEsp32TelemetryPacket>[0]
  )
  const liveGps = getLiveTelemetryGpsPosition(telemetry)
  const progress =
    liveGps
      ? calculatePublicRouteProgress({
          lat: liveGps.lat,
          lng: liveGps.lng,
        })
      : null

  if (!progress) {
    return {
      ...getMockPublicRaceStatus(now),
      dataSource: 'telemetry',
      telemetryAgeSeconds: ageSeconds(latestRow.updated_at, now),
      telemetryUpdatedAt: latestRow.updated_at,
      routeConfidence: 'unavailable',
      speedMph: telemetry.speedMph,
      status: statusFromTelemetryAge(latestRow.updated_at, now),
      currentTime: formatPublicTime(now),
      standingsLastUpdated: formatPublicDateTime(now),
    }
  }

  const nextStop = nextStopForProgress(publicSccRoute, progress.routeProgressPct)
  const currentSegment = currentSegmentForProgress(progress.routeProgressPct)

  return {
    dataSource: 'telemetry',
    telemetryAgeSeconds: ageSeconds(latestRow.updated_at, now),
    telemetryUpdatedAt: latestRow.updated_at,
    routeConfidence:
      progress.confidence === 'off-route'
        ? 'off-route'
        : liveGps?.fix
          ? 'live'
          : progress.confidence,
    distanceFromRouteMeters: Math.round(progress.distanceFromRouteMeters),
    speedMph: telemetry.speedMph,
    avgSpeedMph: telemetry.speedMph,
    currentPlace: 'TBD',
    placeTotal: 22,
    standingsSourceUrl: 'https://www.solarcarchallenge.org/',
    standingsLastUpdated: 'Official standings pending',
    milesCompleted: progress.milesCompleted,
    milesLeft: progress.milesLeft,
    totalMiles: progress.totalMiles,
    currentTime: formatPublicTime(now),
    weatherLocation: nextStop?.label ?? 'On course',
    weatherTempF: 91,
    weatherCondition: 'Weather pending',
    weatherWindMph: 0,
    weatherWindDirection: '--',
    currentDay: dayForProgress(progress.routeProgressPct),
    totalDays: 5,
    currentSegment,
    nextStop: nextStop?.label ?? 'Finish',
    eta: etaFromSpeed(progress.milesLeft, telemetry.speedMph, now),
    status: statusFromTelemetryAge(
      latestRow.updated_at,
      now,
      progress.confidence === 'off-route'
        ? 'off-route'
        : liveGps?.fix
          ? 'live'
          : progress.confidence
    ),
    lat: liveGps?.lat ?? progress.lat,
    lng: liveGps?.lng ?? progress.lng,
    routeProgressPct: progress.routeProgressPct,
    instagramUrl: 'https://www.instagram.com/',
    sponsors: publicRaceSponsors,
  }
}

function formatPublicTime(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  }).format(value)
}

function formatPublicDateTime(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  }).format(value)
}

function ageSeconds(updatedAt: string | null | undefined, now: Date) {
  if (!updatedAt) return null

  const updatedAtMs = Date.parse(updatedAt)
  if (!Number.isFinite(updatedAtMs)) return null

  return Math.max(0, Math.round((now.getTime() - updatedAtMs) / 1000))
}

function statusFromTelemetryAge(
  updatedAt: string | null | undefined,
  now: Date,
  confidence: PublicRaceStatus['routeConfidence'] = 'unavailable'
) {
  const age = ageSeconds(updatedAt, now)

  if (age !== null && age > 60) return 'Telemetry delayed'
  if (confidence === 'unavailable') return 'Waiting for GPS'
  if (confidence === 'off-route') return 'GPS off route / test location'
  if (confidence === 'live') return 'Live GPS'
  if (confidence === 'low') return 'GPS approximate'
  return 'Live on course'
}

function etaFromSpeed(milesLeft: number, speedMph: number, now: Date) {
  if (!Number.isFinite(speedMph) || speedMph < 5) return 'Calculating'

  const eta = new Date(now.getTime() + (milesLeft / speedMph) * 60 * 60 * 1000)
  return formatPublicTime(eta)
}

function dayForProgress(routeProgressPct: number) {
  return Math.min(5, Math.max(1, Math.floor(routeProgressPct / 20) + 1))
}

function currentSegmentForProgress(routeProgressPct: number) {
  const nextStop = nextStopForProgress(publicSccRoute, routeProgressPct)
  const nextIndex = nextStop
    ? publicSccRoute.findIndex((point) => point.label === nextStop.label)
    : -1
  const previousStop =
    nextIndex > 0 ? publicSccRoute[nextIndex - 1] : publicSccRoute[0]

  if (!nextStop) return 'Finish'

  return `${previousStop.label} to ${nextStop.label}`
}
