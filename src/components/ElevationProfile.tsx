'use client'

import type { RiskLevel, RoutePoint } from '@/data/raceRoute'
import { useElevationProfile } from '@/hooks/useElevationProfile'
import {
  classifyGradeRisk,
  isDescentRegenOpportunity,
  type ElevationPoint,
  type ElevationStats,
} from '@/lib/elevation'

type ElevationProfileProps = {
  day: number
  routePoints: RoutePoint[]
}

const riskStyles: Record<RiskLevel, string> = {
  low: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100',
  high: 'border-orange-400/40 bg-orange-400/10 text-orange-100',
  severe: 'border-red-400/40 bg-red-400/10 text-[#ff8fcb]',
}

export default function ElevationProfile({
  day,
  routePoints,
}: ElevationProfileProps) {
  const { profile, stats, usedFallback, error, loading } = useElevationProfile(
    day,
    routePoints
  )

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-md border border-white/10 bg-black/20 p-6 text-sm font-semibold text-[#ff8fcb]">
        Loading elevation profile...
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {usedFallback ? (
        <div className="rounded-md border border-yellow-300/30 bg-yellow-300/10 p-3 text-sm leading-6 text-yellow-100">
          Elevation API unavailable, showing static mock profile.
          {error ? ` ${error}.` : ''}
        </div>
      ) : null}

      <div className="rounded-md border border-white/10 bg-black/20 p-3">
        <ElevationSvg profile={profile} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile label="Min elevation" value={`${stats.minElevation} ft`} />
        <StatTile label="Max elevation" value={`${stats.maxElevation} ft`} />
        <StatTile label="Total gain" value={`${stats.totalGain} ft`} />
        <StatTile label="Total loss" value={`${stats.totalLoss} ft`} />
        <StatTile
          label="Steepest climb"
          value={`${stats.steepestClimbGrade.toFixed(1)}%`}
        />
        <StatTile
          label="Steepest descent"
          value={`${stats.steepestDescentGrade.toFixed(1)}%`}
        />
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-300">
            Grade risk:
          </span>
          <RiskBadge risk={stats.highestGradeRisk} />
          {stats.steepestDescentGrade < -4 ? (
            <span className="rounded border border-sky-300/30 bg-sky-300/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-sky-100">
              Regen opportunity
            </span>
          ) : null}
        </div>
        <GradePointList profile={profile} />
      </div>

      <section className="rounded-md border border-white/10 bg-black/20 p-4">
        <h3 className="text-base font-bold text-white">Elevation Strategy</h3>
        <div className="mt-3">
          <ElevationStrategy stats={stats} />
        </div>
      </section>
    </div>
  )
}

export function ElevationStrategy({ stats }: { stats: ElevationStats }) {
  const recommendations = buildStrategyRecommendations(stats)

  return (
    <div className="grid gap-3">
      {recommendations.map((recommendation) => (
        <div
          key={recommendation}
          className="rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-200"
        >
          {recommendation}
        </div>
      ))}
    </div>
  )
}

