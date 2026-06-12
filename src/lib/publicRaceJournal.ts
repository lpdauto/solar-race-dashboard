import {
  publicRaceCheckpoints,
  type PublicRaceCheckpoint,
} from '@/data/publicRaceCheckpoints'
import { findTeamMemberById } from '@/data/teamMembers'
import type { PublicRaceCrewSelection } from '@/lib/publicRaceCrew'
import { calculatePublicRouteProgress } from '@/lib/publicRaceRoute'
import type { PublicRaceStatus } from '@/lib/publicRaceStatus'

export type PublicJournalPost = {
  id: string
  checkpointId: string
  checkpointName: string
  day: number
  city: string
  title: string
  message: string
  reachedAt: string
  publishAt: string
  createdAt: string
}

type JournalVariantSet = {
  intros: string[]
  observations: string[]
  closings: string[]
}

const journalStorageKey = 'rx2-public-team-journal'
const checkpointProgressBufferPct = 0.15
const checkpointReachRadiusMeters = 1200
const publishDelayMinMs = 3 * 60 * 60 * 1000
const publishDelayRangeMs = 60 * 60 * 1000

const sharedIntros = [
  'RX2 rolled into {checkpoint} and the whole chase crew got that little burst of "we are really doing this" energy.',
  'Checkpoint moment at {checkpoint}: big smiles, quick reset, and a lot of proud people in matching team gear.',
  'We made it to {checkpoint}, and the road-trip playlist energy is still very much alive.',
  'Another dot on the Texas map turned into a real stop today: hello from {checkpoint}.',
  'The team reached {checkpoint}, which means another page in the RX2 road story is officially written.',
]

const sharedObservations = [
  '{type} stops like this are where the race feels bigger than the car: families, students, maps, snacks, and a lot of waving.',
  'Day {day} has been full of long roads, quick conversations, and everyone doing their part without making a big speech about it.',
  'The view around {city} gave us one of those "remember this later" moments between all the checklists and radio calls.',
  'Driver/passenger watch: {crew}. They have been part of the calm, focused rhythm that keeps the team moving.',
  'Weather check from the fan side: {weather}. Texas is absolutely making itself known out here.',
]

const sharedClosings = [
  'Next up: more miles, more teamwork, and probably another snack negotiation.',
  'Thanks for following along. Every checkpoint feels better knowing people back home are watching the map with us.',
  'We are tired in the best way and already looking toward the next stop.',
]

const journalVariantOverrides: Record<string, Partial<JournalVariantSet>> = {
  'fort-worth-start': {
    intros: [
      'Fort Worth start line energy was unreal: uniforms, nerves, cameras, and RX2 ready to point west.',
      'The race officially began at Fort Worth, and yes, everyone suddenly remembered three more things to check.',
      'RX2 left Fort Worth with the kind of first-day excitement you can feel through the whole crew.',
    ],
    observations: [
      'Start lines are loud in a quiet way: everyone is focused, but you can tell this is the moment the months of work become real.',
      'Seeing the car roll out made every late shop night feel connected to the road ahead.',
      'The first checkpoint is mostly adrenaline, water bottles, and making sure nobody loses the clipboard.',
    ],
  },
  'fort-stockton-finish': {
    intros: [
      'Fort Stockton finish energy: this is the one everyone pictured when the route still looked impossibly long.',
      'RX2 reached Fort Stockton, and the team is trying to act normal about it. It is not working.',
      'Finish line moment in Fort Stockton. The car, the crew, and the story made it across Texas.',
    ],
    observations: [
      'The best part is seeing how many small jobs added up to something huge.',
      'This stop feels like every roadside reset, every packed cooler, and every practice run arriving at the same place.',
      'There is a very specific kind of happy exhaustion at the finish, and we have it.',
    ],
    closings: [
      'Thank you for riding along from the map side. RX2 felt the support the whole way.',
      'More photos and stories soon, after everyone drinks water and sits down for a minute.',
      'That is a Texas-sized wrap for the public route. We are so proud of this team.',
    ],
  },
}

export function syncPublicRaceJournal({
  raceStatus,
  currentCrew,
  now = new Date(),
}: {
  raceStatus: PublicRaceStatus
  currentCrew: PublicRaceCrewSelection
  now?: Date
}) {
  const storedPosts = readStoredPublicJournalPosts()
  const nextPosts = [...storedPosts]
  const reachedCheckpoints = checkpointsReachedByStatus(raceStatus)
  let changed = false

  for (const checkpoint of reachedCheckpoints) {
    const alreadyCreated = nextPosts.some(
      (post) => post.checkpointId === checkpoint.id
    )

    if (alreadyCreated) continue

    nextPosts.push(createJournalPost({ checkpoint, raceStatus, currentCrew, now }))
    changed = true
  }

  const sortedPosts = sortJournalPosts(nextPosts)

  if (changed) {
    writeStoredPublicJournalPosts(sortedPosts)
  }

  return sortedPosts
}

export function visiblePublicJournalPosts(
  posts: PublicJournalPost[],
  now = new Date()
) {
  const nowMs = now.getTime()

  return posts.filter((post) => Date.parse(post.publishAt) <= nowMs)
}

function checkpointsReachedByStatus(raceStatus: PublicRaceStatus) {
  if (
    raceStatus.routeConfidence === 'unavailable' ||
    raceStatus.routeConfidence === 'off-route'
  ) {
    return []
  }

  return publicRaceCheckpoints.filter((checkpoint) => {
    const checkpointProgress = calculatePublicRouteProgress({
      lat: checkpoint.lat,
      lng: checkpoint.lng,
    })

    if (!checkpointProgress) return false

    const distanceMeters = distanceBetweenMeters(
      raceStatus.lat,
      raceStatus.lng,
      checkpoint.lat,
      checkpoint.lng
    )

    return (
      distanceMeters <= checkpointReachRadiusMeters ||
      raceStatus.routeProgressPct >=
        checkpointProgress.routeProgressPct - checkpointProgressBufferPct
    )
  })
}

