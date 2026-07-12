import { NextResponse, type NextRequest } from 'next/server'
import { verifyDashboardAuth } from '@/lib/dashboardAuth'
import {
  createRedisTelemetryClient,
  logTelemetryApiError,
  telemetryErrorJson,
} from '@/lib/redisTelemetry'
import { startGpsProvider } from '@/lib/vehicleGpsProvider'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const authResult = await verifyDashboardAuth(request)

  if (!authResult.ok) {
    return noStoreJson(
      { error: authResult.error },
      { status: authResult.status }
    )
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return noStoreJson(
      { error: 'GPS provider start body must be a JSON object.' },
      { status: 400 }
    )
  }

  try {
    const redis = createRedisTelemetryClient()
    const takeover = body.takeover === true
    const appProfile = typeof body.appProfile === 'string' ? body.appProfile : ''
    const result = await startGpsProvider({
      redis,
      input: body,
      takeover,
      canTakeover: appProfile === 'owner' || appProfile === 'admin',
    })

    if (!result.ok) {
      return noStoreJson(result, { status: result.status })
    }

    return noStoreJson(result)
  } catch (error) {
    logTelemetryApiError('/api/vehicle/gps/provider/start', error)

    return noStoreJson(
      telemetryErrorJson(error, 'Failed to start GPS provider.'),
      { status: 500 }
    )
  }
}

function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
