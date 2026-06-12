import { NextResponse } from 'next/server'
import {
  loadLatestTelemetry,
  logTelemetryApiError,
  normalizeTelemetryNode,
  telemetryErrorJson,
} from '@/lib/redisTelemetry'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const node = normalizeTelemetryNode(searchParams.get('node'))

  try {
    const data = await loadLatestTelemetry(node)

    if (!data) {
      return noStoreJson(
        {
          ok: false,
          node,
          payload: null,
          updated_at: null,
          error: 'No telemetry found for this node.',
        },
        { status: 404 }
      )
    }

    return noStoreJson({
      ok: true,
      node,
      payload: data.payload,
      updated_at: data.updated_at,
    })
  } catch (error) {
    logTelemetryApiError('/api/telemetry/latest', error, { node })

    return noStoreJson(
      telemetryErrorJson(error, 'Failed to load latest telemetry packet.'),
      { status: 500 }
    )
  }
}

function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
