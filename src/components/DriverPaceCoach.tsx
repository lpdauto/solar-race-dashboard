'use client'

import PaceGauge from '@/components/PaceGauge'
import type { RouteSegment } from '@/data/raceRoute'
import type { PredictiveStrategyResult } from '@/lib/strategyEngine'
import type { TelemetryData } from '@/types/telemetry'

type PaceStatus =
  | 'GOOD'
  | 'SLIGHTLY FAST'
  | 'TOO FAST'
  | 'TOO SLOW'
  | 'CONSERVE NOW'
  | 'THERMAL LIMIT'

type DriverPaceCoachProps = {
  telemetry: TelemetryData | null
  predictiveStrategy: PredictiveStrategyResult
  currentSegment: RouteSegment | null
  upcomingSegment: RouteSegment | null
}

const statusStyles: Record<PaceStatus, string> = {
  GOOD: 'border-emerald-400/60 bg-emerald-400/10 text-emerald-100',
  'SLIGHTLY FAST': 'border-yellow-300/60 bg-yellow-300/10 text-yellow-100',
  'TOO FAST': 'border-red-400/70 bg-red-500/10 text-red-100',
  'TOO SLOW': 'border-yellow-300/60 bg-yellow-300/10 text-yellow-100',
  'CONSERVE NOW': 'border-red-400/70 bg-red-500/10 text-red-100',
  'THERMAL LIMIT': 'border-red-400/70 bg-red-500/10 text-red-100',
}

const eventLabels: Record<RouteSegment['type'], string> = {
  climb: 'Climb',
  descent: 'Descent',
  flat: 'Flat',
  stop: 'Stop',
  town: 'Town',
  caution: 'Caution',
}

export default function DriverPaceCoach({
  telemetry,
  predictiveStrategy,
  currentSegment,
  upcomingSegment,
}: DriverPaceCoachProps) {
  const currentSpeed = telemetry?.speedMph ?? predictiveStrategy.recommendedSpeedMph
  const recommendedSpeed = predictiveStrategy.recommendedSpeedMph
  const controllerTemp = telemetry?.controllerTempC ?? 0
  const motorTemp = telemetry?.motorTempC ?? 0
  const speedDelta = currentSpeed - recommendedSpeed
  const status = getPaceStatus({
    speedDelta,
    projectedFinishSoc: predictiveStrategy.projectedFinishSoc,
    controllerTemp,
    motorTemp,
  })
  const instruction = getDriverInstruction({
    status,
    speedDelta,
    currentSegment,
    upcomingSegment,
  })
  const nextEvent = getNextEvent(currentSegment, upcomingSegment)
  const isCritical = status === 'TOO FAST' || status === 'CONSERVE NOW' || status === 'THERMAL LIMIT'

  return (
    <section
      className={`rounded-xl border bg-[#151515] p-4 shadow-2xl shadow-black/30 sm:p-5 ${
        isCritical
          ? 'animate-pulse border-red-400/70'
          : 'border-[#ff3ea5]/25'
      }`}
    >
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(300px,0.9fr)_1.1fr] xl:items-center">
        <div className="rounded-lg border border-white/10 bg-black/30 p-3">
          <PaceGauge
            currentSpeedMph={currentSpeed}
            recommendedSpeedMph={recommendedSpeed}
            status={status}
          />
        </div>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff8fcb]">
                Driver Pace Coach
              </p>
              <h2 className="mt-1 text-4xl font-black text-white sm:text-5xl">
                {instruction}
              </h2>
            </div>
            <span
              className={`rounded-lg border px-4 py-2 text-lg font-black uppercase tracking-wide ${statusStyles[status]}`}
            >
              {status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <BigMetric label="Current" value={currentSpeed.toFixed(1)} unit="mph" />
            <BigMetric label="Target" value={String(recommendedSpeed)} unit="mph" />
            <BigMetric
              label="Delta"
              value={`${speedDelta >= 0 ? '+' : ''}${speedDelta.toFixed(1)}`}
              unit="mph"
            />
            <BigMetric
              label="Finish SOC"
              value={predictiveStrategy.projectedFinishSoc.toFixed(0)}
              unit="%"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <SmallMetric label="Controller" value={controllerTemp ? `${controllerTemp.toFixed(0)} C` : '--'} />
            <SmallMetric label="Motor" value={motorTemp ? `${motorTemp.toFixed(0)} C` : '--'} />
            <SmallMetric label="Next Event" value={nextEvent} />
          </div>
        </div>
      </div>
    </section>
  )
}

function getPaceStatus({
  speedDelta,
  projectedFinishSoc,
  controllerTemp,
  motorTemp,
}: {
  speedDelta: number
  projectedFinishSoc: number
  controllerTemp: number
  motorTemp: number
}): PaceStatus {
  if (controllerTemp > 85 || motorTemp > 95) return 'THERMAL LIMIT'
  if (projectedFinishSoc < 15) return 'CONSERVE NOW'
  if (Math.abs(speedDelta) <= 1.5) return 'GOOD'
  if (speedDelta > 1.5 && speedDelta <= 4) return 'SLIGHTLY FAST'
  if (speedDelta > 4) return 'TOO FAST'
  if (speedDelta < -4) return 'TOO SLOW'
  return 'GOOD'
}

function getDriverInstruction({
  status,
  speedDelta,
  currentSegment,
  upcomingSegment,
}: {
  status: PaceStatus
  speedDelta: number
  currentSegment: RouteSegment | null
  upcomingSegment: RouteSegment | null
}) {
  if (status === 'THERMAL LIMIT') return 'Watch temps'
  if (status === 'CONSERVE NOW' || status === 'TOO FAST') return 'Slow down now'
  if (status === 'SLIGHTLY FAST') return `Ease down ${Math.max(2, Math.round(speedDelta))} mph`
  if (currentSegment?.type === 'descent') return 'Use regen carefully'
  if (upcomingSegment?.type === 'climb') return 'Prepare for climb'
  return 'Hold pace'
}

function getNextEvent(
  currentSegment: RouteSegment | null,
  upcomingSegment: RouteSegment | null
) {
  const eventSegment =
    upcomingSegment &&
    ['climb', 'descent', 'stop', 'caution', 'town'].includes(upcomingSegment.type)
      ? upcomingSegment
      : currentSegment

  if (!eventSegment) return 'Ready'

  return `${eventLabels[eventSegment.type]} ${eventSegment.mileStart.toFixed(1)}`
}

function BigMetric({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit: string
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a8a8a8]">
        {label}
      </p>
      <div className="mt-1 flex items-end gap-1">
        <p className="text-3xl font-black text-white sm:text-4xl">{value}</p>
        <p className="pb-1 text-sm font-bold text-[#cfcfcf]">{unit}</p>
      </div>
    </div>
  )
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a8a8a8]">
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  )
}
