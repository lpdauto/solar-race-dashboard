import { NextResponse } from 'next/server'
import {
  getMockPublicRaceStatus,
  getPublicRaceStatusFromTelemetry,
} from '@/lib/publicRaceStatus'
import {
  defaultTelemetryNode,
  loadLatestTelemetry,
  logTelemetryApiError,
  telemetryErrorJson,
} from '@/lib/redisTelemetry'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const latestTelemetry = await loadLatestTelemetry(defaultTelemetryNode)
    const response = NextResponse.json(
      getPublicRaceStatusFromTelemetry(latestTelemetry)
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
