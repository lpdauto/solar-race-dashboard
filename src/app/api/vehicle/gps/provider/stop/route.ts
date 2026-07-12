import { NextResponse, type NextRequest } from 'next/server'
import { verifyDashboardAuth } from '@/lib/dashboardAuth'
import {
  createRedisTelemetryClient,
  logTelemetryApiError,
  telemetryErrorJson,
} from '@/lib/redisTelemetry'
import { stopGpsProvider } from '@/lib/vehicleGpsProvider'

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
      { error: 'GPS provider stop body must be a JSON object.' },
      { status: 400 }
    )
  }

  try {
    const redis = createRedisTelemetryClient()
    const result = await stopGpsProvider({
      redis,
      providerId: body.providerId,
      sessionId: body.sessionId,
    })

    if (!result.ok) {
      return noStoreJson(result, { status: result.status })
    }

    return noStoreJson(result)
  } catch (error) {
    logTelemetryApiError('/api/vehicle/gps/provider/stop', error)

    return noStoreJson(
      telemetryErrorJson(error, 'Failed to stop GPS provider.'),
      { status: 500 }
    )
  }
}

function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
