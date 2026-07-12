import 'server-only'

import type { NextRequest } from 'next/server'

const authCookieName = 'solar_race_auth'

export type DashboardAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

export async function verifyDashboardAuth(
  request: NextRequest
): Promise<DashboardAuthResult> {
  const appPassword = process.env.APP_PASSWORD

  if (!appPassword) {
    return {
      ok: false,
      status: 500,
      error: 'APP_PASSWORD is not configured on the server.',
    }
  }

  const expectedToken = await createDashboardAuthToken(appPassword)
  const actualToken = request.cookies.get(authCookieName)?.value

  if (actualToken !== expectedToken) {
    return {
      ok: false,
      status: 401,
      error: 'Sign in to use vehicle GPS broadcasting.',
    }
  }

  return { ok: true }
}

export async function createDashboardAuthToken(password: string) {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`solar-race-dashboard:${password}`)
  )

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
