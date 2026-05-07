'use client'

import { useEffect, useMemo, useState } from 'react'
import CarSetupPanel from '@/components/CarSetupPanel'
import CommandTile, { type CommandTileRisk } from '@/components/CommandTile'
import CourseMap from '@/components/CourseMap'
import DriverPaceCoach from '@/components/DriverPaceCoach'
import ElevationProfile from '@/components/ElevationProfile'
import EnergySimulationPanel from '@/components/EnergySimulationPanel'
import ExpandablePanel from '@/components/ExpandablePanel'
import GpsStatusPanel from '@/components/GpsStatusPanel'
import OfflineReadinessPanel from '@/components/OfflineReadinessPanel'
import PredictiveStrategyPanel from '@/components/PredictiveStrategyPanel'
import RaceNavigator from '@/components/RaceNavigator'
import TelemetryDashboard from '@/components/TelemetryDashboard'
import WeatherWindPanel from '@/components/WeatherWindPanel'
import type {
  RaceDay,
  RiskLevel,
  RouteSegment,
  SegmentType,
} from '@/data/raceRoute'
import { raceRoute } from '@/data/raceRoute'
import { useElevationProfile } from '@/hooks/useElevationProfile'
import { useRouteWeather } from '@/hooks/useRouteWeather'
import { useTelemetry } from '@/hooks/useTelemetry'
import {
  carSetupChangedEventName,
  defaultCarSetup,
  readStoredCarSetup,
  simulateDayEnergy,
  type CarSetup,
} from '@/lib/energy'
import { generatePredictiveStrategy } from '@/lib/strategyEngine'
import type { TelemetryConnectionStatus } from '@/types/telemetry'
import type { WeatherRisk } from '@/types/weather'

type DayCommandCenterProps = {
  raceDay: RaceDay
}

type TileId =
  | 'pace'
  | 'navigation'
  | 'strategy'
  | 'energy'
  | 'telemetry'
  | 'map'
  | 'weather'
  | 'elevation'
  | 'car'
  | 'segments'
  | 'offline'

type ViewMode = 'driver' | 'chase'

const riskStyles: Record<RiskLevel, string> = {
  low: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100',
  high: 'border-orange-400/40 bg-orange-400/10 text-orange-100',
  severe: 'border-red-400/40 bg-red-400/10 text-[#ff8fcb]',
}

const statusStyles: Record<TelemetryConnectionStatus, string> = {
  disconnected: 'border-slate-300/30 bg-slate-300/10 text-slate-100',
  connecting: 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100',
  connected: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  simulated: 'border-[#ff3ea5]/30 bg-[#ff3ea5]/10 text-[#ff8fcb]',
  error: 'border-red-400/30 bg-red-400/10 text-[#ff8fcb]',
}

const weatherRiskToTileRisk: Record<WeatherRisk, CommandTileRisk> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  severe: 'severe',
}

