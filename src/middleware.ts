import { NextResponse, type NextRequest } from 'next/server'

const authCookieName = 'solar_race_auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const appPassword = process.env.APP_PASSWORD

  if (!appPassword) {
    return redirectToLogin(request)
  }

  const expectedToken = await createAuthToken(appPassword)
  const actualToken = request.cookies.get(authCookieName)?.value

  if (actualToken === expectedToken) {
    return NextResponse.next()
  }

  return redirectToLogin(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

function isPublicPath(pathname: string) {
  return (
    pathname === '/login' ||
    pathname === '/api/login' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/_next/') ||
    pathname.match(/\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|txt)$/)
  )
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = request.nextUrl.clone()

  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('next', request.nextUrl.pathname)

  return NextResponse.redirect(loginUrl)
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
