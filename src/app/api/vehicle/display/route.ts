import { NextResponse } from 'next/server'
import {
  loadLatestTelemetry,
  logTelemetryApiError,
  telemetryErrorJson,
} from '@/lib/redisTelemetry'
import { buildVehicleDisplayData } from '@/lib/vehicleDisplay'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = process.env.TELEMETRY_INGEST_TOKEN?.trim()

  if (!token) {
    return NextResponse.json(
      { error: 'TELEMETRY_INGEST_TOKEN is not configured.' },
      { status: 500 }
    )
  }

  if (request.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  try {
    const latest = await loadLatestTelemetry('vehicle')

    if (!latest) {
      return NextResponse.json(
        { error: 'No vehicle telemetry found.' },
        { status: 404 }
      )
    }

    return noStoreJson(buildVehicleDisplayData(latest.payload))
  } catch (error) {
    logTelemetryApiError('/api/vehicle/display', error, { node: 'vehicle' })

    return NextResponse.json(
      telemetryErrorJson(error, 'Failed to build vehicle display packet.'),
      { status: 500 }
    )
  }
}

function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
