'use client'

import { useMemo, useState } from 'react'
import StrategyCallout, {
  type StrategyCalloutType,
} from '@/components/StrategyCallout'
import type {
  RaceDay,
  RiskLevel,
  RouteSegment,
  SegmentType,
} from '@/data/raceRoute'

type RaceNavigatorProps = {
  raceDay: RaceDay
  currentMileExternal?: number
  onCurrentMileChange?: (mile: number) => void
}

type ViewMode = 'driver' | 'chase'

const riskStyles: Record<RiskLevel, string> = {
  low: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100',
  high: 'border-orange-400/40 bg-orange-400/10 text-orange-100',
  severe: 'border-red-400/40 bg-red-400/10 text-red-100',
}

const typeStyles: Record<SegmentType, string> = {
  climb: 'border-rose-300/30 bg-rose-300/10 text-rose-100',
  descent: 'border-sky-300/30 bg-sky-300/10 text-sky-100',
  flat: 'border-teal-300/30 bg-teal-300/10 text-teal-100',
  stop: 'border-slate-300/30 bg-slate-300/10 text-slate-100',
  town: 'border-violet-300/30 bg-violet-300/10 text-violet-100',
  caution: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
}

export default function RaceNavigator({
  raceDay,
  currentMileExternal,
  onCurrentMileChange,
}: RaceNavigatorProps) {
  const sortedSegments = useMemo(
    () => [...raceDay.segments].sort((a, b) => a.mileStart - b.mileStart),
    [raceDay.segments]
  )
  const [currentMileInternal, setCurrentMileInternal] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('driver')
  const currentMile = currentMileExternal ?? currentMileInternal

  const currentSegment =
    sortedSegments.find(
      (segment) =>
        currentMile >= segment.mileStart && currentMile <= segment.mileEnd
    ) ?? sortedSegments[sortedSegments.length - 1]
  const currentSegmentIndex = sortedSegments.findIndex(
    (segment) => segment === currentSegment
  )
  const nextSegment =
    sortedSegments.find((segment) => segment.mileStart > currentMile) ?? null
  const upcomingWindowEnd = Math.min(currentMile + 10, raceDay.distanceMiles)
  const upcomingSegments = sortedSegments.filter(
    (segment) =>
      segment.mileStart > currentMile && segment.mileStart <= upcomingWindowEnd
  )
  const warningSegments = upcomingSegments.filter(
    (segment) =>
      segment.risk === 'medium' ||
      segment.risk === 'high' ||
      segment.risk === 'severe' ||
      segment.type === 'caution' ||
      segment.type === 'town' ||
      segment.type === 'stop'
  )
  const upcomingClimbs = upcomingSegments.filter(
    (segment) => segment.type === 'climb'
  )
  const upcomingDescents = upcomingSegments.filter(
    (segment) => segment.type === 'descent'
  )
  const upcomingOperations = upcomingSegments.filter(
    (segment) =>
      segment.type === 'town' ||
      segment.type === 'stop' ||
      segment.type === 'caution'
  )
  const distanceToNextSegment = nextSegment
    ? Math.max(0, nextSegment.mileStart - currentMile)
    : 0
  const distanceRemaining = Math.max(0, raceDay.distanceMiles - currentMile)
  const instruction = getInstruction(currentSegment)
  const nextWarning = warningSegments[0] ?? nextSegment

  function updateCurrentMile(value: number) {
    const nextMile = Math.min(
      raceDay.distanceMiles,
      Math.max(0, Number(value.toFixed(1)))
    )

    if (onCurrentMileChange) {
      onCurrentMileChange(nextMile)
    } else {
      setCurrentMileInternal(nextMile)
    }
  }

  function goToPreviousSegment() {
    const previousSegment = sortedSegments[Math.max(0, currentSegmentIndex - 1)]
    updateCurrentMile(previousSegment?.mileStart ?? 0)
  }

  function goToNextSegment() {
    if (nextSegment) {
      updateCurrentMile(nextSegment.mileStart)
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold text-teal-200">
            Live race-day navigator
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Simulate the team position to surface the next route, safety, and energy calls.
          </p>
        </div>

        <div className="grid grid-cols-2 rounded-md border border-white/10 bg-black/20 p-1 text-sm font-bold sm:flex">
          <button
            type="button"
            onClick={() => setViewMode('driver')}
            className={`h-10 rounded px-4 transition ${
              viewMode === 'driver'
                ? 'bg-teal-300 text-slate-950'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            Driver View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('chase')}
            className={`h-10 rounded px-4 transition ${
              viewMode === 'chase'
                ? 'bg-teal-300 text-slate-950'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            Chase View
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="grid flex-1 gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Current race mile
            </span>
            <input
              type="range"
              min="0"
              max={raceDay.distanceMiles}
              step="0.1"
              value={currentMile}
              onChange={(event) => updateCurrentMile(Number(event.target.value))}
              className="w-full accent-teal-300"
            />
          </label>
          <input
            type="number"
            min="0"
            max={raceDay.distanceMiles}
            step="0.1"
            value={currentMile}
            onChange={(event) => updateCurrentMile(Number(event.target.value))}
            className="h-11 rounded-md border border-white/10 bg-slate-950 px-3 text-lg font-bold text-white outline-none focus:border-teal-300/60 lg:w-32"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NavButton label="Start of day" onClick={() => updateCurrentMile(0)} />
          <NavButton label="Previous segment" onClick={goToPreviousSegment} />
          <NavButton label="Next segment" onClick={goToNextSegment} />
          <NavButton
            label="End of day"
            onClick={() => updateCurrentMile(raceDay.distanceMiles)}
          />
        </div>
      </section>

      {viewMode === 'driver' ? (
        <DriverView
          currentMile={currentMile}
          currentSegment={currentSegment}
          nextWarning={nextWarning}
          instruction={instruction}
          distanceRemaining={distanceRemaining}
        />
      ) : (
        <ChaseView
          currentMile={currentMile}
          currentSegment={currentSegment}
          nextSegment={nextSegment}
          distanceToNextSegment={distanceToNextSegment}
          distanceRemaining={distanceRemaining}
          upcomingSegments={upcomingSegments}
          warningSegments={warningSegments}
          upcomingClimbs={upcomingClimbs}
          upcomingDescents={upcomingDescents}
          upcomingOperations={upcomingOperations}
          allSegments={sortedSegments}
          raceDay={raceDay}
        />
      )}
    </div>
  )
}

function DriverView({
  currentMile,
  currentSegment,
  nextWarning,
  instruction,
  distanceRemaining,
}: {
  currentMile: number
  currentSegment: RouteSegment
  nextWarning: RouteSegment | null
  instruction: string
  distanceRemaining: number
}) {
  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-teal-300/25 bg-teal-300/10 p-5 sm:p-6">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-100">
          Current Mile
        </p>
        <p className="mt-2 text-5xl font-black text-white sm:text-7xl">
          {currentMile.toFixed(1)}
        </p>
        <p className="mt-3 text-lg font-semibold text-slate-200">
          {distanceRemaining.toFixed(1)} miles remaining
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge label={currentSegment.risk} className={riskStyles[currentSegment.risk]} />
          <Badge label={currentSegment.type} className={typeStyles[currentSegment.type]} />
        </div>
        <h3 className="mt-4 text-3xl font-black text-white sm:text-4xl">
          {currentSegment.title}
        </h3>
        <p className="mt-3 text-xl leading-8 text-slate-200">
          {instruction}
        </p>
      </div>

      <StrategyCallout type={calloutTypeForSegment(nextWarning)}>
        <span className="block text-2xl font-black text-white">
          {nextWarning
            ? `${nextWarning.title} at mile ${nextWarning.mileStart}`
            : 'No upcoming warning'}
        </span>
        <span className="mt-2 block text-lg">
          {nextWarning
            ? nextWarning.notes
            : 'Continue steady operations through the end of the stage.'}
        </span>
      </StrategyCallout>
    </section>
  )
}

function ChaseView({
  currentMile,
  currentSegment,
  nextSegment,
  distanceToNextSegment,
  distanceRemaining,
  upcomingSegments,
  warningSegments,
  upcomingClimbs,
  upcomingDescents,
  upcomingOperations,
  allSegments,
  raceDay,
}: {
  currentMile: number
  currentSegment: RouteSegment
  nextSegment: RouteSegment | null
  distanceToNextSegment: number
  distanceRemaining: number
  upcomingSegments: RouteSegment[]
  warningSegments: RouteSegment[]
  upcomingClimbs: RouteSegment[]
  upcomingDescents: RouteSegment[]
  upcomingOperations: RouteSegment[]
  allSegments: RouteSegment[]
  raceDay: RaceDay
}) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Current segment" value={currentSegment.title} />
        <Metric label="Next segment" value={nextSegment?.title ?? 'Finish'} />
        <Metric label="Distance to next" value={`${distanceToNextSegment.toFixed(1)} mi`} />
        <Metric label="Distance remaining" value={`${distanceRemaining.toFixed(1)} mi`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <StrategyWindow title="Upcoming 10-mile Strategy Window">
          {upcomingSegments.length > 0 ? (
            upcomingSegments.map((segment) => (
              <SegmentMiniRow key={`${segment.mileStart}-${segment.title}`} segment={segment} />
            ))
          ) : (
            <p className="text-sm leading-6 text-slate-400">
              No new segment starts in the next 10 miles.
            </p>
          )}
        </StrategyWindow>

        <StrategyWindow title="Risk Warnings">
          {warningSegments.length > 0 ? (
            warningSegments.map((segment) => (
              <StrategyCallout
                key={`${segment.mileStart}-${segment.title}`}
                type={calloutTypeForSegment(segment)}
                title={`${segment.title} at mile ${segment.mileStart}`}
              >
                {segment.notes}
              </StrategyCallout>
            ))
          ) : (
            <StrategyCallout type="energy">
              Next 10 miles are clear of major new warnings. Keep SOC protected and communication cadence steady.
            </StrategyCallout>
          )}
        </StrategyWindow>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <StrategyWindow title="Upcoming Climbs">
          <SegmentSummary
            segments={upcomingClimbs}
            emptyText="No climbs start in the next 10 miles."
          />
        </StrategyWindow>
        <StrategyWindow title="Descents / Regen">
          <SegmentSummary
            segments={upcomingDescents}
            emptyText="No descent segments start in the next 10 miles."
          />
        </StrategyWindow>
        <StrategyWindow title="Towns / Stops / Cautions">
          <SegmentSummary
            segments={upcomingOperations}
            emptyText="No town, stop, or caution segment starts in the next 10 miles."
          />
        </StrategyWindow>
      </div>

      <StrategyCallout type="energy" title="Energy and SOC Reminder">
        Watch live Wh/mile against the simulation panel. If pace, wind, or climbing pushes draw above plan, reduce acceleration before battery margin disappears.
      </StrategyCallout>

      <StrategyWindow title="Route Packet Notes">
        <p className="text-sm leading-6 text-slate-300">{raceDay.strategySummary}</p>
        <p className="mt-3 text-sm leading-6 text-slate-400">{raceDay.terrainSummary}</p>
      </StrategyWindow>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
        <div className="grid grid-cols-[5.5rem_1fr_6rem_6rem] gap-2 border-b border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
          <span>Miles</span>
          <span>Segment</span>
          <span>Type</span>
          <span>Risk</span>
        </div>
        {allSegments.map((segment) => {
          const isActive =
            currentMile >= segment.mileStart && currentMile <= segment.mileEnd

          return (
            <div
              key={`${segment.mileStart}-${segment.title}`}
              className={`grid grid-cols-[5.5rem_1fr_6rem_6rem] gap-2 px-3 py-3 text-sm ${
                isActive ? 'bg-teal-300/10 text-white' : 'text-slate-300'
              }`}
            >
              <span className="font-semibold">
                {segment.mileStart}-{segment.mileEnd}
              </span>
              <span>{segment.title}</span>
              <span>{segment.type}</span>
              <span>{segment.risk}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function NavButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-teal-300/40 hover:bg-white/10"
    >
      {label}
    </button>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-base font-bold text-white">{value}</p>
    </div>
  )
}

function StrategyWindow({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <h3 className="text-base font-bold text-white">{title}</h3>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  )
}

function SegmentMiniRow({ segment }: { segment: RouteSegment }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-white">
          Mile {segment.mileStart}: {segment.title}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge label={segment.type} className={typeStyles[segment.type]} />
          <Badge label={segment.risk} className={riskStyles[segment.risk]} />
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{segment.strategy}</p>
    </div>
  )
}

function SegmentSummary({
  segments,
  emptyText,
}: {
  segments: RouteSegment[]
  emptyText: string
}) {
  if (segments.length === 0) {
    return <p className="text-sm leading-6 text-slate-400">{emptyText}</p>
  }

  return (
    <div className="grid gap-2">
      {segments.map((segment) => (
        <div
          key={`${segment.mileStart}-${segment.title}`}
          className="rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-300"
        >
          <p className="font-bold text-white">
            Mile {segment.mileStart}: {segment.title}
          </p>
          <p className="mt-1">{segment.notes}</p>
        </div>
      ))}
    </div>
  )
}

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`rounded border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${className}`}
    >
      {label}
    </span>
  )
}

function getInstruction(segment: RouteSegment) {
  if (
    segment.type === 'climb' &&
    (segment.risk === 'high' || segment.risk === 'severe')
  ) {
    return 'Reduce speed, keep throttle smooth, watch controller temperature.'
  }

  if (segment.type === 'descent') {
    return 'Use regen carefully. Avoid aggressive regen if battery SOC is high.'
  }

  if (segment.type === 'flat' && segment.risk === 'low') {
    return 'Hold steady aero-efficient speed. Avoid unnecessary acceleration.'
  }

  if (segment.type === 'caution') {
    return 'Prioritize safety and spacing. Chase team should prepare for traffic/shoulder constraints.'
  }

  if (segment.type === 'stop' || segment.type === 'town') {
    return 'Prepare for navigation, traffic, and possible team coordination.'
  }

  if (segment.type === 'climb') {
    return 'Reduce speed before the grade and hold a smooth power target.'
  }

  return 'Hold steady aero-efficient speed. Avoid unnecessary acceleration.'
}

function calloutTypeForSegment(
  segment: RouteSegment | null
): StrategyCalloutType {
  if (!segment) return 'energy'
  if (segment.type === 'climb') return 'climb'
  if (segment.type === 'descent') return 'descent'
  if (segment.type === 'caution') return 'caution'
  if (segment.type === 'stop') return 'stop'
  if (segment.type === 'town') return 'town'
  return 'energy'
}
