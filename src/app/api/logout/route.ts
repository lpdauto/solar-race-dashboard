import { NextResponse } from 'next/server'

const authCookieName = 'solar_race_auth'

export async function GET(request: Request) {
  return clearAuthAndRedirect(request)
}

export async function POST(request: Request) {
  return clearAuthAndRedirect(request)
}

function clearAuthAndRedirect(request: Request) {
  const response = NextResponse.redirect(new URL('/login', request.url))

  response.cookies.set(authCookieName, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return response
}
