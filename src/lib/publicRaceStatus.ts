import { calculateCompletedRoutePercentage } from '@/lib/publicRaceRoute'

export type PublicSponsor = {
  name: string
  logoUrl?: string
  sponsorUrl?: string
}

export type PublicRaceStatus = {
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
    sponsorUrl: '#',
  },
  {
    name: 'Highland',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/9e5826a9-199e-409b-9111-2c0c228160e8/Highland_wordmark_black-3-scaled.png?format=750w',
    sponsorUrl: '#',
  },
  {
    name: 'Sherfab',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/3e2c56c7-2c6a-4802-bf1d-8403792c6718/sherfab-logo-h.webp?format=500w',
    sponsorUrl: '#',
  },
  {
    name: 'Motivo',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/3835cb31-41a8-411a-96c1-030ba629c9e6/Motivo-PNG-1.webp?format=750w',
    sponsorUrl: '#',
  },
  { name: 'Precise Pharmacy, Inc', sponsorUrl: '#' },
  {
    name: 'Land Bank of Taiwan',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/fe6dd1cc-e7fe-4d9c-b921-ada63919b0eb/Logo-Landban.png?format=500w',
    sponsorUrl: '#',
  },
  {
    name: 'Brightmore Neon Sign',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/45caafba-b420-484d-8629-711c16be636e/Race+Suit+Draft.png?format=750w',
    sponsorUrl: '#',
  },
  {
    name: 'This is STEM',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/eff00a4f-1783-4df2-bdb3-3c1fa6655624/LA-STEM-Logo.png?format=500w',
    sponsorUrl: '#',
  },
  {
    name: 'Mission Solar Energy',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/1df779be-5eea-417d-8852-913f184cce3a/Race+Suit+Draft+%282%29.png?format=750w',
    sponsorUrl: '#',
  },
  {
    name: 'Temple City',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/68d4fc48910e771ca9142c46/d0ac6b6f-31af-4584-a138-52026763958b/Document.png?format=300w',
    sponsorUrl: '#',
  },
  { name: 'Ed Chen', sponsorUrl: '#' },
  { name: 'Thomas Hunsucker', sponsorUrl: '#' },
]

export function getMockPublicRaceStatus(now = new Date()): PublicRaceStatus {
  const milesCompleted = 185.4
  const milesLeft = 620.8
  const totalMiles = milesCompleted + milesLeft

  return {
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
