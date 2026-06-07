'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import CarSetupPanel from '@/components/CarSetupPanel'
import CloudTelemetryStatusCard from '@/components/CloudTelemetryStatusCard'
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
import {
  exportDaySummaryToCsv,
  generateDaySummary,
  type DaySummary,
} from '@/lib/daySummary'
import {
  createRaceSnapshot,
  exportRaceSnapshotsToCsv,
  trimSnapshotHistory,
  type RaceSnapshot,
} from '@/lib/raceSnapshots'
import {
  buildTraileringSessions,
  calculateDrivenMiles,
  calculateTraileredMiles,
  createRaceEvent,
  exportRaceEventsToCsv,
  exportTraileringSessionsToCsv,
  getActiveTraileringSession,
  raceEventsChangedEventName,
  readStoredRaceEvents,
  sessionsForDay,
  writeStoredRaceEvents,
  type RaceEvent,
  type TraileringSession,
} from '@/lib/raceEvents'
import { rx2Config } from '@/lib/race/rx2Config'
import { generatePredictiveStrategy } from '@/lib/strategyEngine'
import type {
  TelemetryConnectionStatus,
  TelemetryData,
  TelemetryEffectiveStatusSource,
  TelemetryNodeId,
  TelemetryPacketStats,
  TelemetrySource,
} from '@/types/telemetry'
import { telemetryNodeOptions } from '@/types/telemetry'
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

type MissionStatus =
  | 'ON_TARGET'
  | 'CONSERVE'
  | 'AT_RISK'
  | 'SWAP_RECOMMENDED'
  | 'TRAILERING_RECOMMENDED'
  | 'FINISH_PUSH'
  | 'CRITICAL_ENERGY'

type RaceHealth = {
  score: number
  label: 'Excellent' | 'Good' | 'Caution' | 'Recovery'
  breakdown: RaceHealthBreakdown
}

type RaceHealthBreakdown = {
  baseScore: number
  healthBasis: string
  primaryHealthSocPercent: number
  secondaryForecastSocPercent: number
  socMarginPercent: number
  socMarginBonus: number
  swapPenalty: number
  traileringPenalty: number
  nextOpportunityPenalty: number
  fullDayEnergyCautionPenalty: number
  routeRiskPenalty: number
  telemetryPenalty: number
  highestRouteSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE'
  isFinalDay: boolean
  activeReserveSocPercent: number
  finalDayTargetReserveSocPercent: number
  absoluteMinimumSocPercent: number
  endgameModeActive: boolean
  finalScore: number
}

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
  warning: 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100',
  simulated: 'border-[#ff3ea5]/30 bg-[#ff3ea5]/10 text-[#ff8fcb]',
  error: 'border-red-400/30 bg-red-400/10 text-[#ff8fcb]',
}

const weatherRiskToTileRisk: Record<WeatherRisk, CommandTileRisk> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  severe: 'severe',
}

const preRaceChecklistItems = [
  'Telemetry source selected',
  'ESP32 / simulator running',
  'Spare battery SOC updated',
  'Battery swap advisor checked',
  'Trailering logs reset/exported',
  'Race events CSV exported if needed',
  'Route/day selected',
  'Radio check complete',
  'Cooling system checked',
  'Driver ready',
]

export default function DayCommandCenter({ raceDay }: DayCommandCenterProps) {
  const [currentMile, setCurrentMile] = useState(0)
  const [manualMode, setManualMode] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('driver')
  const [activeTile, setActiveTile] = useState<TileId | null>(null)
  const [segmentTypeFilter, setSegmentTypeFilter] = useState<'all' | SegmentType>('all')
  const [segmentRiskFilter, setSegmentRiskFilter] = useState<'all' | RiskLevel>('all')
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(true)
  const [carSetup, setCarSetup] = useState<CarSetup>(defaultCarSetup)
  const [snapshots, setSnapshots] = useState<RaceSnapshot[]>([])
  const [raceEvents, setRaceEvents] = useState<RaceEvent[]>([])
  const [traileringWarning, setTraileringWarning] = useState('')
  const [manualNoteText, setManualNoteText] = useState('')
  const [manualNoteError, setManualNoteError] = useState('')
  const [preRaceChecklist, setPreRaceChecklist] = useState<Record<string, boolean>>({})
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null)
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
  const traileringSessions = useMemo(
    () => buildTraileringSessions(raceEvents),
    [raceEvents]
  )
  const activeTraileringSession = getActiveTraileringSession(traileringSessions)
  const dayTraileringSessions = useMemo(
    () => sessionsForDay(traileringSessions, raceDay.day, currentMile),
    [currentMile, raceDay.day, traileringSessions]
  )
  const latestBatterySwap = [...raceEvents]
    .reverse()
    .find((event) => event.type === 'BATTERY_SWAP') ?? null
  const latestManualNote = [...raceEvents]
    .reverse()
    .find((event) => event.type === 'MANUAL_NOTE') ?? null
  const traileredMilesToday = calculateTraileredMiles(dayTraileringSessions)
  const countingMilesToday = calculateDrivenMiles(
    Math.min(currentMile, raceDay.distanceMiles),
    dayTraileringSessions
  )
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
        telemetrySource: telemetryController.source,
        startingSocPercent: 100,
        spareBatterySocPercent: carSetup.spareBatterySocPercent,
        isTraileringActive: Boolean(activeTraileringSession),
      }),
    [
      carSetup.spareBatterySocPercent,
      currentMile,
      currentSegment,
      energySimulation,
      raceDay,
      activeTraileringSession,
      telemetryController.telemetry,
      telemetryController.source,
    ]
  )
  const generatedDaySummary = useMemo(
    () =>
      generateDaySummary({
        currentDay: raceDay.day,
        raceEvents,
        traileringSessions: dayTraileringSessions,
        strategySnapshots: snapshots,
      }),
    [dayTraileringSessions, raceDay.day, raceEvents, snapshots]
  )
  const displayedDaySummary = daySummary ?? generatedDaySummary

  useEffect(() => {
    setDaySummary(generatedDaySummary)
  }, [generatedDaySummary])

  const missionStatus = classifyMissionStatus(predictiveStrategy)
  const raceHealth = calculateRaceHealth({
    strategy: predictiveStrategy,
    telemetrySource: telemetryController.source,
    telemetryStatus: telemetryController.effectiveStatus,
    connectionStatus: telemetryController.effectiveConnectionStatus,
  })

  const visibleTiles = buildTiles({
    raceDay,
    currentMile,
    distanceRemaining,
    manualMode,
    currentSegment,
    nextWarning,
    nextImportantSegment,
    telemetryStatus: telemetryController.effectiveStatus,
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
    isTraileringActive: Boolean(activeTraileringSession),
    traileredMilesToday,
    countingMilesToday,
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

  useEffect(() => {
    function syncRaceEvents() {
      setRaceEvents(readStoredRaceEvents())
    }

    syncRaceEvents()
    window.addEventListener(raceEventsChangedEventName, syncRaceEvents)
    window.addEventListener('storage', syncRaceEvents)

    return () => {
      window.removeEventListener(raceEventsChangedEventName, syncRaceEvents)
      window.removeEventListener('storage', syncRaceEvents)
    }
  }, [])

  useEffect(() => {
    setPreRaceChecklist(readStoredPreRaceChecklist(raceDay.day))
  }, [raceDay.day])

  useEffect(() => {
    if (!telemetryController.telemetry) return

    const snapshot = createRaceSnapshot({
      telemetry: telemetryController.telemetry,
      telemetrySource: telemetryController.source,
      currentDay: raceDay.day,
      currentMile,
      strategy: predictiveStrategy,
      warningsCount: countTelemetryWarnings(telemetryController.telemetry),
    })

    setSnapshots((currentSnapshots) =>
      trimSnapshotHistory([...currentSnapshots, snapshot])
    )
  }, [
    currentMile,
    predictiveStrategy,
    raceDay.day,
    telemetryController.source,
    telemetryController.telemetry,
  ])

  function handleManualMileChange(mile: number) {
    setManualMode(true)
    setCurrentMile(mile)
  }

  function persistRaceEvents(events: RaceEvent[]) {
    setRaceEvents(events)
    writeStoredRaceEvents(events)
  }

  function startTrailering() {
    if (activeTraileringSession) return

    setTraileringWarning('')
    persistRaceEvents([
      ...raceEvents,
      createRaceEvent({
        type: 'TRAILER_START',
        day: raceDay.day,
        mile: currentMile,
        note: 'Trailering started manually from command center.',
      }),
    ])
  }

  function endTrailering() {
    if (!activeTraileringSession) return

    const endMile = Math.max(currentMile, activeTraileringSession.startMile)

    if (currentMile < activeTraileringSession.startMile) {
      setTraileringWarning(
        'End mile was lower than start mile, so trailered distance was clamped to 0.'
      )
    } else {
      setTraileringWarning('')
    }

    persistRaceEvents([
      ...raceEvents,
      createRaceEvent({
        type: 'TRAILER_END',
        day: raceDay.day,
        mile: endMile,
        note: 'Trailering ended manually from command center.',
      }),
    ])
  }

  function logBatterySwap() {
    persistRaceEvents([
      ...raceEvents,
      createRaceEvent({
        type: 'BATTERY_SWAP',
        day: raceDay.day,
        mile: currentMile,
        note: `Battery swap logged manually. Current advisor action: ${predictiveStrategy.swapAdvice.action}.`,
      }),
    ])
  }

  function logManualNote() {
    const note = manualNoteText.trim()

    if (!note) {
      setManualNoteError('Enter a note before logging.')
      return
    }

    setManualNoteError('')
    persistRaceEvents([
      ...raceEvents,
      createRaceEvent({
        type: 'MANUAL_NOTE',
        day: raceDay.day,
        mile: currentMile,
        note,
      }),
    ])
    setManualNoteText('')
  }

  function updatePreRaceChecklistItem(item: string, checked: boolean) {
    const nextChecklist = {
      ...preRaceChecklist,
      [item]: checked,
    }

    setPreRaceChecklist(nextChecklist)
    writeStoredPreRaceChecklist(raceDay.day, nextChecklist)
  }

  function resetPreRaceChecklist() {
    setPreRaceChecklist({})
    writeStoredPreRaceChecklist(raceDay.day, {})
  }

  return (
    <main className="min-h-screen px-4 pb-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="sticky top-0 z-40 -mx-4 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <StatusMetric label="Current mile" value={currentMile.toFixed(1)} />
          <StatusMetric label="Remaining" value={`${distanceRemaining.toFixed(1)} mi`} />
          <StatusMetric label="Finish SOC" value={`${predictiveStrategy.projectedFinishSoc.toFixed(0)}%`} />
          <StatusMetric label="Weather risk" value={weather.strategySummary.weatherRisk} />
          <StatusMetric label="Recommended speed" value={`${predictiveStrategy.recommendedSpeedMph} mph`} />
        </div>
      </div>

      <div className="mx-auto mt-4 grid max-w-7xl gap-4">
        <MissionStatusBanner status={missionStatus} raceHealth={raceHealth} />

        <RaceCommandCard
          raceDay={raceDay}
          predictiveStrategy={predictiveStrategy}
        />

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.85fr)]">
          <div className="grid gap-4">
            <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] shadow-xl shadow-black/20">
              <CourseMap
                days={raceRoute}
                currentDayNumber={raceDay.day}
                currentMile={currentMile}
                heightClass="h-[420px] md:h-[620px]"
              />
            </section>

            <div className="grid gap-3 lg:grid-cols-2">
              <MiniPanel title="Current Route Segment">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge label={currentSegment?.risk ?? 'low'} className={riskStyles[currentSegment?.risk ?? 'low']} />
                  <span className="text-sm font-semibold text-slate-200">
                    Mile {currentSegment?.mileStart} to {currentSegment?.mileEnd}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <StatusMetric label="Remaining" value={`${distanceRemaining.toFixed(1)} mi`} />
                  <StatusMetric label="Counting" value={`${countingMilesToday.toFixed(1)} mi`} />
                  <StatusMetric label="Trailered" value={`${traileredMilesToday.toFixed(1)} mi`} />
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {currentSegment?.strategy}
                </p>
              </MiniPanel>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <UpcomingRisksPanel
                segments={sortedSegments}
                currentMile={currentMile}
              />
              <UpcomingOpportunitiesPanel
                opportunities={predictiveStrategy.routeIntelligence.opportunities}
              />
            </div>
          </div>

          <aside className="grid content-start gap-4">
            <VehicleCard telemetry={telemetryController.telemetry} />
            <EnvironmentCard
              weatherRisk={weather.strategySummary.weatherRisk}
              weatherSource={weather.sourceSummary}
              windAdjustment={weather.strategySummary.recommendedSpeedAdjustmentMph}
              elevationGain={elevationStats.totalGain}
              elevationLoss={elevationStats.totalLoss}
            />
          </aside>
        </section>

        <AccordionSection title="Operations">
          <PreRaceChecklist
            checklist={preRaceChecklist}
            onItemChange={updatePreRaceChecklistItem}
            onReset={resetPreRaceChecklist}
          />

          <TraileringControls
            activeSession={activeTraileringSession}
            currentMile={currentMile}
            countingMilesToday={countingMilesToday}
            traileredMilesToday={traileredMilesToday}
            raceEvents={raceEvents}
            traileringSessions={dayTraileringSessions}
            latestBatterySwap={latestBatterySwap}
            latestManualNote={latestManualNote}
            manualNoteText={manualNoteText}
            manualNoteError={manualNoteError}
            warning={traileringWarning}
            onStart={startTrailering}
            onEnd={endTrailering}
            onLogBatterySwap={logBatterySwap}
            onManualNoteChange={(value) => {
              setManualNoteText(value)
              setManualNoteError('')
            }}
            onLogManualNote={logManualNote}
            onResetRaceDayLogs={() => {
              const confirmed = window.confirm(
                'Export CSVs before resetting. This cannot be undone.'
              )

              if (!confirmed) return

              setTraileringWarning('')
              setManualNoteText('')
              setManualNoteError('')
              persistRaceEvents([])
            }}
          />
        </AccordionSection>

        <AccordionSection title="Setup">
          <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
            <CarSetupPanel />
            <TelemetrySourceSetup
              status={telemetryController.effectiveStatus}
              source={telemetryController.source}
              connectionStatus={telemetryController.effectiveConnectionStatus}
              connectionError={telemetryController.connectionError}
              lastPacketAt={telemetryController.effectiveLastPacketAt}
              cloudNode={telemetryController.cloudNode}
              connect={telemetryController.connect}
              disconnect={telemetryController.disconnect}
              setSource={telemetryController.setSource}
              setCloudNode={telemetryController.setCloudNode}
            />
          </div>
        </AccordionSection>

        <AccordionSection title="Reports">
          <EndOfDaySummaryPanel
            summary={displayedDaySummary}
            onRefresh={() => setDaySummary(generatedDaySummary)}
            onDownload={() =>
              downloadCsv({
                csv: exportDaySummaryToCsv(displayedDaySummary),
                filename: `rx2-day-summary-day-${raceDay.day}-${formatDownloadTimestamp(new Date())}.csv`,
                enabled: true,
              })
            }
          />
          <RecentStrategyLogPanel
            snapshots={snapshots}
            onClearSnapshots={() => setSnapshots([])}
          />
        </AccordionSection>

        {carSetup.appProfile === 'owner' ? (
          <AccordionSection title="Strategy Debug">
            <StrategyDebugPanel
              missionStatus={missionStatus}
              raceHealth={raceHealth}
              strategy={predictiveStrategy}
              telemetry={telemetryController.telemetry}
              telemetrySource={telemetryController.source}
              telemetryStatus={telemetryController.effectiveStatus}
              connectionStatus={telemetryController.effectiveConnectionStatus}
              lastPacketAt={telemetryController.effectiveLastPacketAt}
              effectivePacketAgeSeconds={telemetryController.effectivePacketAgeSeconds}
              effectiveStatusSource={telemetryController.effectiveStatusSource}
              packetStats={telemetryController.packetStats}
              currentMile={currentMile}
              remainingMiles={distanceRemaining}
              currentSegment={currentSegment ?? null}
              spareBatterySocPercent={carSetup.spareBatterySocPercent}
              elevationGain={elevationStats.totalGain}
              elevationLoss={elevationStats.totalLoss}
            />
          </AccordionSection>
        ) : null}
      </div>
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
  isTraileringActive,
  traileredMilesToday,
  countingMilesToday,
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
  isTraileringActive: boolean
  traileredMilesToday: number
  countingMilesToday: number
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
        { label: 'Trailering', value: isTraileringActive ? 'active' : predictiveStrategy.routeIntelligence.traileringOption.action },
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
        { label: 'Counting', value: `${countingMilesToday.toFixed(1)} mi` },
        { label: 'Trailered', value: `${traileredMilesToday.toFixed(1)} mi` },
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

