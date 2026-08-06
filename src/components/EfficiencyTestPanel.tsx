'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MetricTile } from '@/components/MetricTile'
import {
  firstFiniteNumber,
  multiplyIfFinite,
  useEfficiencyTestRun,
} from '@/hooks/useEfficiencyTestRun'
import { downloadRunCsv, downloadRunJson } from '@/lib/efficiencyRunExport'
import { formatDuration, formatNumber } from '@/lib/testModeFormat'
import type { TelemetryData } from '@/types/telemetry'
import type { TestRunChartPoint } from '@/types/efficiencyTest'

const presetTargetSpeedsMph = [30, 35, 40] as const
const presetTargetDistancesMiles = [2, 2.5, 3] as const

// The project has no dedicated chart-color palette (no other Recharts usage
// exists yet), so these reuse colors already established elsewhere on this
// page/theme: the brand pink for the live/dynamic series, the emerald used
// by the Start action for the steady/reference series.
const rollingLineColor = 'var(--racer-pink)'
const runAverageLineColor = '#34d399'
const gridColor = 'var(--card-border)'
const axisColor = 'var(--secondary-text)'

export default function EfficiencyTestPanel({
  telemetry,
  packetUpdatedAt,
  telemetryStatus,
}: {
  telemetry: TelemetryData | null
  packetUpdatedAt?: string | null
  telemetryStatus: 'CONNECTED' | 'NO DATA'
}) {
  const {
    status,
    targetSpeedMph,
    setTargetSpeedMph,
    targetDistanceMiles,
    setTargetDistanceMiles,
    liveSnapshot,
    chartPoints,
    completedRun,
    runHistory,
    startRun,
    endRun,
    resetRun,
    deleteHistoryRun,
  } = useEfficiencyTestRun(telemetry, packetUpdatedAt)

  const [runName, setRunName] = useState('')
  const [isCustomSpeed, setIsCustomSpeed] = useState(false)

  const nextDefaultName = useMemo(
    () => `Run ${String(runHistory.length + 1).padStart(3, '0')}`,
    [runHistory.length]
  )

  const isRunning = status === 'running'
  const currentSpeedMph = firstFiniteNumber(telemetry?.gpsSpeed, telemetry?.speedMph)
  const currentPowerW = firstFiniteNumber(
    multiplyIfFinite(telemetry?.batteryVoltage, telemetry?.batteryCurrent),
    telemetry?.batteryPowerWatts
  )

  function handleStart() {
    if (isRunning) return
    startRun(runName.trim() || nextDefaultName)
    setRunName('')
  }

  return (
    <section className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
          Baseline efficiency test
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Hold a steady speed for 2-3 miles, then Start Run. All telemetry is recorded from
          the moment you start; the Wh/mi chart begins once you&apos;re above 5 mph.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))] lg:items-end">
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
            Run name
          </span>
          <input
            value={runName}
            onChange={(event) => setRunName(event.target.value)}
            placeholder={nextDefaultName}
            disabled={isRunning}
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-[#ff3ea5]/50 disabled:cursor-not-allowed disabled:opacity-45"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
            Target speed
          </span>
          <select
            value={isCustomSpeed ? 'custom' : String(targetSpeedMph)}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'custom') {
                setIsCustomSpeed(true)
                return
              }
              setIsCustomSpeed(false)
              setTargetSpeedMph(Number(value))
            }}
            disabled={isRunning}
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-sm font-bold text-white outline-none transition focus:border-[#ff3ea5]/50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {presetTargetSpeedsMph.map((speed) => (
              <option key={speed} value={speed}>
                {speed} mph
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
          {isCustomSpeed ? (
            <input
              type="number"
              min={1}
              step={1}
              value={targetSpeedMph}
              onChange={(event) => setTargetSpeedMph(Number(event.target.value) || 0)}
              disabled={isRunning}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-sm font-bold text-white outline-none transition focus:border-[#ff3ea5]/50 disabled:cursor-not-allowed disabled:opacity-45"
            />
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
            Target distance
          </span>
          <select
            value={String(targetDistanceMiles)}
            onChange={(event) => setTargetDistanceMiles(Number(event.target.value))}
            disabled={isRunning}
            className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-sm font-bold text-white outline-none transition focus:border-[#ff3ea5]/50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {presetTargetDistancesMiles.map((distance) => (
              <option key={distance} value={distance}>
                {distance} mi
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2 lg:col-span-2">
          <button
            type="button"
            onClick={handleStart}
            disabled={isRunning}
            className="h-11 rounded-md border border-emerald-400/35 bg-emerald-400/15 px-4 text-sm font-black text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Start Run
          </button>
          <button
            type="button"
            onClick={endRun}
            disabled={!isRunning}
            className="h-11 rounded-md border border-[#ff3ea5]/35 bg-[#ff3ea5]/15 px-4 text-sm font-black text-[#ff8fcb] transition hover:bg-[#ff3ea5]/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            End Run
          </button>
          <button
            type="button"
            onClick={resetRun}
            className="col-span-2 h-11 rounded-md border border-white/10 bg-white/5 px-4 text-sm font-black text-white transition hover:border-red-400/35"
          >
            Reset Run
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <MetricTile
          label="Run status"
          value={status === 'running' ? 'RUNNING' : status === 'completed' ? 'COMPLETED' : 'IDLE'}
        />
        <MetricTile label="Telemetry status" value={telemetryStatus} />
        <MetricTile label="Sample count" value={String(liveSnapshot.sampleCount)} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <MetricTile label="Current speed" value={formatNumber(currentSpeedMph, ' mph', 1)} />
        <MetricTile label="Target speed" value={formatNumber(targetSpeedMph, ' mph', 0)} />
        <MetricTile
          label="Battery power"
          value={formatNumber(
            currentPowerW !== undefined ? currentPowerW / 1000 : null,
            ' kW',
            2
          )}
        />
        <MetricTile
          label="15s rolling Wh/mi"
          value={formatNumber(liveSnapshot.rollingWhPerMile, ' Wh/mi', 1)}
        />
        <MetricTile
          label="Run-average Wh/mi"
          value={formatNumber(liveSnapshot.runAverageWhPerMile, ' Wh/mi', 1)}
        />
        <MetricTile
          label="Distance"
          value={`${formatNumber(liveSnapshot.distanceMiles, '', 2)} / ${formatNumber(
            targetDistanceMiles,
            ' mi',
            1
          )}`}
        />
        <MetricTile label="Elapsed run time" value={formatDuration(liveSnapshot.elapsedSeconds)} />
        <MetricTile label="Motor temp" value={formatNumber(telemetry?.motorTempC, ' C', 1)} />
        <MetricTile
          label="Controller temp"
          value={formatNumber(telemetry?.controllerTempC, ' C', 1)}
        />
      </div>

      <div className="h-80 w-full rounded-md border border-white/10 bg-black/20 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartPoints} margin={{ top: 12, right: 20, bottom: 12, left: 4 }}>
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
            <XAxis
              dataKey="distanceMiles"
              type="number"
              domain={[0, 'dataMax']}
              tickFormatter={(value: number) => value.toFixed(1)}
              stroke={axisColor}
              tick={{ fill: axisColor, fontSize: 12 }}
              label={{
                value: 'Distance (mi)',
                position: 'insideBottom',
                offset: -6,
                fill: axisColor,
              }}
            />
            <YAxis
              stroke={axisColor}
              tick={{ fill: axisColor, fontSize: 12 }}
              label={{
                value: 'Wh/mi',
                angle: -90,
                position: 'insideLeft',
                fill: axisColor,
              }}
            />
            <Tooltip content={EfficiencyChartTooltip} />
            <Legend wrapperStyle={{ color: axisColor, fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="rollingWhPerMile"
              name="15s rolling Wh/mi"
              stroke={rollingLineColor}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="runAverageWhPerMile"
              name="Run-average Wh/mi"
              stroke={runAverageLineColor}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
        {chartPoints.length === 0 ? (
          <p className="mt-1 text-center text-xs font-semibold text-slate-500">
            No chart data yet -- the chart plots once the vehicle is above 5 mph.
          </p>
        ) : null}
      </div>

      {completedRun ? (
        <div className="grid gap-3 rounded-md border border-white/10 bg-black/25 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
            Run summary
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <MetricTile label="Run name" value={completedRun.name} />
            <MetricTile
              label="Date / time"
              value={new Date(completedRun.startedAt).toLocaleString()}
            />
            <MetricTile
              label="Target speed"
              value={formatNumber(completedRun.targetSpeedMph, ' mph', 0)}
            />
            <MetricTile
              label="Target distance"
              value={formatNumber(completedRun.targetDistanceMiles, ' mi', 1)}
            />
            <MetricTile
              label="Actual distance"
              value={formatNumber(completedRun.actualDistanceMiles, ' mi', 2)}
            />
            <MetricTile label="Elapsed time" value={formatDuration(completedRun.elapsedSeconds)} />
            <MetricTile
              label="Average speed"
              value={formatNumber(completedRun.averageSpeedMph, ' mph', 1)}
            />
            <MetricTile
              label="Average power"
              value={formatNumber(completedRun.averagePowerW / 1000, ' kW', 2)}
            />
            <MetricTile
              label="Total energy used"
              value={formatNumber(completedRun.totalEnergyWh, ' Wh', 1)}
            />
            <MetricTile
              label="Final average Wh/mi"
              value={formatNumber(completedRun.averageWhPerMile, ' Wh/mi', 1)}
            />
            <MetricTile
              label="Motor temp (start -> end)"
              value={`${formatNumber(completedRun.startingMotorTempC, ' C', 1)} -> ${formatNumber(
                completedRun.endingMotorTempC,
                ' C',
                1
              )}`}
            />
            <MetricTile
              label="Controller temp (start -> end)"
              value={`${formatNumber(
                completedRun.startingControllerTempC,
                ' C',
                1
              )} -> ${formatNumber(completedRun.endingControllerTempC, ' C', 1)}`}
            />
          </div>
        </div>
      ) : null}

      {runHistory.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
            Saved efficiency runs
          </p>
          <div className="grid gap-2">
            {runHistory.map((run) => (
              <div
                key={run.id}
                className="grid gap-3 rounded-md border border-white/10 bg-black/25 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black text-white">{run.name}</h3>
                  <p className="mt-1 text-sm text-slate-300">
                    {new Date(run.startedAt).toLocaleString()} &middot;{' '}
                    {formatNumber(run.targetSpeedMph, ' mph target', 0)} &middot;{' '}
                    {formatNumber(run.actualDistanceMiles, ' mi', 2)} &middot;{' '}
                    {formatNumber(run.averageWhPerMile, ' Wh/mi', 1)} &middot;{' '}
                    {run.samples.length} samples
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => downloadRunCsv(run)}
                    className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-xs font-black text-white transition hover:border-[#ff3ea5]/35"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadRunJson(run)}
                    className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-xs font-black text-white transition hover:border-[#ff3ea5]/35"
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteHistoryRun(run.id)}
                    className="h-10 rounded-md border border-red-400/30 bg-red-400/10 px-3 text-xs font-black text-red-200 transition hover:bg-red-400/15"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function EfficiencyChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: TestRunChartPoint }>
}) {
  if (!active || !payload || payload.length === 0) return null

  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="rounded-md border border-white/10 bg-black/90 p-3 text-xs text-slate-200 shadow-xl shadow-black/40">
      <p className="mb-1 font-black text-white">
        {formatNumber(point.distanceMiles, ' mi', 2)}
      </p>
      <p>Rolling Wh/mi: {formatNumber(point.rollingWhPerMile, ' Wh/mi', 1)}</p>
      <p>Run-average Wh/mi: {formatNumber(point.runAverageWhPerMile, ' Wh/mi', 1)}</p>
      <p>Speed: {formatNumber(point.speedMph, ' mph', 1)}</p>
      <p>Battery power: {formatNumber(point.powerW / 1000, ' kW', 2)}</p>
    </div>
  )
}
