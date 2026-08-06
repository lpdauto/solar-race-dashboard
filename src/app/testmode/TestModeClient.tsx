'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTelemetry } from '@/hooks/useTelemetry'
import type { TelemetryData } from '@/types/telemetry'

type TestTelemetrySample = {
  timestamp: number
  gpsLat?: number | null
  gpsLng?: number | null
  gpsLatitude?: number | null
  gpsLongitude?: number | null
  gpsSpeedMps?: number | null
  gpsSpeedMph?: number | null
  gpsHeading?: number | null
  gpsAltitudeMeters?: number | null
  gpsAltitudeFeet?: number | null
  gpsAccuracyMeters?: number | null
  gpsClientTimestamp?: number | null
  gpsServerTimestamp?: number | null
  gpsAgeMs?: number | null
  gpsStatus?: string | null
  gpsProviderName?: string | null
  gpsSource?: string | null
  speedMph?: number | null
  distanceMiles?: number | null
  batterySocPercent?: number | null
  batteryVoltage?: number | null
  batteryCurrent?: number | null
  batteryPowerWatts?: number | null
  whPerMile?: number | null
  motorTempC?: number | null
  controllerTempC?: number | null
  controllerSpeedMph?: number | null
  motorRpm?: number | null
  throttlePercent?: number | null
  throttleVoltage?: number | null
  phaseA?: number | null
  phaseC?: number | null
  modulation?: number | null
  gear?: number | null
  controllerSerial?: string | null
  controllerFaultCode?: number | null
  controllerState?: string | null
  bleConnected?: boolean | null
  packetRateHz?: number | null
  solarPowerWatts?: number | null
  mpptPowerWatts?: number | null
  bmsConnected?: boolean | null
  bmsAddress?: string | null
  bmsVoltage?: number | null
  bmsCurrent?: number | null
  bmsPowerWatts?: number | null
  bmsSocPercent?: number | null
  avgCellVoltage?: number | null
  cellMinVoltage?: number | null
  cellMaxVoltage?: number | null
  cellDeltaMv?: number | null
  batteryTemp1C?: number | null
  batteryTemp2C?: number | null
  mosTempC?: number | null
}

type TestSession = {
  id: string
  name: string
  startedAt: string
  endedAt: string
  sampleCount: number
  durationSeconds?: number
  distanceMiles?: number
  averageSpeed?: number | null
  averageWhPerMile?: number | null
  samples: TestTelemetrySample[]
}

type ActiveRecording = {
  id: string
  name: string
  startedAt: string
  samples: TestTelemetrySample[]
}

const storageKey = 'rx2-testmode-sessions-v1'
const activeStorageKey = 'rx2-testmode-active-v1'
const cloudNodeStorageKey = 'rx2-testmode-cloud-node-v1'
const defaultTestCloudNode = 'vehicle-test'
const sampleIntervalMs = 1000

