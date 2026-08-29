'use client'

import { useEffect, useState } from 'react'
import { useTelemetry } from '@/hooks/useTelemetry'
import EfficiencyTestPanel from '@/components/EfficiencyTestPanel'

const cloudNodeStorageKey = 'rx2-testmode-cloud-node-v1'
const defaultTestCloudNode = 'vehicle-test'

// Test mode is a supervised, short recording session (not an unattended
// race-day dashboard), so it's safe to poll Redis faster than the default
// 10s -- gives 1s-resolution samples instead of ~10s-stale steps.
const testModeCloudPollIntervalMs = 1_000

export default function TestModeClient() {
  const telemetryController = useTelemetry({
    cloudPollIntervalMs: testModeCloudPollIntervalMs,
  })
  const telemetry = telemetryController.telemetry
  const [cloudNodeInput, setCloudNodeInput] = useState(defaultTestCloudNode)

  const telemetryStatus = isTelemetryConnected(telemetryController.effectiveStatus, telemetry)
    ? 'CONNECTED'
    : 'NO DATA'

  useEffect(() => {
    const storedNode = readCloudNode()
    setCloudNodeInput(storedNode)
    telemetryController.setCloudNode(storedNode)
    // Test mode watches an isolated 'vehicle-test' node by default so recorded
    // runs never collide with the live race-day 'vehicle' node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // setCloudNode() alone doesn't (re)start polling -- the hook only
    // auto-connects once on mount. Reconnect explicitly whenever the watched
    // node changes, including the very first time it's set above.
    telemetryController.connect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetryController.cloudNode])

  function applyCloudNode() {
    const node = cloudNodeInput.trim() || defaultTestCloudNode
    setCloudNodeInput(node)
    writeCloudNode(node)
    telemetryController.setCloudNode(node)
  }

  return (
    <main className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-4">
        <header className="rounded-lg border border-[#ff3ea5]/25 bg-[#050505] p-4 shadow-xl shadow-black/20">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff8fcb]">
            Telemetry recorder
          </p>
          <h1 className="mt-2 text-3xl font-black text-white">RX2 Test Palmdale</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Record live vehicle telemetry locally during test sessions. Data stays in this browser.
          </p>
        </header>

        <section className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
                Cloud node (Redis)
              </span>
              <input
                value={cloudNodeInput}
                onChange={(event) => setCloudNodeInput(event.target.value)}
                placeholder={defaultTestCloudNode}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-[#ff3ea5]/50"
              />
            </label>
            <button
              type="button"
              onClick={applyCloudNode}
              className="h-11 rounded-md border border-white/10 bg-white/5 px-4 text-sm font-black text-white transition hover:border-[#ff3ea5]/35"
            >
              Watch node
            </button>
          </div>
        </section>

        <EfficiencyTestPanel
          telemetry={telemetry}
          packetUpdatedAt={telemetryController.cloudPacketStatus?.updatedAt}
          telemetryStatus={telemetryStatus}
        />
      </div>
    </main>
  )
}

function readCloudNode(): string {
  try {
    return localStorage.getItem(cloudNodeStorageKey)?.trim() || defaultTestCloudNode
  } catch {
    return defaultTestCloudNode
  }
}

function writeCloudNode(node: string) {
  try {
    localStorage.setItem(cloudNodeStorageKey, node)
  } catch {
    // Ignore storage failures (e.g. private browsing).
  }
}

function isTelemetryConnected(
  status: ReturnType<typeof useTelemetry>['effectiveStatus'],
  telemetry: ReturnType<typeof useTelemetry>['telemetry']
) {
  return Boolean(telemetry) && (status === 'connected' || status === 'simulated')
}
