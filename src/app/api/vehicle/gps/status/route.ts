import { NextResponse, type NextRequest } from 'next/server'
import { verifyDashboardAuth } from '@/lib/dashboardAuth'
import {
  createRedisTelemetryClient,
  logTelemetryApiError,
  telemetryErrorJson,
} from '@/lib/redisTelemetry'
import { getGpsProviderStatus } from '@/lib/vehicleGpsProvider'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authResult = await verifyDashboardAuth(request)

  if (!authResult.ok) {
    return noStoreJson(
      { error: authResult.error },
      { status: authResult.status }
    )
  }

  try {
    const redis = createRedisTelemetryClient()

    return noStoreJson(await getGpsProviderStatus({ redis }))
  } catch (error) {
    logTelemetryApiError('/api/vehicle/gps/status', error)

    return noStoreJson(
      telemetryErrorJson(error, 'Failed to load GPS provider status.'),
      { status: 500 }
    )
  }
}

function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