export default function TestModeClient() {
  const telemetryController = useTelemetry()
  const telemetry = telemetryController.telemetry
  const [testName, setTestName] = useState('')
  const [cloudNodeInput, setCloudNodeInput] = useState(defaultTestCloudNode)
  const [sessions, setSessions] = useState<TestSession[]>([])
  const [activeRecording, setActiveRecording] = useState<ActiveRecording | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const activeRecordingRef = useRef<ActiveRecording | null>(null)
  const telemetryRef = useRef<TelemetryData | null>(null)
  const nextDefaultName = useMemo(
    () => `Test ${String(sessions.length + 1).padStart(3, '0')}`,
    [sessions.length]
  )
  const distanceRecorded = useMemo(
    () => calculateRecordedDistance(activeRecording?.samples ?? []),
    [activeRecording]
  )
  const telemetryStatus = activeRecording
    ? 'RECORDING'
    : isTelemetryConnected(telemetryController.effectiveStatus, telemetry)
      ? 'CONNECTED'
      : 'NO DATA'

  useEffect(() => {
    setSessions(readSessions())
    const restored = readActiveRecording()

    if (restored) {
      setActiveRecording(restored)
      activeRecordingRef.current = restored
    }

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

  useEffect(() => {
    telemetryRef.current = telemetry
  }, [telemetry])

  useEffect(() => {
    activeRecordingRef.current = activeRecording

    if (activeRecording) {
      localStorage.setItem(activeStorageKey, JSON.stringify(activeRecording))
      setElapsedSeconds(secondsBetween(activeRecording.startedAt, new Date().toISOString()))
    } else {
      localStorage.removeItem(activeStorageKey)
      setElapsedSeconds(0)
    }
  }, [activeRecording])

  useEffect(() => {
    if (!activeRecording) return

    const elapsedId = window.setInterval(() => {
      const current = activeRecordingRef.current
      if (!current) return
      setElapsedSeconds(secondsBetween(current.startedAt, new Date().toISOString()))
    }, 1000)

    const sampleId = window.setInterval(() => {
      const current = activeRecordingRef.current
      if (!current) return

      setActiveRecording({
        ...current,
        samples: [...current.samples, createSample(telemetryRef.current)],
      })
    }, sampleIntervalMs)

    return () => {
      window.clearInterval(elapsedId)
      window.clearInterval(sampleId)
    }
  }, [activeRecording?.id])

  function startRecording() {
    if (activeRecording) return

    const name = testName.trim() || nextDefaultName
    const now = new Date().toISOString()
    const recording: ActiveRecording = {
      id: createSessionId(),
      name,
      startedAt: now,
      samples: [createSample(telemetry)],
    }

    setActiveRecording(recording)
    setTestName('')
  }

  function stopRecording() {
    const recording = activeRecordingRef.current
    if (!recording) return
    const endedAt = new Date().toISOString()

    const saved: TestSession = {
      ...recording,
      endedAt,
      sampleCount: recording.samples.length,
      ...summarizeSamples({
        startedAt: recording.startedAt,
        endedAt,
        samples: recording.samples,
      }),
    }
    const nextSessions = [saved, ...sessions]

    setSessions(nextSessions)
    writeSessions(nextSessions)
    setActiveRecording(null)
  }

  function deleteSession(sessionId: string) {
    const nextSessions = sessions.filter((session) => session.id !== sessionId)
    setSessions(nextSessions)
    writeSessions(nextSessions)
  }

  return (
    <main className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-4">
        <header className="rounded-lg border border-[#ff3ea5]/25 bg-[#050505] p-4 shadow-xl shadow-black/20">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff8fcb]">
            Telemetry recorder
          </p>
          <h1 className="mt-2 text-3xl font-black text-white">RX2 Test Mode</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Record live vehicle telemetry locally during test sessions. Data stays in this browser.
          </p>
        </header>

        <section className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
                Cloud node (Redis)
              </span>
              <input
                value={cloudNodeInput}
                onChange={(event) => setCloudNodeInput(event.target.value)}
                placeholder={defaultTestCloudNode}
                disabled={Boolean(activeRecording)}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-[#ff3ea5]/50"
              />
            </label>
            <button
              type="button"
              onClick={applyCloudNode}
              disabled={Boolean(activeRecording)}
              className="h-11 rounded-md border border-white/10 bg-white/5 px-4 text-sm font-black text-white transition hover:border-[#ff3ea5]/35 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Watch node
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
                Test name
              </span>
              <input
                value={testName}
                onChange={(event) => setTestName(event.target.value)}
                placeholder={nextDefaultName}
                disabled={Boolean(activeRecording)}
                className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-[#ff3ea5]/50"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={startRecording}
                disabled={Boolean(activeRecording)}
                className="h-11 rounded-md border border-emerald-400/35 bg-emerald-400/15 px-4 text-sm font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Start Recording
              </button>
              <button
                type="button"
                onClick={stopRecording}
                disabled={!activeRecording}
                className="h-11 rounded-md border border-[#ff3ea5]/35 bg-[#ff3ea5]/15 px-4 text-sm font-black text-[#ff8fcb] transition hover:bg-[#ff3ea5]/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Stop Recording
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Recording status" value={activeRecording ? 'ON' : 'OFF'} />
            <Metric label="Telemetry Status" value={telemetryStatus} />
            <Metric label="Recording Rate" value={formatSampleRate(sampleIntervalMs)} />
            <Metric label="Elapsed time" value={formatDuration(elapsedSeconds)} />
            <Metric label="Sample count" value={String(activeRecording?.samples.length ?? 0)} />
            <Metric label="Distance recorded" value={`${distanceRecorded.toFixed(3)} mi`} />
            <Metric label="Current speed" value={formatNumber(telemetry?.speedMph, ' mph', 1)} />
            <Metric label="Current SOC" value={formatNumber(telemetry?.batterySocPercent, '%', 1)} />
            <Metric label="Current Wh/mi" value={formatWhPerMile(telemetry)} />
            <Metric label="Telemetry source" value={telemetryController.source} />
            <Metric label="Cloud node" value={telemetryController.cloudNode} />
          </div>
        </section>

        <section className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
              Saved test sessions
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Stored locally in this browser. Export anything important before clearing browser data.
            </p>
          </div>

          {sessions.length === 0 ? (
            <p className="rounded-md border border-white/10 bg-black/25 p-3 text-sm font-semibold text-slate-300">
              No saved test sessions yet.
            </p>
          ) : (
            <div className="grid gap-3">
              {sessions.map((session) => (
                <article
                  key={session.id}
                  className="grid gap-3 rounded-md border border-white/10 bg-black/25 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-black text-white">
                      {session.name}
                    </h2>
                    <SessionSummary session={session} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => downloadSessionCsv(session)}
                      className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-xs font-black text-white transition hover:border-[#ff3ea5]/35"
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadSessionJson(session)}
                      className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-xs font-black text-white transition hover:border-[#ff3ea5]/35"
                    >
                      Export JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSession(session.id)}
                      className="h-10 rounded-md border border-red-400/30 bg-red-400/10 px-3 text-xs font-black text-red-200 transition hover:bg-red-400/15"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function createSample(telemetry: TelemetryData | null): TestTelemetrySample {
  const location = telemetry?.location

  return {
    timestamp: Date.now(),
    gpsLat: nullableNumber(location?.latitude ?? telemetry?.gpsLat),
    gpsLng: nullableNumber(location?.longitude ?? telemetry?.gpsLng),
    gpsLatitude: nullableNumber(location?.latitude ?? telemetry?.gpsLat),
    gpsLongitude: nullableNumber(location?.longitude ?? telemetry?.gpsLng),
    gpsSpeedMps: nullableNumber(location?.speedMps ?? telemetry?.gpsSpeed),
    gpsSpeedMph: nullableNumber(location?.speedMph ?? telemetry?.speedMph),
    gpsHeading: nullableNumber(location?.heading ?? telemetry?.gpsHeading),
    gpsAltitudeMeters: nullableNumber(location?.altitudeMeters),
    gpsAltitudeFeet: nullableNumber(location?.altitudeFeet ?? telemetry?.gpsElevationFt),
    gpsAccuracyMeters: nullableNumber(location?.accuracyMeters ?? telemetry?.gpsAccuracy),
    gpsClientTimestamp: nullableNumber(location?.clientTimestamp),
    gpsServerTimestamp: nullableNumber(location?.serverTimestamp),
    gpsAgeMs: nullableNumber(location?.ageMs ?? telemetry?.gpsAgeMs),
    gpsStatus: location?.status ?? null,
    gpsProviderName: location?.providerName ?? null,
    gpsSource: location?.source ?? null,
    speedMph: nullableNumber(telemetry?.speedMph),
    distanceMiles: nullableNumber(telemetry?.distanceMiles ?? telemetry?.odometerMiles),
    batterySocPercent: nullableNumber(telemetry?.batterySocPercent),
    batteryVoltage: nullableNumber(telemetry?.batteryVoltage),
    batteryCurrent: nullableNumber(telemetry?.batteryCurrent),
    batteryPowerWatts: nullableNumber(telemetry?.batteryPowerWatts),
    whPerMile: nullableNumber(telemetry?.efficiencyWhPerMile ?? telemetry?.whPerMile),
    motorTempC: nullableNumber(telemetry?.motorTempC),
    controllerTempC: nullableNumber(telemetry?.controllerTempC),
    controllerSpeedMph: nullableNumber(telemetry?.controllerSpeedMph),
    motorRpm: nullableNumber(telemetry?.motorRpm),
    throttlePercent: nullableNumber(telemetry?.throttlePercent),
    throttleVoltage: nullableNumber(telemetry?.throttleVoltage),
    phaseA: nullableNumber(telemetry?.phaseA),
    phaseC: nullableNumber(telemetry?.phaseC),
    modulation: nullableNumber(telemetry?.modulation),
    gear: nullableNumber(telemetry?.gear),
    controllerSerial: telemetry?.controllerSerial ?? null,
    controllerFaultCode: nullableNumber(telemetry?.controllerFaultCode),
    controllerState: telemetry?.controllerState ?? null,
    bleConnected: nullableBoolean(telemetry?.bleConnected),
    packetRateHz: nullableNumber(telemetry?.packetRateHz),
    solarPowerWatts: nullableNumber(telemetry?.solarPowerWatts),
    mpptPowerWatts: nullableNumber(
      telemetry?.mpptPowerWatts ??
        telemetry?.mpptPvPowerWatts ??
        telemetry?.mpptChargePowerWatts
    ),
    bmsConnected: nullableBoolean(telemetry?.bmsConnected),
    bmsAddress: telemetry?.bmsAddress ?? null,
    bmsVoltage: nullableNumber(telemetry?.bmsVoltage),
    bmsCurrent: nullableNumber(telemetry?.bmsCurrent),
    bmsPowerWatts: nullableNumber(telemetry?.bmsPowerWatts),
    bmsSocPercent: nullableNumber(telemetry?.bmsSocPercent),
    avgCellVoltage: nullableNumber(telemetry?.avgCellVoltage),
    cellMinVoltage: nullableNumber(telemetry?.cellMinVoltage),
    cellMaxVoltage: nullableNumber(telemetry?.cellMaxVoltage),
    cellDeltaMv: nullableNumber(telemetry?.cellDeltaMv),
    batteryTemp1C: nullableNumber(telemetry?.batteryTemp1C),
    batteryTemp2C: nullableNumber(telemetry?.batteryTemp2C),
    mosTempC: nullableNumber(telemetry?.mosTempC),
  }
}

function summarizeSamples({
  startedAt,
  endedAt,
  samples,
}: {
  startedAt: string
  endedAt: string
  samples: TestTelemetrySample[]
}) {
  return {
    durationSeconds: secondsBetween(startedAt, endedAt),
    distanceMiles: calculateRecordedDistance(samples),
    averageSpeed: averageSampleValue(samples, 'speedMph'),
    averageWhPerMile: averageSampleValue(samples, 'whPerMile'),
  }
}

function sessionSummary(session: TestSession) {
  const fallback = summarizeSamples({
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    samples: session.samples,
  })

  return {
    durationSeconds: session.durationSeconds ?? fallback.durationSeconds,
    distanceMiles: session.distanceMiles ?? fallback.distanceMiles,
    averageSpeed: session.averageSpeed ?? fallback.averageSpeed,
    averageWhPerMile: session.averageWhPerMile ?? fallback.averageWhPerMile,
  }
}

function averageSampleValue(
  samples: TestTelemetrySample[],
  key: keyof Pick<TestTelemetrySample, 'speedMph' | 'whPerMile'>
) {
  const values = samples
    .map((sample) => sample[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (values.length === 0) return null

  return values.reduce((total, value) => total + value, 0) / values.length
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#ff3ea5]/25 bg-black/35 p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff8fcb]">
        {label}
      </p>
      <p className="mt-1 break-words text-lg font-black text-white">{value}</p>
    </div>
  )
}

function SessionSummary({ session }: { session: TestSession }) {
  const summary = sessionSummary(session)
  const startedAt = new Date(session.startedAt)

  return (
    <div className="mt-2 grid gap-1 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
      <span>Date: {formatDate(startedAt)}</span>
      <span>Start: {formatTime(startedAt)}</span>
      <span>Duration: {formatClockDuration(summary.durationSeconds)}</span>
      <span>Distance: {formatNumber(summary.distanceMiles, ' mi', 1)}</span>
      <span>Samples: {session.sampleCount}</span>
      <span>Avg Speed: {formatNumber(summary.averageSpeed, ' mph', 1)}</span>
      <span>Avg Wh/mi: {formatNumber(summary.averageWhPerMile, ' Wh/mi', 1)}</span>
    </div>
  )
}

function readSessions(): TestSession[] {
  return readJson<TestSession[]>(storageKey, [])
}

function writeSessions(sessions: TestSession[]) {
  localStorage.setItem(storageKey, JSON.stringify(sessions))
}

function readActiveRecording(): ActiveRecording | null {
  return readJson<ActiveRecording | null>(activeStorageKey, null)
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

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function downloadSessionCsv(session: TestSession) {
  const columns: Array<keyof TestTelemetrySample> = [
    'timestamp',
    'gpsLat',
    'gpsLng',
    'gpsLatitude',
    'gpsLongitude',
    'gpsSpeedMps',
    'gpsSpeedMph',
    'gpsHeading',
    'gpsAltitudeMeters',
    'gpsAltitudeFeet',
    'gpsAccuracyMeters',
    'gpsClientTimestamp',
    'gpsServerTimestamp',
    'gpsAgeMs',
    'gpsStatus',
    'gpsProviderName',
    'gpsSource',
    'speedMph',
    'distanceMiles',
    'batterySocPercent',
    'batteryVoltage',
    'batteryCurrent',
    'batteryPowerWatts',
    'whPerMile',
    'motorTempC',
    'controllerTempC',
    'controllerSpeedMph',
    'motorRpm',
    'throttlePercent',
    'throttleVoltage',
    'phaseA',
    'phaseC',
    'modulation',
    'gear',
    'controllerSerial',
    'controllerFaultCode',
    'controllerState',
    'bleConnected',
    'packetRateHz',
    'solarPowerWatts',
    'mpptPowerWatts',
    'bmsConnected',
    'bmsAddress',
    'bmsVoltage',
    'bmsCurrent',
    'bmsPowerWatts',
    'bmsSocPercent',
    'avgCellVoltage',
    'cellMinVoltage',
    'cellMaxVoltage',
    'cellDeltaMv',
    'batteryTemp1C',
    'batteryTemp2C',
    'mosTempC',
  ]
  const header = columns.join(',')
  const rows = session.samples.map((sample) =>
    columns.map((column) => csvCell(sample[column])).join(',')
  )

  downloadTextFile({
    filename: `${fileSafeName(session.name)}_${fileTimestamp(session.startedAt)}.csv`,
    mimeType: 'text/csv;charset=utf-8',
    content: [header, ...rows].join('\n'),
  })
}

function downloadSessionJson(session: TestSession) {
  downloadTextFile({
    filename: `${fileSafeName(session.name)}_${fileTimestamp(session.startedAt)}.json`,
    mimeType: 'application/json;charset=utf-8',
    content: JSON.stringify(session, null, 2),
  })
}

function downloadTextFile({
  filename,
  mimeType,
  content,
}: {
  filename: string
  mimeType: string
  content: string
}) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function csvCell(value: unknown) {
  if (value === undefined || value === null) return ''
  const text = String(value)

  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function nullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nullableBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function formatNumber(value: unknown, suffix: string, digits = 0) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(digits)}${suffix}`
    : '--'
}

function formatSampleRate(intervalMs: number) {
  const seconds = intervalMs / 1000

  if (seconds === 1) return '1 sample/sec'

  return `1 sample/${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)} sec`
}

function formatWhPerMile(telemetry: TelemetryData | null) {
  return formatNumber(telemetry?.efficiencyWhPerMile ?? telemetry?.whPerMile, ' Wh/mi', 0)
}

function calculateRecordedDistance(samples: TestTelemetrySample[]) {
  const distances = samples
    .map((sample) => sample.distanceMiles)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (distances.length < 2) return 0

  return Math.max(0, distances[distances.length - 1] - distances[0])
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatClockDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatDate(date: Date) {
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleDateString()
}

function formatTime(date: Date) {
  return Number.isNaN(date.getTime())
    ? '--'
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function secondsBetween(startIso: string, endIso: string) {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)

  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0

  return Math.max(0, Math.round((end - start) / 1000))
}

function createSessionId() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function fileSafeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    || 'rx2test'
}

function fileTimestamp(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'unknown-time'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}_${hours}${minutes}`
}

function isTelemetryConnected(
  status: ReturnType<typeof useTelemetry>['effectiveStatus'],
  telemetry: TelemetryData | null
) {
  return Boolean(telemetry) && (status === 'connected' || status === 'simulated')
}
