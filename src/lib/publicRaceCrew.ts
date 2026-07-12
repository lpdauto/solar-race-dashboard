import { findTeamMemberById } from '@/data/teamMembers'

export type PublicRaceCrewSelection = {
  driverId: string
  passengerId: string
}

export const publicRaceCrewStorageKey = 'rx2-public-race-current-crew'
export const publicRaceCrewChangedEventName = 'rx2-public-race-current-crew-changed'

export const emptyPublicRaceCrew: PublicRaceCrewSelection = {
  driverId: '',
  passengerId: '',
}

export function readStoredPublicRaceCrew(): PublicRaceCrewSelection {
  if (typeof window === 'undefined') return emptyPublicRaceCrew

  try {
    const stored = window.localStorage.getItem(publicRaceCrewStorageKey)

    if (!stored) return emptyPublicRaceCrew

    return normalizePublicRaceCrew(JSON.parse(stored))
  } catch {
    return emptyPublicRaceCrew
  }
}

export function writeStoredPublicRaceCrew(selection: PublicRaceCrewSelection) {
  const normalized = normalizePublicRaceCrew(selection)

  window.localStorage.setItem(
    publicRaceCrewStorageKey,
    JSON.stringify(normalized)
  )
  window.dispatchEvent(new CustomEvent(publicRaceCrewChangedEventName))
}

export async function loadPublicRaceCrew(): Promise<PublicRaceCrewSelection> {
  try {
    const response = await fetch('/api/public-race-crew', {
      cache: 'no-store',
    })

    if (!response.ok) {
      return readStoredPublicRaceCrew()
    }

    return normalizePublicRaceCrew(await response.json())
  } catch {
    return readStoredPublicRaceCrew()
  }
}

export async function savePublicRaceCrew(
  selection: PublicRaceCrewSelection
): Promise<{ ok: boolean; source: 'server' | 'local'; error?: string }> {
  const normalized = normalizePublicRaceCrew(selection)

  try {
    const response = await fetch('/api/public-race-crew', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(normalized),
    })

    if (response.ok) {
      writeStoredPublicRaceCrew(normalized)
      return { ok: true, source: 'server' }
    }

    const body = (await response.json().catch(() => null)) as {
      error?: string
    } | null

    writeStoredPublicRaceCrew(normalized)
    return {
      ok: false,
      source: 'local',
      error: body?.error ?? 'Crew was saved locally only.',
    }
  } catch {
    writeStoredPublicRaceCrew(normalized)
    return {
      ok: false,
      source: 'local',
      error: 'Crew was saved locally only.',
    }
  }
}

export function normalizePublicRaceCrew(value: unknown): PublicRaceCrewSelection {
  if (!value || typeof value !== 'object') return emptyPublicRaceCrew

  const candidate = value as Partial<PublicRaceCrewSelection>
  const driverId =
    typeof candidate.driverId === 'string' &&
    findTeamMemberById(candidate.driverId)
      ? candidate.driverId
      : ''
  const passengerId =
    typeof candidate.passengerId === 'string' &&
    findTeamMemberById(candidate.passengerId)
      ? candidate.passengerId
      : ''

  return {
    driverId,
    passengerId: passengerId === driverId ? '' : passengerId,
  }
}
