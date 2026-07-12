import { NextResponse } from 'next/server'
import {
  loadLatestTelemetry,
  logTelemetryApiError,
  telemetryErrorJson,
} from '@/lib/redisTelemetry'
import { buildTftDriverDisplayData } from '@/lib/tftDriverDisplay'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = telemetryBearerToken()

  if (!token) {
    return noStoreJson(
      { error: 'telemetry token is not configured' },
      { status: 500 }
    )
  }

  if (request.headers.get('authorization') !== `Bearer ${token}`) {
    return noStoreJson({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const latest = await loadLatestTelemetry('vehicle')

    if (!latest) {
      return noStoreJson(buildTftDriverDisplayData(null))
    }

    return noStoreJson(buildTftDriverDisplayData(latest.payload))
  } catch (error) {
    logTelemetryApiError('/api/tft/driver', error, { node: 'vehicle' })

    return noStoreJson(
      telemetryErrorJson(error, 'Failed to build TFT driver packet.'),
      { status: 500 }
    )
  }
}

function telemetryBearerToken() {
  return (
    process.env.TELEMETRY_INGEST_TOKEN?.trim() ||
    process.env.TELEMETRY_TOKEN?.trim() ||
    ''
  )
}

function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
