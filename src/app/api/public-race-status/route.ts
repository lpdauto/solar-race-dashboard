import { NextResponse } from 'next/server'
import {
  getMockPublicRaceStatus,
  getPublicRaceStatusFromTelemetry,
} from '@/lib/publicRaceStatus'
import {
  createRedisTelemetryClient,
  defaultTelemetryNode,
  loadLatestTelemetry,
  logTelemetryApiError,
  telemetryErrorJson,
} from '@/lib/redisTelemetry'
import { getGpsProviderStatus } from '@/lib/vehicleGpsProvider'
import { normalizeVehicleLocationFromGpsProviderStatus } from '@/lib/vehicleLocation'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const latestTelemetry = await loadLatestTelemetry(defaultTelemetryNode)
    const redis = createRedisTelemetryClient()
    const gpsProviderStatus = await getGpsProviderStatus({ redis })
    const vehicleLocation =
      normalizeVehicleLocationFromGpsProviderStatus(gpsProviderStatus)
    const response = NextResponse.json(
      getPublicRaceStatusFromTelemetry(latestTelemetry, new Date(), vehicleLocation)
    )
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    logTelemetryApiError('/api/public-race-status', error, {
      node: defaultTelemetryNode,
    })

    const fallback = getMockPublicRaceStatus()
    const response = NextResponse.json({
      ...fallback,
      publicFeedError: telemetryErrorJson(
        error,
        'Failed to load public race telemetry.'
      ).code,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}
