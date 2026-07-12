import { NextResponse, type NextRequest } from 'next/server'
import { createRedisTelemetryClient, RedisTelemetryConfigError } from '@/lib/redisTelemetry'
import {
  emptyPublicRaceCrew,
  normalizePublicRaceCrew,
  type PublicRaceCrewSelection,
} from '@/lib/publicRaceCrew'

const crewKey = 'public-race:current-crew'
const authCookieName = 'solar_race_auth'

export async function GET() {
  try {
    const redis = createRedisTelemetryClient()
    const crew = await redis.get<PublicRaceCrewSelection>(crewKey)

    return NextResponse.json(normalizePublicRaceCrew(crew))
  } catch (error) {
    if (error instanceof RedisTelemetryConfigError) {
      return NextResponse.json(emptyPublicRaceCrew, {
        headers: {
          'x-race-crew-storage': 'local-fallback',
        },
      })
    }

    console.error('[public-race-crew] read failed', error)
    return NextResponse.json(emptyPublicRaceCrew, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await verifyDashboardAuth(request)

  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const body = await request.json().catch(() => null)
  const crew = normalizePublicRaceCrew(body)

  if (crew.driverId && crew.driverId === crew.passengerId) {
    return NextResponse.json(
      { error: 'Driver and passenger must be different students.' },
      { status: 400 }
    )
  }

  try {
    const redis = createRedisTelemetryClient()

    await redis.set(crewKey, crew)

    return NextResponse.json(crew)
  } catch (error) {
    if (error instanceof RedisTelemetryConfigError) {
      return NextResponse.json(
        { error: 'Shared crew storage is not configured on this server.' },
        { status: 503 }
      )
    }

    console.error('[public-race-crew] write failed', error)
    return NextResponse.json(
      { error: 'Unable to save current crew.' },
      { status: 500 }
    )
  }
}

async function verifyDashboardAuth(request: NextRequest) {
  const appPassword = process.env.APP_PASSWORD

  if (!appPassword) {
    return {
      ok: false,
      status: 500,
      error: 'APP_PASSWORD is not configured on the server.',
    } as const
  }

  const expectedToken = await createAuthToken(appPassword)
  const actualToken = request.cookies.get(authCookieName)?.value

  if (actualToken !== expectedToken) {
    return {
      ok: false,
      status: 401,
      error: 'Sign in to update the public race crew.',
    } as const
  }

  return { ok: true } as const
}

async function createAuthToken(password: string) {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`solar-race-dashboard:${password}`)
  )

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