function ElevationSvg({ profile }: { profile: ElevationPoint[] }) {
  const width = 720
  const height = 260
  const padding = { top: 22, right: 24, bottom: 42, left: 56 }

  if (profile.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-400">
        No elevation points available.
      </div>
    )
  }

  const maxMile = Math.max(...profile.map((point) => point.mile))
  const minElevation = Math.min(...profile.map((point) => point.elevationFeet))
  const maxElevation = Math.max(...profile.map((point) => point.elevationFeet))
  const elevationRange = Math.max(maxElevation - minElevation, 1)

  function xFor(mile: number) {
    return (
      padding.left +
      (mile / maxMile) * (width - padding.left - padding.right)
    )
  }

  function yFor(elevationFeet: number) {
    return (
      padding.top +
      ((maxElevation - elevationFeet) / elevationRange) *
        (height - padding.top - padding.bottom)
    )
  }

  const path = profile
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L'
      return `${command} ${xFor(point.mile).toFixed(1)} ${yFor(point.elevationFeet).toFixed(1)}`
    })
    .join(' ')

  const areaPath = `${path} L ${xFor(maxMile).toFixed(1)} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Elevation profile chart"
      className="h-auto w-full"
    >
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={height - padding.bottom}
        y2={height - padding.bottom}
        stroke="rgba(226,232,240,0.32)"
      />
      <line
        x1={padding.left}
        x2={padding.left}
        y1={padding.top}
        y2={height - padding.bottom}
        stroke="rgba(226,232,240,0.32)"
      />
      {[0, 0.5, 1].map((tick) => {
        const y = padding.top + tick * (height - padding.top - padding.bottom)
        const elevation = Math.round(maxElevation - tick * elevationRange)

        return (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="rgba(226,232,240,0.09)"
            />
            <text
              x={padding.left - 10}
              y={y + 4}
              textAnchor="end"
              className="fill-slate-400 text-[12px]"
            >
              {elevation} ft
            </text>
          </g>
        )
      })}
      {[0, 0.5, 1].map((tick) => {
        const x = padding.left + tick * (width - padding.left - padding.right)

        return (
          <text
            key={tick}
            x={x}
            y={height - 14}
            textAnchor="middle"
            className="fill-slate-400 text-[12px]"
          >
            {Math.round(maxMile * tick)} mi
          </text>
        )
      })}
      <path d={areaPath} fill="rgba(45, 212, 191, 0.12)" />
      <path
        d={path}
        fill="none"
        stroke="#ff3ea5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />
      {profile.map((point) => (
        <g key={`${point.mile}-${point.label ?? point.lat}`}>
          <circle
            cx={xFor(point.mile)}
            cy={yFor(point.elevationFeet)}
            r="5"
            fill="#0f172a"
            stroke="#fbbf24"
            strokeWidth="2"
          />
          {point.label ? (
            <text
              x={xFor(point.mile)}
              y={Math.max(14, yFor(point.elevationFeet) - 10)}
              textAnchor="middle"
              className="fill-slate-200 text-[11px] font-bold"
            >
              {point.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  )
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span
      className={`rounded border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${riskStyles[risk]}`}
    >
      {risk}
    </span>
  )
}

function GradePointList({ profile }: { profile: ElevationPoint[] }) {
  const notableGrades = profile
    .filter((point) => Math.abs(point.gradePercent ?? 0) >= 2)
    .slice(0, 4)

  if (notableGrades.length === 0) {
    return (
      <p className="text-sm leading-6 text-slate-400">
        Grades are mild across sampled route points.
      </p>
    )
  }

  return (
    <div className="grid gap-2">
      {notableGrades.map((point) => {
        const grade = point.gradePercent ?? 0
        const isRegen = isDescentRegenOpportunity(grade)

        return (
          <div
            key={`${point.mile}-${point.label}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 p-3 text-sm text-slate-200"
          >
            <span>
              Mile {point.mile}: {point.label ?? 'Route point'}
            </span>
            <span className="flex items-center gap-2">
              <span>{grade.toFixed(1)}%</span>
              {isRegen ? (
                <span className="text-sky-200">regen</span>
              ) : (
                <RiskBadge risk={classifyGradeRisk(grade)} />
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function buildStrategyRecommendations(stats: ElevationStats) {
  if (stats.hasMildGrades) {
    return ['Grades are mild. Favor steady aero-efficient cruising and keep power draw smooth across the stage.']
  }

  const recommendations: string[] = []

  if (stats.hasSteepClimbs) {
    recommendations.push(
      'Steep climbs exist. Reduce speed before the climb, hold a controller temperature limit, and avoid high-current surges over the crest.'
    )
  }

  if (stats.hasLongDescents) {
    recommendations.push(
      'Long descents exist. Monitor regen behavior and avoid overcharging when state of charge is already high.'
    )
  }

  if (stats.hasHighGain) {
    recommendations.push(
      'Total elevation gain is high. Battery use may exceed flat-road estimates, so preserve reserve before committing to faster cruise speeds.'
    )
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Grades are moderate. Keep a steady target speed, watch live Wh/mile, and use descents to recover margin.'
    )
  }

  return recommendations
}


