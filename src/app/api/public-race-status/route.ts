import { NextResponse } from 'next/server'
import { getMockPublicRaceStatus } from '@/lib/publicRaceStatus'

export const dynamic = 'force-dynamic'

export function GET() {
  const response = NextResponse.json(getMockPublicRaceStatus())
  response.headers.set('Cache-Control', 'no-store')
  return response
}