export default function DayCommandCenter({ raceDay }: DayCommandCenterProps) {
  const [currentMile, setCurrentMile] = useState(0)
  const [manualMode, setManualMode] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('driver')
  const [activeTile, setActiveTile] = useState<TileId | null>(null)
  const [segmentTypeFilter, setSegmentTypeFilter] = useState<'all' | SegmentType>('all')
  const [segmentRiskFilter, setSegmentRiskFilter] = useState<'all' | RiskLevel>('all')
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(true)
  const [carSetup, setCarSetup] = useState<CarSetup>(defaultCarSetup)
  const sortedSegments = useMemo(
    () => [...raceDay.segments].sort((a, b) => a.mileStart - b.mileStart),
    [raceDay.segments]
  )
  const currentSegment =
    sortedSegments.find(
      (segment) =>
        currentMile >= segment.mileStart && currentMile <= segment.mileEnd
    ) ?? sortedSegments[sortedSegments.length - 1]
  const nextWarning =
    sortedSegments.find(
      (segment) =>
        segment.mileStart > currentMile &&
        segment.mileStart <= currentMile + 10 &&
        (segment.risk === 'high' ||
          segment.risk === 'severe' ||
          segment.type === 'caution' ||
          segment.type === 'town' ||
          segment.type === 'stop')
    ) ?? null
  const nextImportantSegment =
    sortedSegments.find(
      (segment) =>
        segment.mileStart > currentMile &&
        segment.mileStart <= currentMile + 10 &&
        (segment.type === 'climb' ||
          segment.type === 'descent' ||
          segment.type === 'stop' ||
          segment.type === 'caution' ||
          segment.type === 'town' ||
          segment.risk === 'high' ||
          segment.risk === 'severe')
    ) ?? null
  const distanceRemaining = Math.max(0, raceDay.distanceMiles - currentMile)
  const telemetryController = useTelemetry({
    currentMile,
    currentSegment,
  })
  const { stats: elevationStats } = useElevationProfile(
    raceDay.day,
    raceDay.routePoints
  )
  const weather = useRouteWeather(raceDay.day, raceDay.routePoints)
  const energySimulation = useMemo(
    () =>
      simulateDayEnergy({
        distanceMiles: raceDay.distanceMiles,
        elevationStats,
        carSetup,
      }),
    [carSetup, elevationStats, raceDay.distanceMiles]
  )
  const predictiveStrategy = useMemo(
    () =>
      generatePredictiveStrategy({
        raceDay,
        currentMile,
        currentSegment,
        energySimulation,
        telemetry: telemetryController.telemetry,
      }),
    [
      currentMile,
      currentSegment,
      energySimulation,
      raceDay,
      telemetryController.telemetry,
    ]
  )
  const visibleTiles = buildTiles({
    raceDay,
    currentMile,
    distanceRemaining,
    manualMode,
    currentSegment,
    nextWarning,
    nextImportantSegment,
    telemetryStatus: telemetryController.status,
    telemetrySpeed: telemetryController.telemetry?.speedMph,
    telemetryControllerTemp: telemetryController.telemetry?.controllerTempC,
    telemetryMotorTemp: telemetryController.telemetry?.motorTempC,
    telemetrySoc: telemetryController.telemetry?.batterySocPercent,
    energySimulation,
    predictiveStrategy,
    weatherRisk: weather.strategySummary.weatherRisk,
    weatherSpeedAdjustment: weather.strategySummary.recommendedSpeedAdjustmentMph,
    weatherSource: weather.sourceSummary,
    elevationGain: elevationStats.totalGain,
  }).filter((tile) => viewMode === 'chase' || driverTileIds.has(tile.id))
  const filteredSegments = sortedSegments.filter((segment) => {
    if (showUpcomingOnly && segment.mileEnd < currentMile) return false
    if (segmentTypeFilter !== 'all' && segment.type !== segmentTypeFilter) {
      return false
    }
    if (segmentRiskFilter !== 'all' && segment.risk !== segmentRiskFilter) {
      return false
    }
    return true
  })

  useEffect(() => {
    function syncCarSetup() {
      setCarSetup(readStoredCarSetup())
    }

    syncCarSetup()
    window.addEventListener(carSetupChangedEventName, syncCarSetup)
    window.addEventListener('storage', syncCarSetup)

    return () => {
      window.removeEventListener(carSetupChangedEventName, syncCarSetup)
      window.removeEventListener('storage', syncCarSetup)
    }
  }, [])

  function handleManualMileChange(mile: number) {
    setManualMode(true)
    setCurrentMile(mile)
  }

  return (
    <main className="min-h-screen px-4 pb-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="sticky top-0 z-40 -mx-4 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/"
              className="inline-flex h-9 items-center rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40"
            >
              Back
            </a>
            <span className="text-sm font-bold text-[#ff8fcb]">
              Day {raceDay.day}
            </span>
            <span className="text-sm font-semibold text-white">
              {raceDay.start} to {raceDay.end}
            </span>
            <Badge label={manualMode ? 'Manual' : 'GPS'} className="border-violet-300/30 bg-violet-300/10 text-violet-100" />
            <Badge label={telemetryController.status} className={statusStyles[telemetryController.status]} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-5 xl:flex">
            <StatusMetric label="Current mile" value={currentMile.toFixed(1)} />
            <StatusMetric label="Remaining" value={`${distanceRemaining.toFixed(1)} mi`} />
            <StatusMetric label="Finish SOC" value={`${predictiveStrategy.projectedFinishSoc.toFixed(0)}%`} />
            <StatusMetric label="Weather risk" value={weather.strategySummary.weatherRisk} />
            <StatusMetric label="Recommended speed" value={`${predictiveStrategy.recommendedSpeedMph} mph`} />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-4 flex max-w-7xl flex-col gap-4">
        <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <p className="text-sm font-semibold text-[#ff8fcb]">
                Command Center
              </p>
              <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">
                {currentSegment?.title ?? 'Race day overview'}
              </h1>
            </div>
            <div className="grid grid-cols-2 rounded-md border border-white/10 bg-black/20 p-1 text-sm font-bold sm:flex">
              <button
                type="button"
                onClick={() => setViewMode('driver')}
                className={`h-10 rounded px-4 transition ${
                  viewMode === 'driver'
                    ? 'bg-[#ff3ea5] text-white'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                Driver Mode
              </button>
              <button
                type="button"
                onClick={() => setViewMode('chase')}
                className={`h-10 rounded px-4 transition ${
                  viewMode === 'chase'
                    ? 'bg-[#ff3ea5] text-white'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                Chase Mode
              </button>
            </div>
          </div>

          <CompactTimeline raceDay={raceDay} segments={sortedSegments} />

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <MiniPanel title="Current Segment">
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={currentSegment?.risk ?? 'low'} className={riskStyles[currentSegment?.risk ?? 'low']} />
                <span className="text-sm font-semibold text-slate-200">
                  Mile {currentSegment?.mileStart} to {currentSegment?.mileEnd}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {currentSegment?.strategy}
              </p>
            </MiniPanel>
            <MiniPanel title="Upcoming Warning">
              {nextWarning ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge label={nextWarning.risk} className={riskStyles[nextWarning.risk]} />
                    <span className="text-sm font-semibold text-slate-200">
                      Mile {nextWarning.mileStart}: {nextWarning.title}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {nextWarning.notes}
                  </p>
                </>
              ) : (
                <p className="text-sm leading-6 text-slate-300">
                  No major warning starts in the next 10 miles.
                </p>
              )}
            </MiniPanel>
          </div>
        </section>

        <section
          className={`grid gap-3 ${
            viewMode === 'driver'
              ? 'md:grid-cols-2 xl:grid-cols-4'
              : 'md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
          }`}
        >
          {visibleTiles.map((tile) => (
            <CommandTile
              key={tile.id}
              {...tile}
              isActive={activeTile === tile.id}
              onClick={(id) => setActiveTile(id as TileId)}
            />
          ))}
        </section>
      </div>

      <ExpandablePanel
        open={activeTile !== null}
        title={panelTitle(activeTile)}
        subtitle="Detailed race-day controls and analysis"
        onClose={() => setActiveTile(null)}
      >
        {activeTile === 'pace' ? (
          <DriverPaceCoach
            telemetry={telemetryController.telemetry}
            predictiveStrategy={predictiveStrategy}
            currentSegment={currentSegment}
            upcomingSegment={nextImportantSegment}
          />
        ) : null}

        {activeTile === 'navigation' ? (
          <div className="grid gap-4">
            <GpsStatusPanel
              routePoints={raceDay.routePoints}
              onMileUpdate={setCurrentMile}
              manualMode={manualMode}
              setManualMode={setManualMode}
            />
            <RaceNavigator
              raceDay={raceDay}
              currentMileExternal={currentMile}
              onCurrentMileChange={handleManualMileChange}
            />
          </div>
        ) : null}

        {activeTile === 'strategy' ? (
          <PredictiveStrategyPanel
            raceDay={raceDay}
            currentMile={currentMile}
            currentSegment={currentSegment}
            telemetry={telemetryController.telemetry}
          />
        ) : null}

        {activeTile === 'energy' ? (
          <EnergySimulationPanel raceDay={raceDay} />
        ) : null}

        {activeTile === 'telemetry' ? (
          <TelemetryDashboard
            telemetry={telemetryController.telemetry}
            status={telemetryController.status}
            source={telemetryController.source}
            connect={telemetryController.connect}
            disconnect={telemetryController.disconnect}
            setSource={telemetryController.setSource}
          />
        ) : null}

        {activeTile === 'weather' ? (
          <WeatherWindPanel
            dayNumber={raceDay.day}
            routePoints={raceDay.routePoints}
            currentMile={currentMile}
            currentRaceSpeedMph={telemetryController.telemetry?.speedMph}
          />
        ) : null}

        {activeTile === 'map' ? (
          <CourseMap
            days={raceRoute}
            currentDayNumber={raceDay.day}
            currentMile={currentMile}
            heightClass="h-[420px] md:h-[620px]"
          />
        ) : null}

        {activeTile === 'elevation' ? (
          <ElevationProfile day={raceDay.day} routePoints={raceDay.routePoints} />
        ) : null}

        {activeTile === 'car' ? <CarSetupPanel /> : null}

        {activeTile === 'segments' ? (
          <RouteSegmentsPanel
            segments={filteredSegments}
            segmentTypeFilter={segmentTypeFilter}
            setSegmentTypeFilter={setSegmentTypeFilter}
            segmentRiskFilter={segmentRiskFilter}
            setSegmentRiskFilter={setSegmentRiskFilter}
            showUpcomingOnly={showUpcomingOnly}
            setShowUpcomingOnly={setShowUpcomingOnly}
          />
        ) : null}

        {activeTile === 'offline' ? (
          <OfflineReadinessPanel />
        ) : null}
      </ExpandablePanel>
    </main>
  )
}

const driverTileIds = new Set<TileId>([
  'pace',
  'navigation',
  'strategy',
  'telemetry',
  'weather',
])

function buildTiles({
  raceDay,
  currentMile,
  distanceRemaining,
  manualMode,
  currentSegment,
  nextWarning,
  nextImportantSegment,
  telemetryStatus,
  telemetrySpeed,
  telemetryControllerTemp,
  telemetryMotorTemp,
  telemetrySoc,
  energySimulation,
  predictiveStrategy,
  weatherRisk,
  weatherSpeedAdjustment,
  weatherSource,
  elevationGain,
}: {
  raceDay: RaceDay
  currentMile: number
  distanceRemaining: number
  manualMode: boolean
  currentSegment: RouteSegment | undefined
  nextWarning: RouteSegment | null
  nextImportantSegment: RouteSegment | null
  telemetryStatus: TelemetryConnectionStatus
  telemetrySpeed?: number
  telemetryControllerTemp?: number
  telemetryMotorTemp?: number
  telemetrySoc?: number
  energySimulation: ReturnType<typeof simulateDayEnergy>
  predictiveStrategy: ReturnType<typeof generatePredictiveStrategy>
  weatherRisk: WeatherRisk
  weatherSpeedAdjustment: number
  weatherSource: string
  elevationGain: number
}) {
  const currentSpeed =
    telemetrySpeed !== undefined
      ? telemetrySpeed
      : predictiveStrategy.recommendedSpeedMph
  const speedDelta = currentSpeed - predictiveStrategy.recommendedSpeedMph
  const paceStatus = getPaceStatus({
    speedDelta,
    projectedFinishSoc: predictiveStrategy.projectedFinishSoc,
    controllerTemp: telemetryControllerTemp ?? 0,
    motorTemp: telemetryMotorTemp ?? 0,
  })
  const paceRisk = paceStatusToTileRisk(paceStatus)

  return [
    {
      id: 'pace',
      title: 'Driver Pace Coach',
      mainValue: currentSpeed.toFixed(1),
      mainUnit: 'mph',
      supportingItems: [
        { label: 'Target', value: `${predictiveStrategy.recommendedSpeedMph} mph` },
        { label: 'Delta', value: `${speedDelta >= 0 ? '+' : ''}${speedDelta.toFixed(1)} mph` },
        { label: 'Next', value: nextImportantSegment?.title ?? currentSegment?.title ?? 'Ready' },
      ],
      statusLabel: paceStatus,
      riskLevel: paceRisk,
      actionText: paceInstruction({
        status: paceStatus,
        speedDelta,
        currentSegment: currentSegment ?? null,
        upcomingSegment: nextImportantSegment,
      }),
    },
    {
      id: 'navigation',
      title: 'Navigation',
      mainValue: currentMile.toFixed(1),
      mainUnit: 'mi',
      supportingItems: [
        { label: 'Remaining', value: `${distanceRemaining.toFixed(1)} mi` },
        { label: 'Mode', value: manualMode ? 'Manual' : 'GPS' },
        { label: 'Segment', value: currentSegment?.title ?? 'Ready' },
      ],
      statusLabel: currentSegment?.risk ?? 'low',
      riskLevel: currentSegment?.risk ?? 'low',
      actionText: currentSegment?.strategy ?? 'Set current mile to begin.',
    },
    {
      id: 'strategy',
      title: 'Predictive Strategy',
      mainValue: String(predictiveStrategy.recommendedSpeedMph),
      mainUnit: 'mph',
      supportingItems: [
        { label: 'Mode', value: predictiveStrategy.raceMode },
        { label: 'Finish SOC', value: `${predictiveStrategy.projectedFinishSoc.toFixed(0)}%` },
        { label: 'Thermal', value: predictiveStrategy.thermalRisk },
      ],
      statusLabel: predictiveStrategy.raceMode,
      riskLevel: predictiveStrategy.raceMode === 'Conserve' ? 'high' : predictiveStrategy.raceMode === 'Attack' ? 'low' : 'medium',
      actionText: predictiveStrategy.driverAction,
    },
    {
      id: 'energy',
      title: 'Energy',
      mainValue: energySimulation.estimatedWhPerMile.toFixed(0),
      mainUnit: 'Wh/mi',
      supportingItems: [
        { label: 'Net use', value: `${energySimulation.netKwh.toFixed(2)} kWh` },
        { label: 'Finish SOC', value: `${energySimulation.predictedFinishSocPercent.toFixed(0)}%` },
        { label: 'Solar', value: `${(energySimulation.solarWh / 1000).toFixed(1)} kWh` },
      ],
      statusLabel: energySimulation.riskLevel,
      riskLevel: energySimulation.riskLevel,
      actionText: 'Open for battery use, regen, and solar recovery estimate.',
    },
    {
      id: 'telemetry',
      title: 'Telemetry',
      mainValue: telemetrySpeed !== undefined ? telemetrySpeed.toFixed(1) : '--',
      mainUnit: 'mph',
      supportingItems: [
        { label: 'Status', value: telemetryStatus },
        { label: 'SOC', value: telemetrySoc !== undefined ? `${telemetrySoc.toFixed(0)}%` : '--' },
        { label: 'Source', value: 'sim/CAN-ready' },
      ],
      statusLabel: telemetryStatus,
      riskLevel: telemetryStatus === 'error' ? 'severe' : telemetryStatus === 'simulated' ? 'low' : 'neutral',
      actionText: 'Open for live gauges and system health.',
    },
    {
      id: 'weather',
      title: 'Weather + Wind',
      mainValue: String(weatherSpeedAdjustment),
      mainUnit: 'mph adj',
      supportingItems: [
        { label: 'Risk', value: weatherRisk },
        { label: 'Source', value: weatherSource },
        { label: 'Advisory', value: 'Phase 11' },
      ],
      statusLabel: weatherRisk,
      riskLevel: weatherRiskToTileRisk[weatherRisk],
      actionText: 'Open for headwind, crosswind, cloud, and solar advisory.',
    },
    {
      id: 'map',
      title: 'Course Map',
      mainValue: `D${raceDay.day}`,
      mainUnit: 'map',
      supportingItems: [
        { label: 'Mile', value: currentMile.toFixed(1) },
        { label: 'Current', value: currentSegment?.title ?? 'Ready' },
        { label: 'Overlay', value: 'terrain severity' },
      ],
      statusLabel: currentSegment?.risk ?? raceDay.riskLevel,
      riskLevel: currentSegment?.risk ?? raceDay.riskLevel,
      actionText: 'Open for full-route map, current day highlight, and endpoint markers.',
    },
    {
      id: 'elevation',
      title: 'Elevation',
      mainValue: String(elevationGain),
      mainUnit: 'ft gain',
      supportingItems: [
        { label: 'Route', value: `${raceDay.distanceMiles} mi` },
        { label: 'Terrain', value: raceDay.riskLevel },
        { label: 'Points', value: String(raceDay.routePoints.length) },
      ],
      statusLabel: raceDay.riskLevel,
      riskLevel: raceDay.riskLevel,
      actionText: 'Open for elevation profile and climb/descent strategy.',
    },
    {
      id: 'car',
      title: 'Car Setup',
      mainValue: carSetupLabel(),
      supportingItems: [
        { label: 'Battery', value: `${defaultCarSetup.batteryKwh} kWh default` },
        { label: 'Solar', value: `${defaultCarSetup.solarWatts} W default` },
        { label: 'Saved', value: 'local' },
      ],
      statusLabel: 'setup',
      riskLevel: 'neutral',
      actionText: 'Open to edit car, battery, aero, regen, and solar assumptions.',
    },
    {
      id: 'segments',
      title: 'Route Segments',
      mainValue: String(raceDay.segments.length),
      mainUnit: 'segments',
      supportingItems: [
        { label: 'Next warning', value: nextWarning?.title ?? 'clear' },
        { label: 'High risk', value: String(raceDay.segments.filter((segment) => segment.risk === 'high' || segment.risk === 'severe').length) },
        { label: 'Highways', value: raceDay.highways.join(', ') },
      ],
      statusLabel: raceDay.riskLevel,
      riskLevel: raceDay.riskLevel,
      actionText: 'Open for searchable filtered route packet.',
    },
    {
      id: 'offline',
      title: 'Offline/GPS Status',
      mainValue: manualMode ? 'MAN' : 'GPS',
      supportingItems: [
        { label: 'Offline', value: 'PWA' },
        { label: 'GPS', value: manualMode ? 'manual' : 'auto' },
        { label: 'Cache', value: 'local' },
      ],
      statusLabel: manualMode ? 'manual' : 'gps',
      riskLevel: 'neutral',
      actionText: 'Open for GPS assist and offline readiness checks.',
    },
  ] as Array<{
    id: TileId
    title: string
    mainValue: string
    mainUnit?: string
    supportingItems: Array<{ label: string; value: string }>
    statusLabel: string
    riskLevel: CommandTileRisk
    actionText: string
  }>
}

function CompactTimeline({
  raceDay,
  segments,
}: {
  raceDay: RaceDay
  segments: RouteSegment[]
}) {
  return (
    <div className="mt-4 flex h-10 overflow-hidden rounded-md border border-white/10 bg-black/30">
      {segments.map((segment) => {
        const width =
          ((segment.mileEnd - segment.mileStart) / raceDay.distanceMiles) * 100

        return (
          <div
            key={`${segment.mileStart}-${segment.title}`}
            className={`border-r border-black/30 ${timelineColor(segment.risk)}`}
            style={{ width: `${width}%` }}
            title={`${segment.mileStart}-${segment.mileEnd}: ${segment.title}`}
          />
        )
      })}
    </div>
  )
}

function RouteSegmentsPanel({
  segments,
  segmentTypeFilter,
  setSegmentTypeFilter,
  segmentRiskFilter,
  setSegmentRiskFilter,
  showUpcomingOnly,
  setShowUpcomingOnly,
}: {
  segments: RouteSegment[]
  segmentTypeFilter: 'all' | SegmentType
  setSegmentTypeFilter: (value: 'all' | SegmentType) => void
  segmentRiskFilter: 'all' | RiskLevel
  setSegmentRiskFilter: (value: 'all' | RiskLevel) => void
  showUpcomingOnly: boolean
  setShowUpcomingOnly: (value: boolean) => void
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 md:grid-cols-3">
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Type
          </span>
          <select
            value={segmentTypeFilter}
            onChange={(event) =>
              setSegmentTypeFilter(event.target.value as 'all' | SegmentType)
            }
            className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-[#ff3ea5]/60"
          >
            {['all', 'climb', 'descent', 'flat', 'stop', 'town', 'caution'].map(
              (type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              )
            )}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Risk
          </span>
          <select
            value={segmentRiskFilter}
            onChange={(event) =>
              setSegmentRiskFilter(event.target.value as 'all' | RiskLevel)
            }
            className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-[#ff3ea5]/60"
          >
            {['all', 'low', 'medium', 'high', 'severe'].map((risk) => (
              <option key={risk} value={risk}>
                {risk}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-3 rounded-md border border-white/10 bg-black/20 p-3 text-sm font-semibold text-slate-200">
          <input
            type="checkbox"
            checked={showUpcomingOnly}
            onChange={(event) => setShowUpcomingOnly(event.target.checked)}
            className="h-5 w-5 accent-[#ff3ea5]"
          />
          Show only upcoming
        </label>
      </div>

      <div className="grid gap-3">
        {segments.map((segment) => (
          <article
            key={`${segment.mileStart}-${segment.title}`}
            className="rounded-lg border border-white/10 bg-black/20 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#ff8fcb]">
                  Mile {segment.mileStart} to {segment.mileEnd}
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">
                  {segment.title}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge label={segment.type} className="border-slate-300/30 bg-slate-300/10 text-slate-100" />
                <Badge label={segment.risk} className={riskStyles[segment.risk]} />
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {segment.notes}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              {segment.strategy}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}

function MiniPanel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-400">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[7.75rem] rounded-md border border-[#ff3ea5]/20 bg-black/45 px-3 py-2.5 shadow-sm shadow-black/20">
      <p className="text-[11px] font-black uppercase leading-none tracking-[0.12em] text-[#ff8fcb]">
        {label}
      </p>
      <p className="mt-1.5 text-base font-black leading-none text-white">
        {value}
      </p>
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

function panelTitle(tileId: TileId | null) {
  if (tileId === 'pace') return 'Driver Pace Coach'
  if (tileId === 'navigation') return 'Navigation'
  if (tileId === 'strategy') return 'Predictive Strategy'
  if (tileId === 'energy') return 'Energy Simulation'
  if (tileId === 'telemetry') return 'Telemetry'
  if (tileId === 'map') return 'Course Map'
  if (tileId === 'weather') return 'Weather + Wind'
  if (tileId === 'elevation') return 'Elevation'
  if (tileId === 'car') return 'Car Setup'
  if (tileId === 'segments') return 'Route Segments'
  if (tileId === 'offline') return 'Offline/GPS Status'
  return 'Details'
}

function timelineColor(risk: RiskLevel) {
  if (risk === 'low') return 'bg-emerald-400/70'
  if (risk === 'medium') return 'bg-yellow-300/70'
  if (risk === 'high') return 'bg-orange-400/80'
  return 'bg-red-500/85'
}

function carSetupLabel() {
  return 'SET'
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
}) {
  if (controllerTemp > 85 || motorTemp > 95) return 'THERMAL LIMIT'
  if (projectedFinishSoc < 15) return 'CONSERVE NOW'
  if (Math.abs(speedDelta) <= 1.5) return 'GOOD'
  if (speedDelta > 1.5 && speedDelta <= 4) return 'SLIGHTLY FAST'
  if (speedDelta > 4) return 'TOO FAST'
  if (speedDelta < -4) return 'TOO SLOW'
  return 'GOOD'
}

function paceStatusToTileRisk(status: ReturnType<typeof getPaceStatus>): CommandTileRisk {
  if (status === 'GOOD') return 'low'
  if (status === 'SLIGHTLY FAST' || status === 'TOO SLOW') return 'medium'
  return 'severe'
}

function paceInstruction({
  status,
  speedDelta,
  currentSegment,
  upcomingSegment,
}: {
  status: ReturnType<typeof getPaceStatus>
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