function MissionStatusBanner({
  status,
  raceHealth,
}: {
  status: MissionStatus
  raceHealth: RaceHealth
}) {
  return (
    <section className={`rounded-lg border p-4 ${missionStatusBannerStyle(status)}`}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">
            Mission Status
          </p>
          <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">
            MISSION STATUS: {formatMissionStatus(status)}
          </h2>
        </div>
        <div className="rounded-md border border-white/15 bg-black/25 px-4 py-3 text-right">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">
            Race Health
          </p>
          <p className="mt-1 text-xl font-black text-white">
            {raceHealth.score} / 100
          </p>
          <p className="text-xs font-bold uppercase tracking-wide text-[#ff8fcb]">
            {raceHealth.label}
          </p>
        </div>
      </div>
    </section>
  )
}

function RaceCommandCard({
  raceDay,
  predictiveStrategy,
}: {
  raceDay: RaceDay
  predictiveStrategy: ReturnType<typeof generatePredictiveStrategy>
}) {
  const trailering = predictiveStrategy.routeIntelligence.traileringOption

  return (
    <section className="rounded-lg border border-[#ff3ea5]/30 bg-[#ff3ea5]/10 p-4 shadow-xl shadow-black/20">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-semibold text-[#ff8fcb]">
            Race Command
          </p>
          <h1 className="mt-1 text-3xl font-black text-white sm:text-4xl">
            {predictiveStrategy.recommendedSpeedMph} mph
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
            {predictiveStrategy.driverAction}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge label={`Day ${raceDay.day}`} className="border-white/20 bg-white/10 text-slate-100" />
          <Badge label={predictiveStrategy.raceMode} className="border-[#ff3ea5]/40 bg-black/25 text-[#ff8fcb]" />
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <CommandMetric
          label="Recommended Speed"
          value={`${predictiveStrategy.recommendedSpeedMph} mph`}
        />
        <CommandMetric label="Strategy Command" value={predictiveStrategy.driverAction} />
        <CommandMetric
          label="Finish SOC"
          value={`${predictiveStrategy.projectedFinishSoc.toFixed(1)}%`}
        />
        <CommandMetric
          label="Battery Swap Advice"
          value={predictiveStrategy.swapAdvice.action}
          detail={predictiveStrategy.swapAdvice.reason}
        />
        <CommandMetric
          label="Trailering Advice"
          value={trailering.action}
          detail={trailering.reason}
        />
      </div>
    </section>
  )
}

function CommandMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-black/25 p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#ff8fcb]">
        {label}
      </p>
      <p className="mt-1 text-base font-black text-white">{value}</p>
      {detail ? (
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-300">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

function VehicleCard({ telemetry }: { telemetry: TelemetryData | null }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
      <p className="text-sm font-semibold text-[#ff8fcb]">Vehicle</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <StatusMetric label="Speed" value={formatSpeed(telemetry?.speedMph)} />
        <StatusMetric label="SOC" value={formatPercent(telemetry?.batterySocPercent)} />
        <StatusMetric
          label="Wh/mi"
          value={
            telemetry?.efficiencyWhPerMile !== undefined || telemetry?.whPerMile !== undefined
              ? `${(telemetry.efficiencyWhPerMile ?? telemetry.whPerMile ?? 0).toFixed(0)} Wh/mi`
              : '--'
          }
        />
        <StatusMetric
          label="Voltage"
          value={telemetry?.batteryVoltage !== undefined ? `${telemetry.batteryVoltage.toFixed(1)} V` : '--'}
        />
        <StatusMetric
          label="Current"
          value={telemetry?.batteryCurrent !== undefined ? `${telemetry.batteryCurrent.toFixed(1)} A` : '--'}
        />
      </div>
    </section>
  )
}

function EnvironmentCard({
  weatherRisk,
  weatherSource,
  windAdjustment,
  elevationGain,
  elevationLoss,
}: {
  weatherRisk: WeatherRisk
  weatherSource: string
  windAdjustment: number
  elevationGain: number
  elevationLoss: number
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
      <p className="text-sm font-semibold text-[#ff8fcb]">Environment</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <StatusMetric label="Weather" value={weatherRisk} />
        <StatusMetric label="Wind" value={`${windAdjustment.toFixed(1)} mph`} />
        <StatusMetric label="Elevation gain" value={`${elevationGain.toFixed(0)} ft`} />
        <StatusMetric label="Elevation loss" value={`${elevationLoss.toFixed(0)} ft`} />
      </div>
      <p className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-400">
        {weatherSource}
      </p>
    </section>
  )
}

function UpcomingRisksPanel({
  segments,
  currentMile,
}: {
  segments: RouteSegment[]
  currentMile: number
}) {
  const upcomingRisks = segments
    .filter(
      (segment) =>
        segment.mileStart > currentMile &&
        (segment.risk === 'high' ||
          segment.risk === 'severe' ||
          segment.type === 'caution' ||
          segment.type === 'town' ||
          segment.type === 'stop')
    )
    .slice(0, 3)

  return (
    <MiniPanel title="Upcoming Risks">
      {upcomingRisks.length > 0 ? (
        <div className="grid gap-2">
          {upcomingRisks.map((segment) => (
            <div
              key={`${segment.mileStart}-${segment.title}`}
              className="rounded-md border border-white/10 bg-black/20 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={segment.risk} className={riskStyles[segment.risk]} />
                <span className="text-sm font-semibold text-slate-100">
                  Mile {segment.mileStart}: {segment.title}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                {segment.notes}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-400">
          No high-priority route risks ahead.
        </p>
      )}
    </MiniPanel>
  )
}

function UpcomingOpportunitiesPanel({
  opportunities,
}: {
  opportunities: ReturnType<typeof generatePredictiveStrategy>['routeIntelligence']['opportunities']
}) {
  const topOpportunities = opportunities.slice(0, 3)

  return (
    <MiniPanel title="Upcoming Opportunities">
      {topOpportunities.length > 0 ? (
        <div className="grid gap-2">
          {topOpportunities.map((opportunity) => (
            <div
              key={`${opportunity.mileMarker}-${opportunity.title}`}
              className="rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  label={opportunity.value}
                  className="border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                />
                <span className="text-sm font-semibold text-slate-100">
                  Mile {opportunity.mileMarker.toFixed(1)}: {opportunity.title}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                {opportunity.reason}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-400">
          No route opportunities in the current lookahead.
        </p>
      )}
    </MiniPanel>
  )
}

function AccordionSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <details className="rounded-lg border border-white/10 bg-white/[0.035]">
      <summary className="cursor-pointer list-none p-4 text-base font-black text-white marker:hidden">
        <span className="text-[#ff8fcb]">{title}</span>
      </summary>
      <div className="grid gap-4 border-t border-white/10 p-4">{children}</div>
    </details>
  )
}

function StrategyDebugPanel({
  missionStatus,
  raceHealth,
  strategy,
  telemetry,
  telemetrySource,
  telemetryStatus,
  connectionStatus,
  lastPacketAt,
  effectivePacketAgeSeconds,
  effectiveStatusSource = 'raw',
  packetStats,
  currentMile,
  remainingMiles,
  currentSegment,
  spareBatterySocPercent,
  elevationGain,
  elevationLoss,
}: {
  missionStatus: MissionStatus
  raceHealth: RaceHealth
  strategy: ReturnType<typeof generatePredictiveStrategy>
  telemetry: TelemetryData | null
  telemetrySource: TelemetrySource
  telemetryStatus: TelemetryConnectionStatus
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  lastPacketAt?: number
  effectivePacketAgeSeconds?: number
  effectiveStatusSource?: TelemetryEffectiveStatusSource
  packetStats: TelemetryPacketStats
  currentMile: number
  remainingMiles: number
  currentSegment: RouteSegment | null
  spareBatterySocPercent: number
  elevationGain: number
  elevationLoss: number
}) {
  const baselineRemainingEnergyWh = strategy.safeStrategyWhPerMile * remainingMiles
  const lastPacketAgeSeconds =
    effectivePacketAgeSeconds ??
    (lastPacketAt
      ? Math.max(0, Math.round((Date.now() - lastPacketAt) / 1000))
      : undefined)
  const debugSnapshot = buildStrategyDebugSnapshot({
    missionStatus,
    raceHealth,
    strategy,
    telemetry,
    telemetrySource,
    telemetryStatus,
    connectionStatus,
    lastPacketAgeSeconds,
    effectiveStatusSource,
    packetStats,
    currentMile,
    remainingMiles,
    currentSegment,
    spareBatterySocPercent,
    elevationGain,
    elevationLoss,
    baselineRemainingEnergyWh,
  })

  async function copyDebugSnapshot() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return

    await navigator.clipboard.writeText(debugSnapshot)
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-semibold text-[#ff8fcb]">
            Developer validation only
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Mirrors existing strategy outputs without changing race behavior.
          </p>
        </div>
        <button
          type="button"
          onClick={copyDebugSnapshot}
          className="h-10 rounded-md border border-[#ff3ea5]/35 bg-[#ff3ea5]/10 px-3 text-sm font-bold text-[#ff8fcb] transition hover:bg-[#ff3ea5]/15"
        >
          Copy Debug Snapshot
        </button>
      </div>

      <DebugSection title="Mission Status">
        <DebugField label="Mission Status" value={formatMissionStatus(missionStatus)} tone={missionStatusDebugTone(missionStatus)} />
        <DebugField label="Race Health Score" value={`${raceHealth.score} / 100`} tone={scoreDebugTone(raceHealth.score)} />
        <DebugField label="Race Health Label" value={raceHealth.label} tone={scoreDebugTone(raceHealth.score)} />
        <DebugField label="Base Score" value={String(raceHealth.breakdown.baseScore)} />
        <DebugField label="Health Basis" value={raceHealth.breakdown.healthBasis} />
        <DebugField label="Is Final Day" value={strategy.isFinalDay ? 'true' : 'false'} tone={strategy.isFinalDay ? 'caution' : 'neutral'} />
        <DebugField label="Active Reserve SOC" value={`${strategy.activeReserveSocPercent}%`} />
        <DebugField label="Final Day Target Reserve SOC" value={`${strategy.finalDayTargetReserveSocPercent}%`} />
        <DebugField label="Absolute Minimum SOC" value={`${strategy.absoluteMinimumSocPercent}%`} />
        <DebugField label="Endgame Mode Active" value={strategy.endgameModeActive ? 'true' : 'false'} tone={strategy.endgameModeActive ? 'caution' : 'neutral'} />
        <DebugField
          label="Primary Health SOC"
          value={`${raceHealth.breakdown.primaryHealthSocPercent.toFixed(1)}%`}
          tone={raceHealth.breakdown.primaryHealthSocPercent > strategy.activeReserveSocPercent ? 'healthy' : 'danger'}
        />
        <DebugField
          label="Secondary Forecast SOC"
          value={`${raceHealth.breakdown.secondaryForecastSocPercent.toFixed(1)}%`}
          tone={raceHealth.breakdown.secondaryForecastSocPercent > strategy.activeReserveSocPercent ? 'healthy' : 'caution'}
        />
        <DebugField
          label="Health Margin"
          value={`${raceHealth.breakdown.socMarginPercent.toFixed(1)}%`}
          tone={raceHealth.breakdown.socMarginPercent > 0 ? 'healthy' : 'danger'}
        />
        <DebugField label="SOC Margin Bonus" value={`+${raceHealth.breakdown.socMarginBonus.toFixed(1)}`} tone="healthy" />
        <DebugField label="Route Risk Penalty" value={`-${raceHealth.breakdown.routeRiskPenalty}`} tone={penaltyDebugTone(raceHealth.breakdown.routeRiskPenalty)} />
        <DebugField label="Next Opportunity Penalty" value={`-${raceHealth.breakdown.nextOpportunityPenalty}`} tone={penaltyDebugTone(raceHealth.breakdown.nextOpportunityPenalty)} />
        <DebugField label="Full Day Energy Caution" value={`-${raceHealth.breakdown.fullDayEnergyCautionPenalty}`} tone={penaltyDebugTone(raceHealth.breakdown.fullDayEnergyCautionPenalty)} />
        <DebugField label="Elevation Penalty" value={strategy.elevationSocCostPercent ? `-${Math.min(12, Math.round(strategy.elevationSocCostPercent))}` : '-0'} tone={penaltyDebugTone(strategy.elevationSocCostPercent ? Math.min(12, Math.round(strategy.elevationSocCostPercent)) : 0)} />
        <DebugField label="Swap Penalty" value={`-${raceHealth.breakdown.swapPenalty}`} tone={penaltyDebugTone(raceHealth.breakdown.swapPenalty)} />
        <DebugField label="Telemetry Penalty" value={`-${raceHealth.breakdown.telemetryPenalty}`} tone={penaltyDebugTone(raceHealth.breakdown.telemetryPenalty)} />
        <DebugField label="Final Score" value={String(raceHealth.breakdown.finalScore)} tone={scoreDebugTone(raceHealth.score)} />
      </DebugSection>

      <DebugSection title="Energy Model">
        <DebugField label="Baseline Wh/mi" value={`${strategy.modelWhPerMile.toFixed(1)} Wh/mi`} />
        <DebugField
          label="Raw Telemetry Wh/mi"
          value={
            strategy.rawTelemetryWhPerMile !== undefined
              ? `${strategy.rawTelemetryWhPerMile.toFixed(1)} Wh/mi`
              : '--'
          }
          tone={
            strategy.usingFallbackStrategyWhPerMile &&
            strategy.rawTelemetryWhPerMile !== undefined
              ? 'caution'
              : 'neutral'
          }
        />
        <DebugField
          label="Safe Strategy Wh/mi"
          value={`${strategy.safeStrategyWhPerMile.toFixed(1)} Wh/mi`}
          tone={strategy.usingFallbackStrategyWhPerMile ? 'caution' : 'healthy'}
        />
        <DebugField
          label="Fallback Status"
          value={
            strategy.usingFallbackStrategyWhPerMile
              ? `Using fallback strategy Wh/mi${strategy.strategyWhPerMileFallbackReason ? `: ${strategy.strategyWhPerMileFallbackReason}` : ''}`
              : 'Live/model Wh/mi accepted'
          }
          tone={strategy.usingFallbackStrategyWhPerMile ? 'caution' : 'healthy'}
        />
        <DebugField label="Remaining Miles" value={`${remainingMiles.toFixed(1)} mi`} />
        <DebugField label="Baseline Remaining Energy" value={`${baselineRemainingEnergyWh.toFixed(0)} Wh`} />
      </DebugSection>

      <DebugSection title="Elevation">
        <DebugField label="Elevation Adjusted" value={strategy.elevationAdjusted ? 'true' : 'false'} tone={strategy.elevationAdjusted ? 'healthy' : 'neutral'} />
        <DebugField label="Elevation Gain" value={`${elevationGain.toFixed(0)} ft`} />
        <DebugField label="Elevation Loss" value={`${elevationLoss.toFixed(0)} ft`} />
        <DebugField label="Elevation Energy" value={strategy.elevationEnergyWh !== undefined ? `${strategy.elevationEnergyWh.toFixed(0)} Wh` : '--'} tone={penaltyDebugTone(strategy.elevationSocCostPercent ?? 0)} />
        <DebugField label="Elevation SOC Cost" value={strategy.elevationSocCostPercent !== undefined ? `${strategy.elevationSocCostPercent.toFixed(1)}%` : '--'} tone={penaltyDebugTone(strategy.elevationSocCostPercent ?? 0)} />
        <DebugField label="Elevation Caps Applied" value={strategy.elevationWarnings?.some((warning) => warning.toLowerCase().includes('capped')) ? 'yes' : 'no'} tone={strategy.elevationWarnings?.some((warning) => warning.toLowerCase().includes('capped')) ? 'caution' : 'healthy'} />
        <DebugField label="Elevation Warnings" value={strategy.elevationWarnings?.length ? strategy.elevationWarnings.join(' | ') : 'none'} tone={strategy.elevationWarnings?.length ? 'caution' : 'healthy'} />
      </DebugSection>

      <DebugSection title="Route Intelligence">
        <DebugField label="Segment Risk" value={currentSegment?.risk ?? '--'} tone={currentSegment ? riskDebugTone(currentSegment.risk) : 'neutral'} />
        <DebugField label="Segment Type" value={currentSegment?.type ?? '--'} />
        <DebugField label="Upcoming Risks Count" value={String(strategy.routeIntelligence.risks.length)} tone={penaltyDebugTone(strategy.routeIntelligence.risks.length * 2)} />
        <DebugField label="Upcoming Opportunities Count" value={String(strategy.routeIntelligence.opportunities.length)} tone="healthy" />
      </DebugSection>

      <DebugSection title="Battery Swap">
        <DebugField
          label="Swap Advisor Input SOC"
          value={`${strategy.swapAdvice.debug.swapAdvisorInputSoc.toFixed(1)}%`}
          tone={strategy.swapAdvice.debug.swapAdvisorInputSoc > strategy.activeReserveSocPercent ? 'healthy' : 'danger'}
        />
        <DebugField
          label="Swap Advisor Spare SOC"
          value={`${strategy.swapAdvice.debug.swapAdvisorInputSpareSoc.toFixed(1)}%`}
          tone={strategy.swapAdvice.debug.swapAdvisorInputSpareSoc > strategy.activeReserveSocPercent ? 'healthy' : 'danger'}
        />
        <DebugField
          label="Raw Telemetry SOC"
          value={formatPercent(strategy.rawTelemetrySocPercent)}
          tone={
            strategy.usingFallbackStrategySoc &&
            strategy.rawTelemetrySocPercent !== undefined
              ? 'caution'
              : 'neutral'
          }
        />
        <DebugField
          label="Safe Strategy SOC"
          value={formatPercent(strategy.safeStrategySocPercent)}
          tone={strategy.usingFallbackStrategySoc ? 'caution' : 'healthy'}
        />
        <DebugField
          label="SOC Fallback Status"
          value={
            strategy.usingFallbackStrategySoc
              ? `Using fallback strategy SOC${strategy.strategySocFallbackReason ? `: ${strategy.strategySocFallbackReason}` : ''}`
              : 'Telemetry SOC accepted'
          }
          tone={strategy.usingFallbackStrategySoc ? 'caution' : 'healthy'}
        />
        <DebugField label="Spare SOC" value={formatPercent(spareBatterySocPercent)} />
        <DebugField
          label="Wh To Next Operational Opportunity"
          value={`${strategy.swapAdvice.debug.estimatedWhToNextOperationalOpportunity.toFixed(0)} Wh`}
          tone={penaltyDebugTone(strategy.swapAdvice.debug.estimatedWhToNextOperationalOpportunity / rx2Config.mainBatteryUsableWh * 10)}
        />
        <DebugField
          label="Next Opportunity Type"
          value={strategy.swapAdvice.debug.nextOperationalOpportunityType}
        />
        <DebugField
          label="Next Opportunity Mile"
          value={`${strategy.swapAdvice.debug.nextOperationalOpportunityMile.toFixed(1)} mi`}
        />
        <DebugField
          label="Full Day Energy Wh"
          value={`${strategy.swapAdvice.debug.estimatedWhToFinishDay.toFixed(0)} Wh`}
          tone={penaltyDebugTone(strategy.swapAdvice.debug.estimatedWhToFinishDay / rx2Config.mainBatteryUsableWh * 10)}
        />
        <DebugField
          label="Battery Capacity"
          value={`${strategy.swapAdvice.debug.batteryCapacityWh.toFixed(0)} Wh`}
        />
        <DebugField
          label="Projected SOC At Next Opportunity"
          value={`${strategy.swapAdvice.debug.projectedSocAtNextOpportunity.toFixed(1)}%`}
          tone={strategy.swapAdvice.debug.projectedSocAtNextOpportunity > strategy.activeReserveSocPercent ? 'healthy' : 'danger'}
        />
        <DebugField
          label="Projected SOC At Finish Day Info"
          value={`${strategy.swapAdvice.debug.projectedSocAtFinishDayInformational.toFixed(1)}%`}
          tone={strategy.swapAdvice.debug.projectedSocAtFinishDayInformational > strategy.activeReserveSocPercent ? 'healthy' : 'caution'}
        />
        <DebugField
          label="Continue SOC Raw"
          value={`${strategy.swapAdvice.debug.projectedContinueSocRaw.toFixed(1)}%`}
          tone={strategy.swapAdvice.debug.projectedContinueSocRaw > strategy.activeReserveSocPercent ? 'healthy' : 'danger'}
        />
        <DebugField
          label="Swap SOC Raw"
          value={`${strategy.swapAdvice.debug.projectedSwapSocRaw.toFixed(1)}%`}
          tone={strategy.swapAdvice.debug.projectedSwapSocRaw > strategy.activeReserveSocPercent ? 'healthy' : 'danger'}
        />
        <DebugField label="Swap Action" value={strategy.swapAdvice.action} tone={swapDebugTone(strategy.swapAdvice.urgency)} />
        <DebugField label="Swap Urgency" value={strategy.swapAdvice.urgency} tone={swapDebugTone(strategy.swapAdvice.urgency)} />
        <DebugField label="Continue SOC" value={`${strategy.swapAdvice.projectedSocIfContinue.toFixed(1)}%`} />
        <DebugField label="Swap SOC" value={`${strategy.swapAdvice.projectedSocAfterSwap.toFixed(1)}%`} />
        <DebugField label="Reserve SOC" value={`${strategy.activeReserveSocPercent}%`} />
      </DebugSection>

      <DebugSection title="Trailering">
        <DebugField label="Trailering Advice" value={strategy.routeIntelligence.traileringOption.action} tone={traileringDebugTone(strategy.routeIntelligence.traileringOption.action)} />
        <DebugField label="Energy Saved" value={`${strategy.routeIntelligence.traileringOption.estimatedEnergySavedWh.toFixed(0)} Wh`} />
        <DebugField label="Mileage Penalty" value={`${strategy.routeIntelligence.traileringOption.mileagePenalty.toFixed(1)} mi`} />
      </DebugSection>

      <DebugSection title="Telemetry">
        <DebugField label="Telemetry Source" value={telemetrySourceLabel(telemetrySource)} />
        <DebugField label="Connection Status" value={connectionStatus} tone={connectionDebugTone(connectionStatus)} />
        <DebugField label="Telemetry Status" value={telemetryStatus} tone={telemetryStatus === 'error' ? 'danger' : telemetryStatus === 'disconnected' ? 'caution' : 'healthy'} />
        <DebugField label="Telemetry Status Source" value={formatTelemetryStatusSource(effectiveStatusSource)} />
        <DebugField label="Last Packet Age" value={lastPacketAgeSeconds !== undefined ? `${lastPacketAgeSeconds}s` : '--'} tone={lastPacketAgeSeconds !== undefined && lastPacketAgeSeconds > 30 ? 'caution' : 'healthy'} />
        <DebugField label={effectiveStatusSource === 'health' ? 'Client Polling Packets' : 'Packets Received'} value={`${packetStats.packetsReceived}`} />
        <DebugField label={effectiveStatusSource === 'health' ? 'Client Polling PPM' : 'Packets Per Minute'} value={`${packetStats.packetsPerMinute}`} />
        <DebugField
          label={effectiveStatusSource === 'health' ? 'Client Polling Avg Interval' : 'Avg Update Interval'}
          value={
            packetStats.averageUpdateIntervalSeconds !== null
              ? `${packetStats.averageUpdateIntervalSeconds.toFixed(1)}s`
              : '--'
          }
        />
        <DebugField
          label="Packet Loss Estimate"
          value={
            effectiveStatusSource === 'health'
              ? 'N/A - using health endpoint'
              : packetStats.packetLossEstimatePercent !== null
              ? `${packetStats.packetLossEstimatePercent.toFixed(0)}%`
              : '--'
          }
          tone={
            effectiveStatusSource !== 'health' &&
            packetStats.packetLossEstimatePercent !== null &&
            packetStats.packetLossEstimatePercent > 10
              ? 'caution'
              : 'healthy'
          }
        />
        <DebugField label="Telemetry Penalty Applied" value={`-${raceHealth.breakdown.telemetryPenalty}`} tone={penaltyDebugTone(raceHealth.breakdown.telemetryPenalty)} />
      </DebugSection>

      <pre className="max-h-72 overflow-auto rounded-md border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-300">
        {debugSnapshot}
      </pre>
    </section>
  )
}

function DebugSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
        {title}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </section>
  )
}

function DebugField({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'healthy' | 'caution' | 'danger' | 'neutral'
}) {
  return (
    <div className={`rounded-md border p-3 ${debugToneStyle(tone)}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black">{value}</p>
    </div>
  )
}

const telemetrySources: TelemetrySource[] = [
  'simulator',
  'mock-esp32',
  'esp32',
  'cloud',
  'manual',
  'websocket',
  'serial',
  'ble',
  'canbus',
]

function TelemetrySourceSetup({
  status,
  source,
  connectionStatus,
  connectionError,
  lastPacketAt,
  cloudNode,
  connect,
  disconnect,
  setSource,
  setCloudNode,
}: {
  status: TelemetryConnectionStatus
  source: TelemetrySource
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  connectionError?: string
  lastPacketAt?: number
  cloudNode: TelemetryNodeId
  connect: () => void
  disconnect: () => void
  setSource: (source: TelemetrySource) => void
  setCloudNode: (node: TelemetryNodeId) => void
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-semibold text-[#ff8fcb]">
            Telemetry Source
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Select simulator, local ESP32, or Cloud Telemetry for hosted race updates.
          </p>
        </div>
        <Badge label={status} className={statusStyles[status]} />
      </div>

      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Source
          </span>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as TelemetrySource)}
            className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-[#ff3ea5]/60"
          >
            {telemetrySources.map((telemetrySource) => (
              <option key={telemetrySource} value={telemetrySource}>
                {telemetrySourceLabel(telemetrySource)}
              </option>
            ))}
          </select>
        </label>
        {source === 'cloud' ? (
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Node
            </span>
            <select
              value={cloudNode}
              onChange={(event) =>
                setCloudNode(event.target.value as TelemetryNodeId)
              }
              className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-[#ff3ea5]/60"
            >
              {telemetryNodeOptions.map((node) => (
                <option key={node} value={node}>
                  {telemetryNodeLabel(node)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={connect}
          className="h-10 rounded-md bg-[#ff3ea5] px-3 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f]"
        >
          {source === 'esp32'
            ? 'Start ESP32'
            : source === 'cloud'
            ? 'Start Cloud'
            : 'Start simulation'}
        </button>
        <button
          type="button"
          onClick={disconnect}
          className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10"
        >
          Stop telemetry
        </button>
      </div>

      <div className="mt-3">
        <CloudTelemetryStatusCard
          enabled={source === 'cloud'}
          node={cloudNode}
          connectionStatus={connectionStatus}
          lastPacketAt={lastPacketAt}
        />
      </div>

      <div className="mt-3 grid gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm sm:grid-cols-3">
        <LogMetric label="Source" value={telemetrySourceLabel(source)} />
        <LogMetric label="Connection" value={connectionStatus} />
        <LogMetric
          label="Last packet"
          value={formatLastPacketAge(lastPacketAt)}
        />
      </div>

      {status === 'error' && connectionError ? (
        <p className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm font-semibold text-[#ff8fcb]">
          {connectionError}
        </p>
      ) : null}
    </section>
  )
}

function PreRaceChecklist({
  checklist,
  onItemChange,
  onReset,
}: {
  checklist: Record<string, boolean>
  onItemChange: (item: string, checked: boolean) => void
  onReset: () => void
}) {
  const completedCount = preRaceChecklistItems.filter((item) => checklist[item]).length

  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-[#ff8fcb]">
            Pre-Race Checklist
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {completedCount} of {preRaceChecklistItems.length} complete
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10"
        >
          Reset Checklist
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {preRaceChecklistItems.map((item) => (
          <label
            key={item}
            className="flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm font-semibold text-slate-200"
          >
            <input
              type="checkbox"
              checked={Boolean(checklist[item])}
              onChange={(event) => onItemChange(item, event.target.checked)}
              className="h-5 w-5 accent-[#ff3ea5]"
            />
            <span>{item}</span>
          </label>
        ))}
      </div>
    </section>
  )
}

function EndOfDaySummaryPanel({
  summary,
  onRefresh,
  onDownload,
}: {
  summary: DaySummary
  onRefresh: () => void
  onDownload: () => void
}) {
  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-[#ff8fcb]">
            End-of-Day Summary
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Day {summary.day} rollup from strategy snapshots and race events.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10"
          >
            Refresh Summary
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="h-10 rounded-md bg-[#ff3ea5] px-3 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f]"
          >
            Download Summary CSV
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusMetric label="Starting SOC" value={formatPercent(summary.startingSoc)} />
        <StatusMetric label="Ending SOC" value={formatPercent(summary.endingSoc)} />
        <StatusMetric label="Average speed" value={formatSpeed(summary.averageSpeed)} />
        <StatusMetric label="Max speed" value={formatSpeed(summary.maxSpeed)} />
        <StatusMetric
          label="Trailering miles"
          value={`${summary.traileredMiles.toFixed(1)} mi`}
        />
        <StatusMetric label="Battery swaps" value={String(summary.batterySwapCount)} />
        <StatusMetric label="Manual notes" value={String(summary.manualNoteCount)} />
        <StatusMetric label="Total warnings" value={String(summary.warningCountTotal)} />
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
          Critical Events
        </p>
        {summary.criticalEvents.length > 0 ? (
          <ul className="mt-2 grid gap-2 text-sm leading-6 text-slate-200">
            {summary.criticalEvents.map((event) => (
              <li key={event} className="rounded-md bg-black/25 px-3 py-2">
                {event}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm leading-6 text-slate-400">
            No critical events logged for this day.
          </p>
        )}
      </div>
    </section>
  )
}

function RecentStrategyLogPanel({
  snapshots,
  onClearSnapshots,
}: {
  snapshots: RaceSnapshot[]
  onClearSnapshots: () => void
}) {
  const recentSnapshots = snapshots.slice(-5).reverse()
  const hasSnapshots = snapshots.length > 0

  function downloadSnapshotsCsv() {
    downloadCsv({
      csv: exportRaceSnapshotsToCsv(snapshots),
      filename: `rx2-strategy-log-${formatDownloadTimestamp(new Date())}.csv`,
      enabled: hasSnapshots,
    })
  }

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-[#ff8fcb]">
            Recent Strategy Log
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Last five telemetry and strategy snapshots.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadSnapshotsCsv}
            disabled={!hasSnapshots}
            className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Download CSV
          </button>
          <button
            type="button"
            onClick={onClearSnapshots}
            disabled={!hasSnapshots}
            className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear Log
          </button>
        </div>
      </div>

      {recentSnapshots.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-slate-400">
          No strategy snapshots recorded yet.
        </p>
      ) : (
        <div className="mt-3 grid gap-2">
          {recentSnapshots.map((snapshot) => (
            <article
              key={`${snapshot.timestamp}-${snapshot.currentMile}`}
              className="grid gap-2 rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm md:grid-cols-[0.8fr_0.7fr_0.7fr_1.4fr_0.8fr_0.9fr]"
            >
              <LogMetric
                label="Time"
                value={new Date(snapshot.timestamp).toLocaleTimeString()}
              />
              <LogMetric label="Speed" value={`${snapshot.speedMph.toFixed(1)} mph`} />
              <LogMetric label="SOC" value={`${snapshot.batterySocPercent.toFixed(0)}%`} />
              <LogMetric label="Command" value={snapshot.command ?? '--'} />
              <LogMetric
                label="Finish SOC"
                value={
                  snapshot.projectedFinishSoc !== undefined
                    ? `${snapshot.projectedFinishSoc.toFixed(0)}%`
                    : '--'
                }
              />
              <LogMetric label="Swap" value={snapshot.swapAction ?? '--'} />
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function TraileringControls({
  activeSession,
  currentMile,
  countingMilesToday,
  traileredMilesToday,
  raceEvents,
  traileringSessions,
  latestBatterySwap,
  latestManualNote,
  manualNoteText,
  manualNoteError,
  warning,
  onStart,
  onEnd,
  onLogBatterySwap,
  onManualNoteChange,
  onLogManualNote,
  onResetRaceDayLogs,
}: {
  activeSession: TraileringSession | null
  currentMile: number
  countingMilesToday: number
  traileredMilesToday: number
  raceEvents: RaceEvent[]
  traileringSessions: TraileringSession[]
  latestBatterySwap: RaceEvent | null
  latestManualNote: RaceEvent | null
  manualNoteText: string
  manualNoteError: string
  warning: string
  onStart: () => void
  onEnd: () => void
  onLogBatterySwap: () => void
  onManualNoteChange: (value: string) => void
  onLogManualNote: () => void
  onResetRaceDayLogs: () => void
}) {
  const hasRaceEvents = raceEvents.length > 0
  const hasTraileringSessions = traileringSessions.length > 0

  function downloadRaceEventsCsv() {
    downloadCsv({
      csv: exportRaceEventsToCsv(raceEvents),
      filename: `rx2-race-events-${formatDownloadTimestamp(new Date())}.csv`,
      enabled: hasRaceEvents,
    })
  }

  function downloadTraileringSessionsCsv() {
    downloadCsv({
      csv: exportTraileringSessionsToCsv(traileringSessions),
      filename: `rx2-trailering-sessions-${formatDownloadTimestamp(new Date())}.csv`,
      enabled: hasTraileringSessions,
    })
  }

  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-semibold text-[#ff8fcb]">
            Trailering Status
          </p>
          <h2 className="mt-1 text-xl font-black text-white">
            {activeSession ? 'Trailering Active' : 'Driving'}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Trailered/towed miles are logged as non-counting race mileage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onStart}
            disabled={Boolean(activeSession)}
            className="h-10 rounded-md bg-[#ff3ea5] px-3 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start Trailering
          </button>
          <button
            type="button"
            onClick={onEnd}
            disabled={!activeSession}
            className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            End Trailering
          </button>
          <button
            type="button"
            onClick={onLogBatterySwap}
            className="h-10 rounded-md bg-[#ff3ea5] px-3 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f]"
          >
            Log Battery Swap
          </button>
          <button
            type="button"
            onClick={downloadRaceEventsCsv}
            disabled={!hasRaceEvents}
            className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Download Events CSV
          </button>
          <button
            type="button"
            onClick={downloadTraileringSessionsCsv}
            disabled={!hasTraileringSessions}
            className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Download Trailering CSV
          </button>
          <button
            type="button"
            onClick={onResetRaceDayLogs}
            disabled={!hasRaceEvents}
            className="h-10 rounded-md border border-red-400/30 bg-red-400/10 px-3 text-sm font-bold text-[#ff8fcb] transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset Race Day Logs
          </button>
        </div>
      </div>

      <p className="mt-3 rounded-md border border-yellow-300/30 bg-yellow-300/10 p-3 text-sm font-semibold text-yellow-100">
        Export CSVs before resetting. This cannot be undone.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <StatusMetric label="Current mile" value={currentMile.toFixed(1)} />
        <StatusMetric
          label="Trailered today"
          value={`${traileredMilesToday.toFixed(1)} mi`}
        />
        <StatusMetric
          label="Counting today"
          value={`${countingMilesToday.toFixed(1)} mi`}
        />
        <StatusMetric
          label="Active start"
          value={activeSession ? activeSession.startMile.toFixed(1) : '--'}
        />
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
          Latest Battery Swap
        </p>
        {latestBatterySwap ? (
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-4">
            <LogMetric
              label="Time"
              value={new Date(latestBatterySwap.timestamp).toLocaleTimeString()}
            />
            <LogMetric label="Day" value={String(latestBatterySwap.day)} />
            <LogMetric label="Mile" value={latestBatterySwap.mile.toFixed(1)} />
            <LogMetric label="Note" value={latestBatterySwap.note ?? '--'} />
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-slate-400">
            No battery swap logged yet.
          </p>
        )}
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
          Manual Race Note
        </p>
        <div className="mt-2 grid gap-2">
          <textarea
            value={manualNoteText}
            onChange={(event) => onManualNoteChange(event.target.value)}
            rows={3}
            placeholder="Record operational note..."
            className="min-h-24 rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-[#ff3ea5]/60"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onLogManualNote}
              className="h-10 rounded-md bg-[#ff3ea5] px-3 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f]"
            >
              Log Note
            </button>
            {manualNoteError ? (
              <span className="text-sm font-semibold text-[#ff8fcb]">
                {manualNoteError}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
            Latest Manual Note
          </p>
          {latestManualNote ? (
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-4">
              <LogMetric
                label="Time"
                value={new Date(latestManualNote.timestamp).toLocaleTimeString()}
              />
              <LogMetric label="Day" value={String(latestManualNote.day)} />
              <LogMetric label="Mile" value={latestManualNote.mile.toFixed(1)} />
              <LogMetric label="Note" value={latestManualNote.note ?? '--'} />
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-400">
              No manual note logged yet.
            </p>
          )}
        </div>
      </div>

      {warning ? (
        <p className="mt-3 rounded-md border border-yellow-300/30 bg-yellow-300/10 p-3 text-sm font-semibold text-yellow-100">
          {warning}
        </p>
      ) : null}
    </section>
  )
}

function LogMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate font-semibold text-slate-100" title={value}>
        {value}
      </p>
    </div>
  )
}

function formatPercent(value?: number) {
  return value === undefined ? '--' : `${value.toFixed(1)}%`
}

function formatSpeed(value?: number) {
  return value === undefined ? '--' : `${value.toFixed(1)} mph`
}

function downloadCsv({
  csv,
  filename,
  enabled,
}: {
  csv: string
  filename: string
  enabled: boolean
}) {
  if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

function formatDownloadTimestamp(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}-${hours}${minutes}`
}

function telemetrySourceLabel(source: TelemetrySource) {
  if (source === 'mock-esp32') return 'Mock ESP32'
  if (source === 'esp32') return 'ESP32 Live'
  if (source === 'cloud') return 'Cloud Telemetry'
  if (source === 'websocket') return 'WebSocket'
  if (source === 'ble') return 'BLE'
  if (source === 'canbus') return 'CAN bus'

  return source.charAt(0).toUpperCase() + source.slice(1)
}

function telemetryNodeLabel(node: TelemetryNodeId) {
  if (node === 'mppt') return 'MPPT'
  if (node === 'spare-battery') return 'Spare Battery'

  return node.charAt(0).toUpperCase() + node.slice(1)
}

function formatTelemetryStatusSource(source: TelemetryEffectiveStatusSource) {
  if (source === 'health') return 'health'

  return 'latest'
}

function formatLastPacketAge(timestamp?: number) {
  if (!timestamp) return '--'

  const ageSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  const ageLabel =
    ageSeconds < 60
      ? `${ageSeconds}s ago`
      : `${Math.floor(ageSeconds / 60)}m ${ageSeconds % 60}s ago`

  return `${ageLabel} (${new Date(timestamp).toLocaleTimeString()})`
}

function classifyMissionStatus(
  strategy: ReturnType<typeof generatePredictiveStrategy>
): MissionStatus {
  const traileringAction = strategy.routeIntelligence.traileringOption.action
  const highestRouteSeverity = highestRouteRiskSeverity(
    strategy.routeIntelligence.risks
  )
  const nextOpportunitySoc = strategy.swapAdvice.debug.projectedSocAtNextOpportunity
  const activeReserveSoc = strategy.activeReserveSocPercent

  if (nextOpportunitySoc < strategy.absoluteMinimumSocPercent) {
    return 'CRITICAL_ENERGY'
  }

  if (strategy.isFinalDay) {
    if (nextOpportunitySoc < activeReserveSoc) return 'AT_RISK'

    if (
      strategy.swapAdvice.action === 'SWAP_NOW' ||
      strategy.swapAdvice.action === 'SWAP_AT_NEXT_STOP' ||
      traileringAction === 'TRAILER_REQUIRED' ||
      traileringAction === 'TRAILER_RECOMMENDED'
    ) {
      return 'AT_RISK'
    }

    if (highestRouteSeverity === 'SEVERE') return 'AT_RISK'

    return 'FINISH_PUSH'
  }

  if (
    traileringAction === 'TRAILER_REQUIRED' ||
    traileringAction === 'TRAILER_RECOMMENDED'
  ) {
    return 'TRAILERING_RECOMMENDED'
  }

  if (
    strategy.swapAdvice.action === 'SWAP_NOW' ||
    strategy.swapAdvice.action === 'SWAP_AT_NEXT_STOP'
  ) {
    return 'SWAP_RECOMMENDED'
  }

  if (
    nextOpportunitySoc < activeReserveSoc ||
    highestRouteSeverity === 'SEVERE'
  ) {
    return 'AT_RISK'
  }

  if (
    nextOpportunitySoc < activeReserveSoc + 10 ||
    traileringAction === 'CONSERVE_AND_DRIVE' ||
    highestRouteSeverity === 'HIGH'
  ) {
    return 'CONSERVE'
  }

  return 'ON_TARGET'
}

function highestRouteRiskSeverity(
  risks: ReturnType<typeof generatePredictiveStrategy>['routeIntelligence']['risks']
) {
  const severityRank = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    SEVERE: 4,
  } as const

  return risks.reduce<'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE'>(
    (highest, risk) =>
      severityRank[risk.severity] > severityRank[highest]
        ? risk.severity
        : highest,
    'LOW'
  )
}

function missionStatusStyle(status: MissionStatus) {
  if (status === 'ON_TARGET' || status === 'FINISH_PUSH') {
    return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  }

  if (status === 'CONSERVE') {
    return 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100'
  }

  if (status === 'AT_RISK') {
    return 'border-orange-400/40 bg-orange-400/10 text-orange-100'
  }

  return 'border-red-400/40 bg-red-400/10 text-[#ff8fcb]'
}

function missionStatusBannerStyle(status: MissionStatus) {
  if (status === 'ON_TARGET' || status === 'FINISH_PUSH') {
    return 'border-emerald-400/40 bg-emerald-400/10'
  }

  if (status === 'CONSERVE') {
    return 'border-yellow-300/40 bg-yellow-300/10'
  }

  if (status === 'AT_RISK') {
    return 'border-orange-400/40 bg-orange-400/10'
  }

  return 'border-red-400/40 bg-red-400/10'
}

function formatMissionStatus(status: MissionStatus) {
  return status.replaceAll('_', ' ')
}

function calculateRaceHealth({
  strategy,
  telemetrySource,
  telemetryStatus,
  connectionStatus,
}: {
  strategy: ReturnType<typeof generatePredictiveStrategy>
  telemetrySource: TelemetrySource
  telemetryStatus: TelemetryConnectionStatus
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
}): RaceHealth {
  const breakdown = calculateRaceHealthBreakdown({
    strategy,
    telemetrySource,
    telemetryStatus,
    connectionStatus,
  })
  const score = breakdown.finalScore

  return {
    score,
    breakdown,
    label:
      score >= 90
        ? 'Excellent'
        : score >= 75
          ? 'Good'
          : score >= 60
            ? 'Caution'
            : 'Recovery',
  }
}

function calculateRaceHealthBreakdown({
  strategy,
  telemetrySource,
  telemetryStatus,
  connectionStatus,
}: {
  strategy: ReturnType<typeof generatePredictiveStrategy>
  telemetrySource: TelemetrySource
  telemetryStatus: TelemetryConnectionStatus
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
}): RaceHealthBreakdown {
  const baseScore = 65
  const primaryHealthSocPercent =
    strategy.swapAdvice.debug.projectedSocAtNextOpportunity
  const secondaryForecastSocPercent =
    strategy.swapAdvice.debug.projectedSocAtFinishDayInformational
  const socMarginPercent =
    primaryHealthSocPercent - strategy.activeReserveSocPercent
  const socMarginBonus = socMarginBonusForOperationalMargin(socMarginPercent)
  const highestRouteSeverity = highestRouteRiskSeverity(
    strategy.routeIntelligence.risks
  )
  const swapPenalty = swapAdvicePenalty({
    swapAdvice: strategy.swapAdvice,
    activeReserveSocPercent: strategy.activeReserveSocPercent,
  })
  const traileringPenaltyValue = traileringPenalty(
    strategy.routeIntelligence.traileringOption.action,
    strategy.isFinalDay
  )
  const nextOpportunityPenaltyValue = nextOpportunityPenalty({
    swapAdvice: strategy.swapAdvice,
    activeReserveSocPercent: strategy.activeReserveSocPercent,
    absoluteMinimumSocPercent: strategy.absoluteMinimumSocPercent,
    isFinalDay: strategy.isFinalDay,
  })
  const fullDayEnergyCautionPenaltyValue = fullDayEnergyCautionPenalty(
    strategy.swapAdvice,
    strategy.activeReserveSocPercent,
    strategy.absoluteMinimumSocPercent,
    strategy.isFinalDay
  )
  const routeRiskPenalty = routeSeverityPenalty(highestRouteSeverity)
  const telemetryPenalty = telemetryHealthPenalty(
    telemetrySource,
    telemetryStatus,
    connectionStatus
  )
  const finalScore = Math.round(
    clampScore(
      baseScore +
        socMarginBonus -
        swapPenalty -
        traileringPenaltyValue -
        nextOpportunityPenaltyValue -
        fullDayEnergyCautionPenaltyValue -
        routeRiskPenalty -
        telemetryPenalty
    )
  )

  return {
    baseScore,
    healthBasis: 'Next Operational Opportunity',
    primaryHealthSocPercent,
    secondaryForecastSocPercent,
    socMarginPercent,
    socMarginBonus,
    swapPenalty,
    traileringPenalty: traileringPenaltyValue,
    nextOpportunityPenalty: nextOpportunityPenaltyValue,
    fullDayEnergyCautionPenalty: fullDayEnergyCautionPenaltyValue,
    routeRiskPenalty,
    telemetryPenalty,
    highestRouteSeverity,
    isFinalDay: strategy.isFinalDay,
    activeReserveSocPercent: strategy.activeReserveSocPercent,
    finalDayTargetReserveSocPercent: strategy.finalDayTargetReserveSocPercent,
    absoluteMinimumSocPercent: strategy.absoluteMinimumSocPercent,
    endgameModeActive: strategy.endgameModeActive,
    finalScore,
  }
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score))
}

function socMarginBonusForOperationalMargin(marginPercent: number) {
  if (marginPercent > 30) return 35
  if (marginPercent > 20) return 25
  if (marginPercent > 10) return 15
  if (marginPercent > 5) return 8
  if (marginPercent > 0) return 3
  return 0
}

function swapAdvicePenalty({
  swapAdvice,
  activeReserveSocPercent,
}: {
  swapAdvice: ReturnType<typeof generatePredictiveStrategy>['swapAdvice']
  activeReserveSocPercent: number
}) {
  const action = swapAdvice.action

  if (action === 'SWAP_NOW') return 28
  if (action === 'SWAP_AT_NEXT_STOP') return 18
  if (
    action === 'DELAY_SWAP' &&
    swapAdvice.projectedSocIfContinue <= activeReserveSocPercent + 5
  ) {
    return 4
  }
  return 0
}

function traileringPenalty(
  action: ReturnType<typeof generatePredictiveStrategy>['routeIntelligence']['traileringOption']['action'],
  isFinalDay: boolean
) {
  if (action === 'TRAILER_REQUIRED') return 30
  if (action === 'TRAILER_RECOMMENDED') return 22
  if (isFinalDay && (action === 'TRAILER_OPTIONAL' || action === 'CONSERVE_AND_DRIVE')) {
    return 0
  }
  if (action === 'TRAILER_OPTIONAL') return 10
  if (action === 'CONSERVE_AND_DRIVE') return 6
  return 0
}

function nextOpportunityPenalty({
  swapAdvice,
  activeReserveSocPercent,
  absoluteMinimumSocPercent,
  isFinalDay,
}: {
  swapAdvice: ReturnType<typeof generatePredictiveStrategy>['swapAdvice']
  activeReserveSocPercent: number
  absoluteMinimumSocPercent: number
  isFinalDay: boolean
}) {
  const marginPercent =
    swapAdvice.debug.projectedSocAtNextOpportunity - activeReserveSocPercent

  if (isFinalDay) {
    if (swapAdvice.debug.projectedSocAtNextOpportunity < absoluteMinimumSocPercent) {
      return 18
    }
    if (marginPercent < -5) return 8
    if (marginPercent < 0) return 4
    return 0
  }

  if (marginPercent < -10) return 18
  if (marginPercent < -5) return 12
  if (marginPercent < 0) return 6
  return 0
}

function fullDayEnergyCautionPenalty(
  swapAdvice: ReturnType<typeof generatePredictiveStrategy>['swapAdvice'],
  activeReserveSocPercent: number,
  absoluteMinimumSocPercent: number,
  isFinalDay: boolean
) {
  const finishSoc = swapAdvice.debug.projectedSocAtFinishDayInformational

  if (isFinalDay && finishSoc < absoluteMinimumSocPercent) return 6

  return finishSoc < activeReserveSocPercent ? 4 : 0
}

function routeSeverityPenalty(severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE') {
  if (severity === 'SEVERE') return 18
  if (severity === 'HIGH') return 10
  if (severity === 'MEDIUM') return 4
  return 0
}

function telemetryHealthPenalty(
  telemetrySource: TelemetrySource,
  telemetryStatus: TelemetryConnectionStatus,
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
) {
  if (telemetryStatus === 'error' || connectionStatus === 'error') return 12
  if (telemetrySource === 'simulator' || telemetrySource === 'mock-esp32') return 0
  if (telemetrySource === 'manual') return 0
  if (telemetryStatus === 'disconnected' || connectionStatus === 'disconnected') {
    return 6
  }
  if (connectionStatus === 'connecting') return 3
  return 0
}

function debugToneStyle(tone: 'healthy' | 'caution' | 'danger' | 'neutral') {
  if (tone === 'healthy') {
    return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
  }

  if (tone === 'caution') {
    return 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100'
  }

  if (tone === 'danger') {
    return 'border-red-400/30 bg-red-400/10 text-[#ff8fcb]'
  }

  return 'border-white/10 bg-white/[0.035] text-slate-100'
}

function penaltyDebugTone(value: number) {
  if (value >= 12) return 'danger'
  if (value > 0) return 'caution'
  return 'healthy'
}

function scoreDebugTone(score: number) {
  if (score >= 75) return 'healthy'
  if (score >= 60) return 'caution'
  return 'danger'
}

function missionStatusDebugTone(status: MissionStatus) {
  if (status === 'ON_TARGET' || status === 'FINISH_PUSH') return 'healthy'
  if (status === 'CONSERVE') return 'caution'
  return 'danger'
}

function riskDebugTone(risk: RiskLevel) {
  if (risk === 'low') return 'healthy'
  if (risk === 'medium') return 'caution'
  return 'danger'
}

function swapDebugTone(
  urgency: ReturnType<typeof generatePredictiveStrategy>['swapAdvice']['urgency']
) {
  if (urgency === 'LOW') return 'healthy'
  if (urgency === 'MEDIUM') return 'caution'
  return 'danger'
}

function traileringDebugTone(
  action: ReturnType<typeof generatePredictiveStrategy>['routeIntelligence']['traileringOption']['action']
) {
  if (action === 'DRIVE') return 'healthy'
  if (action === 'CONSERVE_AND_DRIVE' || action === 'TRAILER_OPTIONAL') {
    return 'caution'
  }
  return 'danger'
}

function connectionDebugTone(
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
) {
  if (status === 'connected') return 'healthy'
  if (status === 'connecting' || status === 'disconnected') return 'caution'
  return 'danger'
}

function buildStrategyDebugSnapshot({
  missionStatus,
  raceHealth,
  strategy,
  telemetry,
  telemetrySource,
  telemetryStatus,
  connectionStatus,
  lastPacketAgeSeconds,
  effectiveStatusSource,
  packetStats,
  currentMile,
  remainingMiles,
  currentSegment,
  spareBatterySocPercent,
  elevationGain,
  elevationLoss,
  baselineRemainingEnergyWh,
}: {
  missionStatus: MissionStatus
  raceHealth: RaceHealth
  strategy: ReturnType<typeof generatePredictiveStrategy>
  telemetry: TelemetryData | null
  telemetrySource: TelemetrySource
  telemetryStatus: TelemetryConnectionStatus
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  lastPacketAgeSeconds?: number
  effectiveStatusSource: TelemetryEffectiveStatusSource
  packetStats: TelemetryPacketStats
  currentMile: number
  remainingMiles: number
  currentSegment: RouteSegment | null
  spareBatterySocPercent: number
  elevationGain: number
  elevationLoss: number
  baselineRemainingEnergyWh: number
}) {
  const breakdown = raceHealth.breakdown
  const trailering = strategy.routeIntelligence.traileringOption

  return [
    'STRATEGY DEBUG SNAPSHOT',
    `Generated: ${new Date().toISOString()}`,
    '',
    'MISSION STATUS',
    `Mission Status: ${missionStatus}`,
    `Race Health Score: ${raceHealth.score} / 100`,
    `Race Health Label: ${raceHealth.label}`,
    `Base Score: ${breakdown.baseScore}`,
    `Health Basis: ${breakdown.healthBasis}`,
    `Is Final Day: ${strategy.isFinalDay}`,
    `Active Reserve SOC: ${strategy.activeReserveSocPercent}%`,
    `Final Day Target Reserve SOC: ${strategy.finalDayTargetReserveSocPercent}%`,
    `Absolute Minimum SOC: ${strategy.absoluteMinimumSocPercent}%`,
    `Endgame Mode Active: ${strategy.endgameModeActive}`,
    `Primary Health SOC: ${breakdown.primaryHealthSocPercent.toFixed(1)}%`,
    `Secondary Forecast SOC: ${breakdown.secondaryForecastSocPercent.toFixed(1)}%`,
    `Health Margin: ${breakdown.socMarginPercent.toFixed(1)}%`,
    `SOC Margin Bonus: +${breakdown.socMarginBonus.toFixed(1)} (${breakdown.socMarginPercent.toFixed(1)}% margin)`,
    `Route Risk Penalty: -${breakdown.routeRiskPenalty} (${breakdown.highestRouteSeverity})`,
    `Next Opportunity Penalty: -${breakdown.nextOpportunityPenalty}`,
    `Full Day Energy Caution: -${breakdown.fullDayEnergyCautionPenalty}`,
    `Elevation Penalty Display: -${strategy.elevationSocCostPercent ? Math.min(12, Math.round(strategy.elevationSocCostPercent)) : 0}`,
    `Swap Penalty: -${breakdown.swapPenalty}`,
    `Trailering Penalty: -${breakdown.traileringPenalty}`,
    `Telemetry Penalty: -${breakdown.telemetryPenalty}`,
    `Final Score: ${breakdown.finalScore}`,
    '',
    'ENERGY MODEL',
    `Baseline Wh/mi: ${strategy.modelWhPerMile.toFixed(1)}`,
    `Raw Telemetry Wh/mi: ${strategy.rawTelemetryWhPerMile?.toFixed(1) ?? '--'}`,
    `Safe Strategy Wh/mi: ${strategy.safeStrategyWhPerMile.toFixed(1)}`,
    `Fallback Status: ${
      strategy.usingFallbackStrategyWhPerMile
        ? `Using fallback strategy Wh/mi${strategy.strategyWhPerMileFallbackReason ? `: ${strategy.strategyWhPerMileFallbackReason}` : ''}`
        : 'Live/model Wh/mi accepted'
    }`,
    `Current Mile: ${currentMile.toFixed(1)}`,
    `Remaining Miles: ${remainingMiles.toFixed(1)}`,
    `Baseline Remaining Energy Wh: ${baselineRemainingEnergyWh.toFixed(0)}`,
    '',
    'ELEVATION',
    `Elevation Adjusted: ${strategy.elevationAdjusted}`,
    `Elevation Gain: ${elevationGain.toFixed(0)} ft`,
    `Elevation Loss: ${elevationLoss.toFixed(0)} ft`,
    `Elevation Energy Wh: ${strategy.elevationEnergyWh?.toFixed(0) ?? '--'}`,
    `Elevation SOC Cost %: ${strategy.elevationSocCostPercent?.toFixed(1) ?? '--'}`,
    `Elevation Caps Applied: ${strategy.elevationWarnings?.some((warning) => warning.toLowerCase().includes('capped')) ? 'yes' : 'no'}`,
    `Elevation Warnings: ${strategy.elevationWarnings?.join(' | ') || 'none'}`,
    '',
    'ROUTE INTELLIGENCE',
    `Segment Risk: ${currentSegment?.risk ?? '--'}`,
    `Segment Type: ${currentSegment?.type ?? '--'}`,
    `Upcoming Risks Count: ${strategy.routeIntelligence.risks.length}`,
    `Upcoming Opportunities Count: ${strategy.routeIntelligence.opportunities.length}`,
    '',
    'BATTERY SWAP',
    `Swap Advisor Input SOC: ${strategy.swapAdvice.debug.swapAdvisorInputSoc.toFixed(1)}%`,
    `Swap Advisor Spare SOC: ${strategy.swapAdvice.debug.swapAdvisorInputSpareSoc.toFixed(1)}%`,
    `Estimated Wh To Next Operational Opportunity: ${strategy.swapAdvice.debug.estimatedWhToNextOperationalOpportunity.toFixed(0)}`,
    `Next Operational Opportunity Type: ${strategy.swapAdvice.debug.nextOperationalOpportunityType}`,
    `Next Operational Opportunity Mile: ${strategy.swapAdvice.debug.nextOperationalOpportunityMile.toFixed(1)}`,
    `Full Day Energy Wh Informational: ${strategy.swapAdvice.debug.estimatedWhToFinishDay.toFixed(0)}`,
    `Battery Capacity Wh: ${strategy.swapAdvice.debug.batteryCapacityWh.toFixed(0)}`,
    `Projected SOC At Next Opportunity: ${strategy.swapAdvice.debug.projectedSocAtNextOpportunity.toFixed(1)}%`,
    `Projected SOC At Finish Day Informational: ${strategy.swapAdvice.debug.projectedSocAtFinishDayInformational.toFixed(1)}%`,
    `Projected Continue SOC Raw: ${strategy.swapAdvice.debug.projectedContinueSocRaw.toFixed(1)}%`,
    `Projected Swap SOC Raw: ${strategy.swapAdvice.debug.projectedSwapSocRaw.toFixed(1)}%`,
    `Raw Telemetry SOC: ${formatPercent(strategy.rawTelemetrySocPercent)}`,
    `Safe Strategy SOC: ${formatPercent(strategy.safeStrategySocPercent)}`,
    `SOC Fallback Status: ${
      strategy.usingFallbackStrategySoc
        ? `Using fallback strategy SOC${strategy.strategySocFallbackReason ? `: ${strategy.strategySocFallbackReason}` : ''}`
        : 'Telemetry SOC accepted'
    }`,
    `Spare SOC: ${formatPercent(spareBatterySocPercent)}`,
    `Swap Action: ${strategy.swapAdvice.action}`,
    `Swap Urgency: ${strategy.swapAdvice.urgency}`,
    `Continue SOC: ${strategy.swapAdvice.projectedSocIfContinue.toFixed(1)}%`,
    `Swap SOC: ${strategy.swapAdvice.projectedSocAfterSwap.toFixed(1)}%`,
    `Reserve SOC: ${strategy.activeReserveSocPercent}%`,
    '',
    'TRAILERING',
    `Trailering Advice: ${trailering.action}`,
    `Estimated Energy Saved: ${trailering.estimatedEnergySavedWh.toFixed(0)} Wh`,
    `Estimated Mileage Penalty: ${trailering.mileagePenalty.toFixed(1)} mi`,
    '',
    'TELEMETRY',
    `Telemetry Source: ${telemetrySourceLabel(telemetrySource)}`,
    `Connection Status: ${connectionStatus}`,
    `Telemetry Status: ${telemetryStatus}`,
    `Telemetry Status Source: ${formatTelemetryStatusSource(effectiveStatusSource)}`,
    `Last Packet Age: ${lastPacketAgeSeconds !== undefined ? `${lastPacketAgeSeconds}s` : '--'}`,
    `${effectiveStatusSource === 'health' ? 'Client Polling Packets' : 'Packets Received'}: ${packetStats.packetsReceived}`,
    `${effectiveStatusSource === 'health' ? 'Client Polling PPM' : 'Packets Per Minute'}: ${packetStats.packetsPerMinute}`,
    `${effectiveStatusSource === 'health' ? 'Client Polling Avg Interval' : 'Average Update Interval'}: ${
      packetStats.averageUpdateIntervalSeconds !== null
        ? `${packetStats.averageUpdateIntervalSeconds.toFixed(1)}s`
        : '--'
    }`,
    `Packet Loss Estimate: ${
      effectiveStatusSource === 'health'
        ? 'N/A - using health endpoint'
        : packetStats.packetLossEstimatePercent !== null
        ? `${packetStats.packetLossEstimatePercent.toFixed(0)}%`
        : '--'
    }`,
    `Telemetry Penalty Applied: -${breakdown.telemetryPenalty}`,
  ].join('\n')
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

function preRaceChecklistStorageKey(day: number) {
  return `rx2-pre-race-checklist-day-${day}`
}

function readStoredPreRaceChecklist(day: number) {
  if (typeof window === 'undefined') return {}

  try {
    const stored = window.localStorage.getItem(preRaceChecklistStorageKey(day))

    if (!stored) return {}

    return normalizePreRaceChecklist(JSON.parse(stored))
  } catch {
    return {}
  }
}

function writeStoredPreRaceChecklist(
  day: number,
  checklist: Record<string, boolean>
) {
  window.localStorage.setItem(
    preRaceChecklistStorageKey(day),
    JSON.stringify(normalizePreRaceChecklist(checklist))
  )
}

function normalizePreRaceChecklist(value: unknown): Record<string, boolean> {
  if (typeof value !== 'object' || value === null) return {}

  return preRaceChecklistItems.reduce<Record<string, boolean>>((result, item) => {
    result[item] = Boolean((value as Record<string, unknown>)[item])
    return result
  }, {})
}

function countTelemetryWarnings(telemetry: TelemetryData) {
  const controllerTempC = telemetry.controllerTempC ?? 0
  const motorTempC = telemetry.motorTempC ?? 0
  const efficiencyWhPerMile = telemetry.efficiencyWhPerMile ?? telemetry.whPerMile ?? 0
  let warningsCount = 0

  if (controllerTempC > 85) warningsCount += 1
  if (motorTempC > 95) warningsCount += 1
  if (telemetry.batterySocPercent < 15) warningsCount += 1
  if (telemetry.batteryCurrent > 100) warningsCount += 1
  if (efficiencyWhPerMile > 140) warningsCount += 1

  return warningsCount
}

function swapAdviceSummary(
  swapAdvice?: ReturnType<typeof generatePredictiveStrategy>['swapAdvice']
) {
  if (!swapAdvice) return 'advisor unavailable'

  return `${swapAdvice.action} - ${swapAdvice.reason}`
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