function createJournalPost({
  checkpoint,
  raceStatus,
  currentCrew,
  now,
}: {
  checkpoint: PublicRaceCheckpoint
  raceStatus: PublicRaceStatus
  currentCrew: PublicRaceCrewSelection
  now: Date
}): PublicJournalPost {
  const variants = variantsForCheckpoint(checkpoint)
  const seed = hashString(`${checkpoint.id}:${now.toISOString().slice(0, 10)}`)
  const intro = pickVariant(variants.intros, seed)
  const observation = pickVariant(variants.observations, seed + 17)
  const closing = pickVariant(variants.closings, seed + 31)
  const publishDelayMs = publishDelayMinMs + (seed % publishDelayRangeMs)
  const publishAt = new Date(now.getTime() + publishDelayMs)

  return {
    id: `journal-${checkpoint.id}`,
    checkpointId: checkpoint.id,
    checkpointName: checkpoint.name,
    day: checkpoint.day,
    city: checkpoint.city,
    title: titleForCheckpoint(checkpoint, seed),
    message: [intro, observation, closing]
      .map((part) =>
        fillTemplate(part, {
          checkpoint,
          raceStatus,
          currentCrew,
        })
      )
      .join(' '),
    reachedAt: now.toISOString(),
    publishAt: publishAt.toISOString(),
    createdAt: now.toISOString(),
  }
}

function variantsForCheckpoint(checkpoint: PublicRaceCheckpoint): JournalVariantSet {
  const overrides = journalVariantOverrides[checkpoint.id] ?? {}

  return {
    intros: [...sharedIntros, ...(overrides.intros ?? [])],
    observations: [...sharedObservations, ...(overrides.observations ?? [])],
    closings: [...sharedClosings, ...(overrides.closings ?? [])],
  }
}

function fillTemplate(
  template: string,
  {
    checkpoint,
    raceStatus,
    currentCrew,
  }: {
    checkpoint: PublicRaceCheckpoint
    raceStatus: PublicRaceStatus
    currentCrew: PublicRaceCrewSelection
  }
) {
  const driver = findTeamMemberById(currentCrew.driverId)
  const passenger = findTeamMemberById(currentCrew.passengerId)
  const crew =
    driver || passenger
      ? [driver?.name, passenger?.name].filter(Boolean).join(' and ')
      : 'the current crew'

  return template
    .replaceAll('{checkpoint}', checkpoint.name)
    .replaceAll('{city}', checkpoint.city)
    .replaceAll('{day}', String(checkpoint.day))
    .replaceAll('{type}', checkpoint.type.toLowerCase())
    .replaceAll('{crew}', crew)
    .replaceAll(
      '{weather}',
      `${raceStatus.weatherCondition.toLowerCase()} around ${raceStatus.weatherLocation}`
    )
}

function titleForCheckpoint(checkpoint: PublicRaceCheckpoint, seed: number) {
  const titleStarts = ['Hello from', 'Checkpoint reached:', 'RX2 update:', 'Road note:']

  return `${pickVariant(titleStarts, seed + 7)} ${checkpoint.name}`
}

function readStoredPublicJournalPosts(): PublicJournalPost[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(journalStorageKey)

    if (!stored) return []

    return normalizeJournalPosts(JSON.parse(stored))
  } catch {
    return []
  }
}

function writeStoredPublicJournalPosts(posts: PublicJournalPost[]) {
  window.localStorage.setItem(
    journalStorageKey,
    JSON.stringify(normalizeJournalPosts(posts))
  )
}

function normalizeJournalPosts(value: unknown): PublicJournalPost[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((post): post is PublicJournalPost => {
      if (!post || typeof post !== 'object') return false
      const candidate = post as Partial<PublicJournalPost>

      return (
        typeof candidate.id === 'string' &&
        typeof candidate.checkpointId === 'string' &&
        typeof candidate.checkpointName === 'string' &&
        typeof candidate.day === 'number' &&
        typeof candidate.city === 'string' &&
        typeof candidate.title === 'string' &&
        typeof candidate.message === 'string' &&
        typeof candidate.reachedAt === 'string' &&
        typeof candidate.publishAt === 'string' &&
        typeof candidate.createdAt === 'string'
      )
    })
    .filter((post, index, posts) => {
      return posts.findIndex((item) => item.checkpointId === post.checkpointId) === index
    })
    .sort((left, right) => Date.parse(right.publishAt) - Date.parse(left.publishAt))
}

function sortJournalPosts(posts: PublicJournalPost[]) {
  return [...posts].sort(
    (left, right) => Date.parse(right.publishAt) - Date.parse(left.publishAt)
  )
}

function pickVariant(variants: string[], seed: number) {
  return variants[Math.abs(seed) % variants.length]
}

function hashString(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

function distanceBetweenMeters(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number
) {
  const earthRadiusMeters = 6_371_000
  const latDelta = degreesToRadians(latB - latA)
  const lngDelta = degreesToRadians(lngB - lngA)
  const startLat = degreesToRadians(latA)
  const endLat = degreesToRadians(latB)
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) *
      Math.cos(endLat) *
      Math.sin(lngDelta / 2) ** 2

  return (
    2 *
    earthRadiusMeters *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  )
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180
}
