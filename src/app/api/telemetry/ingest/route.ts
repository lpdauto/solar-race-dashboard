import { NextResponse } from 'next/server'
import { mergeTelemetryPayloadForIngest } from '@/lib/telemetryIngest'
import {
  loadLatestTelemetry,
  logTelemetryApiError,
  normalizeTelemetryNode,
  storeTelemetryPacket,
  telemetryErrorJson,
} from '@/lib/redisTelemetry'

export function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  )
}

export async function POST(request: Request) {
  const token = process.env.TELEMETRY_INGEST_TOKEN?.trim() || 'rx2tc'

  if (request.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as unknown

  if (!isJsonObject(body)) {
    return NextResponse.json(
      { error: 'Telemetry body must be a JSON object.' },
      { status: 400 }
    )
  }

  const normalized = normalizeTelemetryIngest(body)

  if (!normalized.ok) {
    return NextResponse.json(
      {
        error:
          'Telemetry body must include a non-empty string node and a JSON object payload.',
      },
      { status: 400 }
    )
  }

  const { node, payload } = normalized

  try {
    const receivedAt = new Date().toISOString()
    const latest = await loadLatestTelemetry(node)
    const merged = mergeTelemetryPayloadForIngest({
      existingPayload: latest?.payload,
      incomingPayload: payload,
      receivedAt,
    })

    if (!merged.ok) {
      console.warn('[telemetry-ingest]', merged.logDetails)

      return NextResponse.json(merged.response, { status: merged.status })
    }

    await storeTelemetryPacket({
      node,
      payload: merged.payload,
      updatedAt: receivedAt,
    })

    if (merged.source === 'android-gps') {
      console.info('[telemetry-ingest]', {
        source: merged.source,
        node,
        gpsUpdatedAt: receivedAt,
        lat: merged.response.lat,
        lng: merged.response.lng,
      })
    }

    return NextResponse.json(merged.response)
  } catch (error) {
    logTelemetryApiError('/api/telemetry/ingest', error, { node })

    return NextResponse.json(
      telemetryErrorJson(error, 'Failed to store telemetry packet.'),
      { status: 500 }
    )
  }
}

function normalizeTelemetryIngest(body: Record<string, unknown>) {
  if (typeof body.node !== 'string' || !body.node.trim()) {
    return { ok: false as const }
  }

  if (!isJsonObject(body.payload)) {
    return { ok: false as const }
  }

  return {
    ok: true as const,
    node: normalizeTelemetryNode(body.node),
    payload: body.payload,
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
