import { NextResponse } from 'next/server'
import { simulatorTelemetryToEsp32Packet } from '@/lib/esp32Telemetry'
import {
  logTelemetryApiError,
  normalizeTelemetryNode,
  storeTelemetryPacket,
  telemetryErrorJson,
  verifyTelemetryPacketStored,
} from '@/lib/redisTelemetry'
import { generateTelemetryFrame } from '@/lib/telemetrySimulator'

export function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  )
}

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null
  const node = normalizeTelemetryNode(body?.node)
  const telemetry = generateTelemetryFrame({})
  const payload = {
    ...simulatorTelemetryToEsp32Packet(telemetry),
    timestamp: Date.now(),
  }

  try {
    await storeTelemetryPacket({ node, payload })
    const verified = await verifyTelemetryPacketStored(node)

    return NextResponse.json({
      ok: true,
      node,
      payload,
      verified,
    })
  } catch (error) {
    logTelemetryApiError('/api/telemetry/test', error, { node })

    return NextResponse.json(
      telemetryErrorJson(error, 'Failed to store test telemetry packet.'),
      { status: 500 }
    )
  }
}
