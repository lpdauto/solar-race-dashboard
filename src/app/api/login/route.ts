import { NextResponse } from 'next/server'

const authCookieName = 'solar_race_auth'

export async function POST(request: Request) {
  const appPassword = process.env.APP_PASSWORD

  if (!appPassword) {
    return NextResponse.json(
      { error: 'APP_PASSWORD is not configured on the server.' },
      { status: 500 }
    )
  }

  const body = (await request.json().catch(() => null)) as {
    password?: string
  } | null

  if (!body?.password || body.password !== appPassword) {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  const token = await createAuthToken(appPassword)

  response.cookies.set(authCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  })

  return response
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
