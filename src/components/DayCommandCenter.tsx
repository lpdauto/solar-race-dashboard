'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import CarSetupPanel from '@/components/CarSetupPanel'
import CloudTelemetryStatusCard from '@/components/CloudTelemetryStatusCard'
import CommandTile, { type CommandTileRisk } from '@/components/CommandTile'
import CourseMap from '@/components/CourseMap'
import ElevationProfile from '@/components/ElevationProfile'
import EnergySimulationPanel from '@/components/EnergySimulationPanel'
import ExpandablePanel from '@/components/ExpandablePanel'
import GpsStatusPanel from '@/components/GpsStatusPanel'
import OfflineReadinessPanel from '@/components/OfflineReadinessPanel'
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
import { useGeolocation } from '@/hooks/useGeolocation'
import { useRouteWeather } from '@/hooks/useRouteWeather'
import {
  useTelemetry,
  type TelemetryHistorySample,
} from '@/hooks/useTelemetry'
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
  buildAuthoritativeStrategyState,
  type AuthoritativeStrategyState,
  type MissionStatus,
  type RaceHealthSummary as RaceHealth,
} from '@/lib/authoritativeStrategyState'
import {
  type StrategyRecommendation as DeterministicStrategyRecommendation,
} from '@/lib/deterministicStrategyRecommendation'
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
import {
  createInitialRaceBatteryState,
  executeBatterySwap,
  setActivePack as setActiveRaceBatteryPack,
  setBatteryPackSoc,
  updateRaceBatteryStateFromTelemetry,
  type BatteryPackId,
  type RaceBatteryState,
  type SwapRecommendation as BatterySwapRecommendation,
} from '@/lib/raceBatteryStrategy'
import {
  buildRaceCaptainEnergyModel,
  buildTargetRows,
  formatSignedPercent,
  formatSwapAction,
} from '@/lib/raceCaptainEnergy'
import {
  type PredictionConfidence,
  type RacePrediction,
} from '@/lib/racePrediction'
import { generatePredictiveStrategy } from '@/lib/strategyEngine'
import { appendStrategyEventLogEntry } from '@/lib/strategyEventLog'
import {
  classifyVehicleNodeStatusFromAgeMs,
  vehicleNodeStatusLabel,
} from '@/lib/vehicleTelemetryStatus'
import type {
  CloudTelemetryHealth,
  CloudTelemetryPacketStatus,
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
type TelemetrySubview = 'vehicle' | 'mppt' | 'connections'

type PrototypeRole =
  | 'race-captain'
  | 'strategy'
  | 'navigation'
  | 'vehicle-systems'
  | 'operations'

type DayNavigationSection =
  | 'race-day'
  | 'mission-control'
  | 'telemetry'
  | 'setup'
  | 'reports'

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

const prototypeRoles: Array<{ id: PrototypeRole; label: string }> = [
  { id: 'race-captain', label: 'Race Captain' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'vehicle-systems', label: 'Vehicle Systems' },
  { id: 'operations', label: 'Operations' },
]

export default function DayCommandCenter({ raceDay }: DayCommandCenterProps) {
  const searchParams = useSearchParams()
  const [currentMile, setCurrentMile] = useState(0)
  const [manualMode, setManualMode] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('driver')
  const [prototypeRole, setPrototypeRole] =
    useState<PrototypeRole>('race-captain')
  const [mobileMapExpanded, setMobileMapExpanded] = useState(false)
  const [telemetrySubview, setTelemetrySubview] =
    useState<TelemetrySubview>('vehicle')
  const [activeTile, setActiveTile] = useState<TileId | null>(null)
  const [segmentTypeFilter, setSegmentTypeFilter] = useState<'all' | SegmentType>('all')
  const [segmentRiskFilter, setSegmentRiskFilter] = useState<'all' | RiskLevel>('all')
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(true)
  const [carSetup, setCarSetup] = useState<CarSetup>(defaultCarSetup)
  const [raceBatteryState, setRaceBatteryState] = useState<RaceBatteryState>(() =>
    createInitialRaceBatteryState()
  )
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
  const geolocation = useGeolocation()
  const queryView = searchParams.get('view')
  const queryNode = searchParams.get('node')
  const navigationQuery = searchParams.toString()
  const activeNavigationSection = navigationSectionFromView(
    queryView,
    prototypeRole
  )
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
  const authoritativeStrategy = useMemo(
    () =>
      buildAuthoritativeStrategyState({
        raceDay,
        currentMile,
        currentSegment,
        telemetry: telemetryController.telemetry,
        telemetryHistory: telemetryController.telemetryHistory,
        telemetryTimestampMs: telemetryController.effectiveLastPacketAt,
        telemetryAgeSeconds: telemetryController.effectivePacketAgeSeconds,
        telemetrySource: telemetryController.source,
        telemetryStatus: telemetryController.effectiveStatus,
        connectionStatus: telemetryController.effectiveConnectionStatus,
        raceBatteryState,
        isTraileringActive: Boolean(activeTraileringSession),
      }),
    [
      activeTraileringSession,
      currentMile,
      currentSegment,
      raceBatteryState,
      raceDay,
      telemetryController.effectiveConnectionStatus,
      telemetryController.effectiveLastPacketAt,
      telemetryController.effectivePacketAgeSeconds,
      telemetryController.effectiveStatus,
      telemetryController.source,
      telemetryController.telemetry,
      telemetryController.telemetryHistory,
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

  const missionStatus = authoritativeStrategy.missionStatus
  const raceHealth = authoritativeStrategy.raceHealth

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
    authoritativeStrategy,
    weatherRisk: weather.strategySummary.weatherRisk,
    weatherSpeedAdjustment: weather.strategySummary.recommendedSpeedAdjustmentMph,
    weatherSource: weather.sourceSummary,
    elevationGain: elevationStats.totalGain,
    isTraileringActive: Boolean(activeTraileringSession),
    traileredMilesToday,
    countingMilesToday,
  }).filter((tile) => viewMode === 'chase' || driverTileIds.has(tile.id))
  const raceCaptainAlerts = [
    nextWarning
      ? `Mile ${nextWarning.mileStart}: ${nextWarning.title} (${nextWarning.risk})`
      : '',
    weather.strategySummary.weatherRisk === 'high' ||
    weather.strategySummary.weatherRisk === 'severe'
      ? `Weather risk is ${weather.strategySummary.weatherRisk}.`
      : '',
    telemetryController.effectiveStatus === 'error' ||
    telemetryController.effectiveStatus === 'disconnected'
      ? `Telemetry is ${telemetryController.effectiveStatus}.`
      : '',
    ...authoritativeStrategy.alerts,
  ].filter(Boolean)
  const upcomingRiskCount = sortedSegments.filter(
    (segment) =>
      segment.mileStart > currentMile &&
      (segment.risk === 'high' ||
        segment.risk === 'severe' ||
        segment.type === 'caution' ||
        segment.type === 'town' ||
        segment.type === 'stop')
  ).length
  const upcomingOpportunityCount =
    authoritativeStrategy.routeIntelligence.opportunities.length
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
    const nextRole = roleFromNavigationParams(
      searchParams.get('view'),
      searchParams.get('role')
    )

    if (nextRole) {
      setPrototypeRole((currentRole) =>
        nextRole === currentRole ? currentRole : nextRole
      )
    }

    const nextNode = searchParams.get('node') as TelemetryNodeId | null

    if (nextNode && nextNode !== telemetryController.cloudNode) {
      telemetryController.setCloudNode(nextNode)
    }
  }, [navigationQuery, searchParams, telemetryController.cloudNode, telemetryController.setCloudNode])

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

    setRaceBatteryState((currentState) =>
      updateRaceBatteryStateFromTelemetry({
        state: currentState,
        telemetry: telemetryController.telemetry as TelemetryData,
        timestampMs: telemetryEnergyTimestamp(
          telemetryController.telemetry as TelemetryData,
          telemetryController.effectiveLastPacketAt
        ),
      })
    )
  }, [telemetryController.effectiveLastPacketAt, telemetryController.telemetry])

  useEffect(() => {
    if (!telemetryController.telemetry) return

    const snapshot = createRaceSnapshot({
      telemetry: telemetryController.telemetry,
      telemetrySource: telemetryController.source,
      currentDay: raceDay.day,
      currentMile,
      strategyState: authoritativeStrategy,
      warningsCount: countTelemetryWarnings(telemetryController.telemetry),
    })

    setSnapshots((currentSnapshots) =>
      trimSnapshotHistory([...currentSnapshots, snapshot])
    )
  }, [
    authoritativeStrategy,
    currentMile,
    raceDay.day,
    telemetryController.source,
    telemetryController.telemetry,
  ])

  function handleSetActiveBatteryPack(packId: BatteryPackId) {
    setRaceBatteryState((currentState) =>
      setActiveRaceBatteryPack(currentState, packId)
    )
  }

  function handleSetBatteryPackSoc(packId: BatteryPackId, socPercent: number) {
    setRaceBatteryState((currentState) =>
      setBatteryPackSoc({
        state: currentState,
        packId,
        socPercent,
      })
    )
  }

  function handleExecuteBatterySwap() {
    setRaceBatteryState((currentState) => executeBatterySwap(currentState))
  }

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
        note: `Battery swap logged manually. Current advisor action: ${authoritativeStrategy.swapRecommendation.action}.`,
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

  const showLegacyFullCommandCenter = false

  return (
    <main className="min-h-screen px-2 pb-3 text-slate-100 sm:px-6 sm:pb-6 lg:px-8">
      <div className="sticky top-12 z-40 -mx-2 border-b border-white/10 bg-slate-950/95 px-2 py-2 backdrop-blur sm:-mx-6 sm:px-6 sm:py-3 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
              Local UX Prototype
            </p>
            <h1 className="mt-0.5 text-base font-black text-white sm:mt-1 sm:text-lg">
              {prototypeRoleLabel(prototypeRole)} View
            </h1>
          </div>
          <RoleSelector role={prototypeRole} onRoleChange={setPrototypeRole} />
        </div>
      </div>

      <div className="mx-auto mt-2 grid max-w-7xl gap-2 sm:mt-4 sm:gap-4">
        <NavigationContextBar
          section={activeNavigationSection}
          raceDay={raceDay}
          role={prototypeRole}
          node={(queryNode as TelemetryNodeId | null) ?? telemetryController.cloudNode}
          searchParams={searchParams}
        />

        {prototypeRole === 'race-captain' ? (
          <>
            <MobileRaceCaptainPanel
              recommendedSpeedMph={authoritativeStrategy.recommendedSpeedMph}
              missionStatus={missionStatus}
              currentSocPercent={telemetryController.telemetry?.batterySocPercent}
              nextCriticalEvent={nextImportantSegment}
              alerts={raceCaptainAlerts}
              raceHealth={raceHealth}
              driverAction={authoritativeStrategy.strategyRecommendation.reason}
            />
            <section className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-6">
              <CommandMetric
                label="Recommended Speed"
                value={formatSpeed(authoritativeStrategy.recommendedSpeedMph)}
                detail={authoritativeStrategy.strategyRecommendation.reason}
              />
              <CommandMetric
                label="Mission Status"
                value={formatMissionStatus(missionStatus)}
              />
              <CommandMetric
                label="Current SOC"
                value={formatPercent(telemetryController.telemetry?.batterySocPercent)}
              />
              <CommandMetric
                label="Next Critical Event"
                value={nextImportantSegment?.title ?? 'Clear'}
                detail={
                  nextImportantSegment
                    ? `Mile ${nextImportantSegment.mileStart}: ${nextImportantSegment.strategy}`
                    : 'No critical route event in the current lookahead.'
                }
              />
              <CommandMetric
                label="Alerts"
                value={raceCaptainAlerts.length ? String(raceCaptainAlerts.length) : 'Clear'}
              />
              <CommandMetric
                label="Race Health"
                value={`${raceHealth.score} / 100`}
                detail={raceHealth.label}
              />
            </section>
            <div className="hidden md:block">
              <MissionStatusBanner status={missionStatus} raceHealth={raceHealth} />
            </div>
            <div className="hidden md:block">
              <RaceCaptainEnergyCommandCenter
                raceDay={raceDay}
                currentMile={currentMile}
                distanceRemaining={distanceRemaining}
                telemetry={telemetryController.telemetry}
                telemetryAgeSeconds={telemetryController.effectivePacketAgeSeconds}
                telemetryHistory={telemetryController.telemetryHistory}
                raceBatteryState={raceBatteryState}
                authoritativeStrategy={authoritativeStrategy}
                raceHealth={raceHealth}
                onSetActivePack={handleSetActiveBatteryPack}
                onSetPackSoc={handleSetBatteryPackSoc}
                onExecuteSwap={handleExecuteBatterySwap}
                energySimulation={energySimulation}
                carSetup={carSetup}
                activeTraileringSession={Boolean(activeTraileringSession)}
              />
            </div>
            <div className="hidden md:block">
              <MiniPanel title="Alerts">
              {raceCaptainAlerts.length > 0 ? (
                <div className="grid gap-2">
                  {raceCaptainAlerts.map((alert) => (
                    <p
                      key={alert}
                      className="rounded-md border border-yellow-300/30 bg-yellow-300/10 p-3 text-sm font-semibold text-yellow-100"
                    >
                      {alert}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-slate-400">
                  No active race captain alerts.
                </p>
              )}
              </MiniPanel>
            </div>
          </>
        ) : null}

        {prototypeRole === 'strategy' ? (
          <>
            <MissionStatusBanner status={missionStatus} raceHealth={raceHealth} />
            <StrategyEngineeringCenter
              raceDay={raceDay}
              currentMile={currentMile}
              distanceRemaining={distanceRemaining}
              telemetry={telemetryController.telemetry}
              telemetryAgeSeconds={telemetryController.effectivePacketAgeSeconds}
              telemetryHistory={telemetryController.telemetryHistory}
              raceBatteryState={raceBatteryState}
              authoritativeStrategy={authoritativeStrategy}
              onSetActivePack={handleSetActiveBatteryPack}
              onSetPackSoc={handleSetBatteryPackSoc}
              onExecuteSwap={handleExecuteBatterySwap}
              energySimulation={energySimulation}
              carSetup={carSetup}
              activeTraileringSession={Boolean(activeTraileringSession)}
            />
            <section className="grid gap-3 lg:grid-cols-2">
              <UpcomingRisksPanel
                segments={sortedSegments}
                currentMile={currentMile}
              />
              <UpcomingOpportunitiesPanel
                opportunities={authoritativeStrategy.routeIntelligence.opportunities}
              />
            </section>
            <WeatherWindPanel
              dayNumber={raceDay.day}
              routePoints={raceDay.routePoints}
              currentMile={currentMile}
              currentRaceSpeedMph={telemetryController.telemetry?.speedMph}
            />
            <section className="grid gap-4 lg:grid-cols-2">
              <MiniPanel title="Swap Advisor">
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatusMetric
                    label="Action"
                    value={formatSwapPlannerAction(authoritativeStrategy.swapRecommendation.action)}
                  />
                  <StatusMetric
                    label="Confidence"
                    value={authoritativeStrategy.swapRecommendation.confidence}
                  />
                  <StatusMetric
                    label="Next Stop SOC"
                    value={formatPredictionSoc(authoritativeStrategy.swapRecommendation.projectedNextStopSocPercent)}
                  />
                  <StatusMetric
                    label="End-Day SOC"
                    value={formatPredictionSoc(authoritativeStrategy.swapRecommendation.projectedEndDaySocPercent)}
                  />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {authoritativeStrategy.swapRecommendation.reason}
                </p>
              </MiniPanel>
              <MiniPanel title="Trailering">
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatusMetric
                    label="Action"
                    value={authoritativeStrategy.traileringRecommendation?.action ?? 'DRIVE'}
                  />
                  <StatusMetric
                    label="Energy Saved"
                    value={formatEnergyWh(authoritativeStrategy.traileringRecommendation?.estimatedEnergySavedWh)}
                  />
                  <StatusMetric
                    label="Mileage Penalty"
                    value={
                      authoritativeStrategy.traileringRecommendation
                        ? `${authoritativeStrategy.traileringRecommendation.mileagePenalty.toFixed(1)} mi`
                        : '--'
                    }
                  />
                  <StatusMetric
                    label="Active"
                    value={activeTraileringSession ? 'yes' : 'no'}
                  />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {authoritativeStrategy.traileringRecommendation?.reason ?? 'Drive the current route section.'}
                </p>
              </MiniPanel>
            </section>
            <AccordionSection title="Energy Forecast">
              <EnergySimulationPanel raceDay={raceDay} />
            </AccordionSection>
            <AccordionSection title="Strategy Debug" lazy>
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
                packetStats={telemetryController.effectivePacketStats}
                currentMile={currentMile}
                remainingMiles={distanceRemaining}
                currentSegment={currentSegment ?? null}
                spareBatterySocPercent={carSetup.spareBatterySocPercent}
                elevationGain={elevationStats.totalGain}
                elevationLoss={elevationStats.totalLoss}
              />
            </AccordionSection>
          </>
        ) : null}

        {prototypeRole === 'navigation' ? (
          <>
            <MobileNavigationPanel
              currentSegment={currentSegment ?? null}
              nextEvent={nextImportantSegment}
              distanceRemaining={distanceRemaining}
            />
            <section className="hidden overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] shadow-xl shadow-black/20 md:block">
              <CourseMap
                days={raceRoute}
                currentDayNumber={raceDay.day}
                currentMile={currentMile}
                heightClass="h-[420px] md:h-[620px]"
                showRiskAnnotations={false}
              />
            </section>
            <section className="grid gap-2 rounded-lg border border-white/10 bg-black/20 p-2 md:hidden">
              <button
                type="button"
                onClick={() => setMobileMapExpanded((isExpanded) => !isExpanded)}
                className="h-9 rounded-md border border-[#ff3ea5]/35 bg-[#ff3ea5]/10 px-3 text-sm font-bold text-[#ff8fcb] transition hover:bg-[#ff3ea5]/15"
              >
                {mobileMapExpanded ? 'Hide Map' : 'Show Map'}
              </button>
              {mobileMapExpanded ? (
                <div className="overflow-hidden rounded-md border border-white/10">
                  <CourseMap
                    days={raceRoute}
                    currentDayNumber={raceDay.day}
                    currentMile={currentMile}
                    heightClass="h-[360px]"
                    showRiskAnnotations={false}
                  />
                </div>
              ) : null}
            </section>
            <div className="hidden md:block">
              <NavigationFactsPanel
                currentSegment={currentSegment ?? null}
                nextEvent={nextImportantSegment}
                distanceRemaining={distanceRemaining}
                currentSpeedMph={telemetryController.telemetry?.speedMph}
              />
            </div>
            <WeatherWindPanel
              dayNumber={raceDay.day}
              routePoints={raceDay.routePoints}
              currentMile={currentMile}
              currentRaceSpeedMph={telemetryController.telemetry?.speedMph}
              mode="facts"
            />
          </>
        ) : null}

        {prototypeRole === 'vehicle-systems' ? (
          <>
            <TelemetrySubviewSelector
              activeSubview={telemetrySubview}
              onSubviewChange={setTelemetrySubview}
            />
            {telemetrySubview === 'vehicle' ? (
              <>
                <MobileTelemetryCards
                  telemetry={telemetryController.telemetry}
                  connectionStatus={telemetryController.effectiveConnectionStatus}
                />
                <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                  <div className="hidden md:block">
                    <VehicleCard telemetry={telemetryController.telemetry} />
                  </div>
                  <div className="hidden md:block">
                    <MiniPanel title="Temps">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <StatusMetric
                        label="Battery"
                        value={formatTemperatureF(telemetryController.telemetry?.batteryTempC)}
                      />
                      <StatusMetric
                        label="Controller"
                        value={formatTemperatureF(telemetryController.telemetry?.controllerTempC)}
                      />
                      <StatusMetric
                        label="Motor"
                        value={formatTemperatureF(telemetryController.telemetry?.motorTempC)}
                      />
                    </div>
                    </MiniPanel>
                  </div>
                </section>
                <MiniPanel title="Telemetry Status">
                  <CloudTelemetryStatusCard
                    enabled={telemetryController.source === 'cloud'}
                    node={telemetryController.cloudNode}
                    connectionStatus={telemetryController.effectiveConnectionStatus}
                    lastPacketAt={telemetryController.effectiveLastPacketAt}
                  />
                </MiniPanel>
              </>
            ) : null}
            {telemetrySubview === 'mppt' ? (
              <MpptLivePanel
                telemetry={telemetryController.telemetry}
                telemetryHistory={telemetryController.telemetryHistory}
                carSetup={carSetup}
              />
            ) : null}
            {telemetrySubview === 'connections' ? (
              <section className="grid gap-4">
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
                  showDevelopmentSources={carSetup.appProfile === 'owner'}
                />
                <ConnectionStatusPanel
                  telemetry={telemetryController.telemetry}
                  telemetryHistory={telemetryController.telemetryHistory}
                  telemetryStatus={telemetryController.effectiveStatus}
                  connectionStatus={telemetryController.effectiveConnectionStatus}
                  lastPacketAt={telemetryController.effectiveLastPacketAt}
                  packetAgeSeconds={telemetryController.effectivePacketAgeSeconds}
                  packetStats={telemetryController.effectivePacketStats}
                  cloudPacketStatus={telemetryController.cloudPacketStatus}
                  source={telemetryController.source}
                  cloudNode={telemetryController.cloudNode}
                  cloudHealth={telemetryController.cloudHealth}
                  geolocation={geolocation}
                />
              </section>
            ) : null}
          </>
        ) : null}

        {prototypeRole === 'operations' ? (
          <>
            <AccordionSection title="Setup" lazy>
              <div className="grid gap-4">
                <CarSetupPanel />
              </div>
            </AccordionSection>
            <AccordionSection title="Reports" lazy>
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
            <AccordionSection title="Battery Logistics">
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
            <AccordionSection title="Operational Checklists">
              <PreRaceChecklist
                checklist={preRaceChecklist}
                onItemChange={updatePreRaceChecklistItem}
                onReset={resetPreRaceChecklist}
              />
            </AccordionSection>
          </>
        ) : null}

        {showLegacyFullCommandCenter ? (
          <>
        <MissionStatusBanner status={missionStatus} raceHealth={raceHealth} />

        <RaceCommandCard
          raceDay={raceDay}
          authoritativeStrategy={authoritativeStrategy}
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
                opportunities={authoritativeStrategy.routeIntelligence.opportunities}
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
          <div className="grid gap-4">
            <CarSetupPanel />
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
              packetStats={telemetryController.effectivePacketStats}
              currentMile={currentMile}
              remainingMiles={distanceRemaining}
              currentSegment={currentSegment ?? null}
              spareBatterySocPercent={carSetup.spareBatterySocPercent}
              elevationGain={elevationStats.totalGain}
              elevationLoss={elevationStats.totalLoss}
            />
          </AccordionSection>
        ) : null}
          </>
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

function NavigationContextBar({
  section,
  raceDay,
  role,
  node,
  searchParams,
}: {
  section: DayNavigationSection
  raceDay: RaceDay
  role: PrototypeRole
  node: TelemetryNodeId
  searchParams: ReturnType<typeof useSearchParams>
}) {
  const previousDay = raceDay.day - 1
  const nextDay = raceDay.day + 1
  const previousDisabled = previousDay < 1
  const nextDisabled = nextDay > 5

  return (
    <section className="grid gap-2 rounded-lg border border-white/10 bg-black/25 p-2 sm:grid-cols-[1fr_auto] sm:items-center sm:p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-white">
          {breadcrumbLabel(section, role, node)}
        </p>
        <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">
          🏁 Race Day &gt; Day {raceDay.day}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:min-w-72">
        {previousDisabled ? (
          <span className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-sm font-bold text-slate-500">
            ← Previous
          </span>
        ) : (
          <Link
            href={dayNavigationHref(previousDay, searchParams)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-center text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10"
          >
            ← Day {previousDay}
          </Link>
        )}

        {nextDisabled ? (
          <span className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-sm font-bold text-slate-500">
            Next →
          </span>
        ) : (
          <Link
            href={dayNavigationHref(nextDay, searchParams)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-center text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10"
          >
            Day {nextDay} →
          </Link>
        )}
      </div>
    </section>
  )
}

function MobileRaceCaptainPanel({
  recommendedSpeedMph,
  missionStatus,
  currentSocPercent,
  nextCriticalEvent,
  alerts,
  raceHealth,
  driverAction,
}: {
  recommendedSpeedMph?: number
  missionStatus: MissionStatus
  currentSocPercent?: number
  nextCriticalEvent: RouteSegment | null
  alerts: string[]
  raceHealth: RaceHealth
  driverAction: string
}) {
  return (
    <section className="grid gap-2 rounded-lg border border-[#ff3ea5]/30 bg-[#ff3ea5]/10 p-3 md:hidden">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff8fcb]">
            Speed
          </p>
          <p className="text-4xl font-black leading-none text-white">
            {recommendedSpeedMph ?? '--'}
            <span className="ml-1 text-base text-slate-300">mph</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black leading-tight text-white">
            {formatMissionStatus(missionStatus)}
          </p>
          <p className="text-sm font-black text-[#ff8fcb]">
            {raceHealth.score} / 100
          </p>
        </div>
      </div>
      <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-200">
        {driverAction}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <CompactMetric label="SOC" value={formatPercent(currentSocPercent)} />
        <CompactMetric
          label="Next"
          value={nextCriticalEvent?.title ?? 'Clear'}
          detail={
            nextCriticalEvent
              ? `Mile ${nextCriticalEvent.mileStart}`
              : 'No critical event'
          }
        />
        <CompactMetric
          label="Alerts"
          value={alerts.length ? String(alerts.length) : 'Clear'}
          detail={alerts[0] ?? 'No active alerts'}
        />
        <CompactMetric label="Health" value={`${raceHealth.score} / 100`} />
      </div>
    </section>
  )
}

function MobileNavigationPanel({
  currentSegment,
  nextEvent,
  distanceRemaining,
}: {
  currentSegment: RouteSegment | null
  nextEvent: RouteSegment | null
  distanceRemaining: number
}) {
  return (
    <section className="grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3 md:hidden">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff8fcb]">
            Segment
          </p>
          <p className="text-base font-black leading-tight text-white">
            {currentSegment?.title ?? 'Ready'}
          </p>
        </div>
        <p className="text-right text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
          Route facts
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CompactMetric
          label="Next"
          value={nextEvent?.title ?? 'Clear'}
          detail={nextEvent ? `Mile ${nextEvent.mileStart}` : 'No event'}
        />
        <CompactMetric
          label="Remaining"
          value={`${distanceRemaining.toFixed(1)} mi`}
        />
        <CompactMetric
          label="Segment Miles"
          value={
            currentSegment
              ? `${currentSegment.mileStart}-${currentSegment.mileEnd}`
              : '--'
          }
        />
      </div>
    </section>
  )
}

function NavigationFactsPanel({
  currentSegment,
  nextEvent,
  distanceRemaining,
  currentSpeedMph,
}: {
  currentSegment: RouteSegment | null
  nextEvent: RouteSegment | null
  distanceRemaining: number
  currentSpeedMph?: number
}) {
  const nextDistance =
    nextEvent !== null && currentSegment !== null
      ? Math.max(0, nextEvent.mileStart - currentSegment.mileStart)
      : undefined

  return (
    <MiniPanel title="Route Facts">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusMetric
          label="Current Segment"
          value={
            currentSegment
              ? `${currentSegment.title} (${currentSegment.mileStart}-${currentSegment.mileEnd})`
              : 'No segment'
          }
        />
        <StatusMetric
          label="Next Event"
          value={nextEvent ? `${nextEvent.title} (${nextEvent.mileStart})` : 'Clear'}
        />
        <StatusMetric
          label="Remaining Route"
          value={`${distanceRemaining.toFixed(1)} mi`}
        />
        <StatusMetric
          label="Current Speed"
          value={formatSpeed(currentSpeedMph)}
        />
        <StatusMetric
          label="Segment Type"
          value={currentSegment?.type ?? '--'}
        />
        <StatusMetric
          label="Segment Distance"
          value={
            currentSegment
              ? `${Math.max(0, currentSegment.mileEnd - currentSegment.mileStart).toFixed(1)} mi`
              : '--'
          }
        />
        <StatusMetric
          label="Distance to Next Event"
          value={nextDistance !== undefined ? `${nextDistance.toFixed(1)} mi` : '--'}
        />
      </div>
    </MiniPanel>
  )
}

function MobileTelemetryCards({
  telemetry,
  connectionStatus,
}: {
  telemetry: TelemetryData | null
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
}) {
  return (
    <section className="grid gap-2 md:hidden">
      <div className="grid grid-cols-2 gap-2">
        <CompactMetric label="SOC" value={formatPercent(telemetry?.batterySocPercent)} />
        <CompactMetric
          label="Speed"
          value={formatSpeed(telemetry?.speedMph)}
        />
        <CompactMetric
          label="Voltage"
          value={
            telemetry?.batteryVoltage !== undefined
              ? `${telemetry.batteryVoltage.toFixed(1)} V`
              : '--'
          }
        />
        <CompactMetric
          label="Current"
          value={
            telemetry?.batteryCurrent !== undefined
              ? `${telemetry.batteryCurrent.toFixed(1)} A`
              : '--'
          }
        />
        <CompactMetric
          label="Motor Temp"
          value={formatTemperatureF(telemetry?.motorTempC)}
        />
        <CompactMetric
          label="Controller"
          value={formatTemperatureF(telemetry?.controllerTempC)}
        />
      </div>
      <CompactMetric label="Telemetry" value={connectionStatus} />
    </section>
  )
}

function CompactMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-black/30 p-2">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#ff8fcb]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-base font-black leading-tight text-white">
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

function RoleSelector({
  role,
  onRoleChange,
}: {
  role: PrototypeRole
  onRoleChange: (role: PrototypeRole) => void
}) {
  return (
    <label className="grid gap-1 sm:min-w-72">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        Role
      </span>
      <select
        value={role}
        onChange={(event) => onRoleChange(event.target.value as PrototypeRole)}
        className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-[#ff3ea5]/60"
      >
        {prototypeRoles.map((prototypeRoleOption) => (
          <option key={prototypeRoleOption.id} value={prototypeRoleOption.id}>
            {prototypeRoleOption.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function prototypeRoleLabel(role: PrototypeRole) {
  return (
    prototypeRoles.find((prototypeRoleOption) => prototypeRoleOption.id === role)
      ?.label ?? 'Race Captain'
  )
}

function roleFromNavigationParams(
  view: string | null,
  role: string | null
): PrototypeRole | null {
  if (view === 'race-day') return 'navigation'
  if (view === 'telemetry') return 'vehicle-systems'
  if (view === 'setup' || view === 'reports') return 'operations'
  if (view !== 'mission-control') return null

  return isPrototypeRole(role) ? role : 'race-captain'
}

function isPrototypeRole(role: string | null): role is PrototypeRole {
  return prototypeRoles.some(
    (prototypeRoleOption) => prototypeRoleOption.id === role
  )
}

function navigationSectionFromView(
  view: string | null,
  role: PrototypeRole
): DayNavigationSection {
  if (
    view === 'race-day' ||
    view === 'mission-control' ||
    view === 'telemetry' ||
    view === 'setup' ||
    view === 'reports'
  ) {
    return view
  }

  if (role === 'navigation') return 'race-day'
  if (role === 'vehicle-systems') return 'telemetry'
  if (role === 'operations') return 'setup'

  return 'mission-control'
}

function breadcrumbLabel(
  section: DayNavigationSection,
  role: PrototypeRole,
  node: TelemetryNodeId
) {
  if (section === 'race-day') return '🏁 Race Day'
  if (section === 'telemetry') return `⚡ Telemetry > ${telemetryNodeLabel(node)}`
  if (section === 'setup') return '⚙️ Setup'
  if (section === 'reports') return '📄 Reports'

  return `📊 Mission Control > ${prototypeRoleLabel(role)}`
}

function dayNavigationHref(
  day: number,
  searchParams: ReturnType<typeof useSearchParams>
) {
  const query = searchParams.toString()

  return `/day/${day}${query ? `?${query}` : ''}`
}

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
  authoritativeStrategy,
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
  authoritativeStrategy: AuthoritativeStrategyState
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
      : authoritativeStrategy.recommendedSpeedMph ?? rx2Config.defaultTargetSpeedMph
  const recommendedSpeed =
    authoritativeStrategy.recommendedSpeedMph ?? rx2Config.defaultTargetSpeedMph
  const speedDelta = currentSpeed - recommendedSpeed
  const paceStatus = getPaceStatus({
    speedDelta,
    projectedFinishSoc:
      authoritativeStrategy.projectedEndDaySocPercent ??
      authoritativeStrategy.prediction.currentSocPercent,
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
        { label: 'Target', value: `${recommendedSpeed} mph` },
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
      title: 'Strategy',
      mainValue: String(recommendedSpeed),
      mainUnit: 'mph',
      supportingItems: [
        { label: 'Command', value: authoritativeStrategy.strategyRecommendation.title },
        { label: 'End-Day SOC', value: formatPredictionSoc(authoritativeStrategy.projectedEndDaySocPercent) },
        { label: 'Trailering', value: isTraileringActive ? 'active' : authoritativeStrategy.traileringRecommendation?.action ?? 'DRIVE' },
      ],
      statusLabel: authoritativeStrategy.strategyRecommendation.command,
      riskLevel:
        authoritativeStrategy.strategyRecommendation.severity === 'urgent'
          ? 'severe'
          : authoritativeStrategy.strategyRecommendation.severity === 'caution'
            ? 'high'
            : 'low',
      actionText: authoritativeStrategy.strategyRecommendation.reason,
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

const nativeInfo = '#38bdf8'

const solarTrendPoints = [
  { x: 0, y: 77 },
  { x: 10, y: 64 },
  { x: 20, y: 43 },
  { x: 30, y: 31 },
  { x: 40, y: 22 },
  { x: 52, y: 28 },
  { x: 62, y: 20 },
  { x: 74, y: 31 },
  { x: 86, y: 50 },
  { x: 100, y: 72 },
]

function SimulatedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded border border-[#ff3ea5]/30 bg-[#ff3ea5]/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#ff8fcb] ${className}`}
    >
      Simulated
    </span>
  )
}

function EstimatedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded border border-sky-300/30 bg-sky-300/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-sky-200 ${className}`}
    >
      Estimated
    </span>
  )
}

function RaceCaptainEnergyCommandCenter({
  raceDay,
  currentMile,
  distanceRemaining,
  telemetry,
  telemetryAgeSeconds,
  telemetryHistory,
  raceBatteryState,
  authoritativeStrategy,
  raceHealth,
  onSetActivePack,
  onSetPackSoc,
  onExecuteSwap,
  energySimulation,
  carSetup,
  activeTraileringSession,
}: {
  raceDay: RaceDay
  currentMile: number
  distanceRemaining: number
  telemetry: TelemetryData | null
  telemetryAgeSeconds?: number
  telemetryHistory: TelemetryHistorySample[]
  raceBatteryState: RaceBatteryState
  authoritativeStrategy: AuthoritativeStrategyState
  raceHealth: RaceHealth
  onSetActivePack: (packId: BatteryPackId) => void
  onSetPackSoc: (packId: BatteryPackId, socPercent: number) => void
  onExecuteSwap: () => void
  energySimulation: ReturnType<typeof simulateDayEnergy>
  carSetup: CarSetup
  activeTraileringSession: boolean
}) {
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const racePrediction = authoritativeStrategy.prediction
  const batterySwapRecommendation = authoritativeStrategy.swapRecommendation
  const deterministicStrategyRecommendation =
    authoritativeStrategy.strategyRecommendation
  const traileringOption = authoritativeStrategy.traileringRecommendation
  const energyModel = buildRaceCaptainEnergyModel({
    raceDay,
    currentMile,
    distanceRemaining,
    telemetry,
    telemetryHistory,
    energySimulation,
    authoritativeStrategy,
    carSetup,
    now: currentTime,
  })
  const strategyLogStateRef = useRef<{
    command?: DeterministicStrategyRecommendation['command']
    confidence?: DeterministicStrategyRecommendation['confidence']
    swapAction?: BatterySwapRecommendation['action']
    stale?: boolean
  }>({})
  const {
    currentSocPercent,
    currentSocIsSimulated,
    activeBatteryKwh,
    reserveBatterySocPercent,
    reserveBatteryKwh,
    combinedEnergyKwh,
    combinedInventoryPercent,
    currentWhPerMile,
    requiredWhPerMile,
    currentWhIsSimulated,
    rollingWhPerMile,
    solarInputWatts,
    solarInputIsSimulated,
    solarInputIsEstimated,
    solarCapturedKwh,
    solarCapturedIsEstimated,
    solarCapturedUnavailable,
    energyUsedKwh,
    solarOffsetPercent,
    netEnergyLossKwh,
    nextStopDistance,
    projectedArrivalSoc,
    projectedFinishSoc,
    projectedFinishLabel,
    routeSocPoints,
    upcomingTimelineSegments,
    timeToSunset,
  } = energyModel

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 60_000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const previous = strategyLogStateRef.current
    const stale = (telemetryAgeSeconds ?? 0) > 10
    const timestamp = currentTime.getTime()

    if (previous.command && previous.command !== deterministicStrategyRecommendation.command) {
      appendStrategyEventLogEntry({
        timestamp,
        type: 'command_changed',
        detail: `Strategy command changed from ${previous.command} to ${deterministicStrategyRecommendation.command}.`,
        command: deterministicStrategyRecommendation.command,
        confidence: deterministicStrategyRecommendation.confidence,
        swapAction: batterySwapRecommendation.action,
      })
    }

    if (previous.confidence && previous.confidence !== deterministicStrategyRecommendation.confidence) {
      appendStrategyEventLogEntry({
        timestamp,
        type: 'confidence_changed',
        detail: `Strategy confidence changed from ${previous.confidence} to ${deterministicStrategyRecommendation.confidence}.`,
        command: deterministicStrategyRecommendation.command,
        confidence: deterministicStrategyRecommendation.confidence,
        swapAction: batterySwapRecommendation.action,
      })
    }

    if (previous.swapAction && previous.swapAction !== batterySwapRecommendation.action) {
      appendStrategyEventLogEntry({
        timestamp,
        type: 'swap_recommendation_changed',
        detail: `Swap recommendation changed from ${previous.swapAction} to ${batterySwapRecommendation.action}.`,
        command: deterministicStrategyRecommendation.command,
        confidence: deterministicStrategyRecommendation.confidence,
        swapAction: batterySwapRecommendation.action,
      })
    }

    if (previous.stale === false && stale) {
      appendStrategyEventLogEntry({
        timestamp,
        type: 'stale_telemetry_started',
        detail: 'Telemetry became stale.',
        command: deterministicStrategyRecommendation.command,
        confidence: deterministicStrategyRecommendation.confidence,
        swapAction: batterySwapRecommendation.action,
      })
    }

    if (previous.stale === true && !stale) {
      appendStrategyEventLogEntry({
        timestamp,
        type: 'stale_telemetry_cleared',
        detail: 'Telemetry freshness recovered.',
        command: deterministicStrategyRecommendation.command,
        confidence: deterministicStrategyRecommendation.confidence,
        swapAction: batterySwapRecommendation.action,
      })
    }

    strategyLogStateRef.current = {
      command: deterministicStrategyRecommendation.command,
      confidence: deterministicStrategyRecommendation.confidence,
      swapAction: batterySwapRecommendation.action,
      stale,
    }
  }, [
    batterySwapRecommendation.action,
    currentTime,
    deterministicStrategyRecommendation.command,
    deterministicStrategyRecommendation.confidence,
    telemetryAgeSeconds,
  ])

  return (
    <section className="grid gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff8fcb]">
          Race Captain Energy Command Center
        </p>
      </div>

        <section className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
          <DeterministicStrategyRecommendationPanel
            recommendation={deterministicStrategyRecommendation}
          />
          <MissionControlRaceHealthCard raceHealth={raceHealth} />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <PredictionSummaryPanel prediction={racePrediction} />
          <BatteryStrategySummaryPanel
            batteryState={raceBatteryState}
            recommendation={batterySwapRecommendation}
          />
          <TraileringStrategyPanel
            traileringOption={traileringOption}
            activeTraileringSession={activeTraileringSession}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
          <NextEventPanel
            prediction={racePrediction}
            speedMph={telemetry?.speedMph}
          />
          <RecommendedSpeedPanel
            recommendation={deterministicStrategyRecommendation}
            currentSpeedMph={telemetry?.speedMph}
          />
        </section>

    </section>
  )
}

function StrategyEngineeringCenter({
  raceDay,
  currentMile,
  distanceRemaining,
  telemetry,
  telemetryHistory,
  raceBatteryState,
  authoritativeStrategy,
  onSetActivePack,
  onSetPackSoc,
  onExecuteSwap,
  energySimulation,
  carSetup,
  activeTraileringSession,
}: {
  raceDay: RaceDay
  currentMile: number
  distanceRemaining: number
  telemetry: TelemetryData | null
  telemetryAgeSeconds?: number
  telemetryHistory: TelemetryHistorySample[]
  raceBatteryState: RaceBatteryState
  authoritativeStrategy: AuthoritativeStrategyState
  onSetActivePack: (packId: BatteryPackId) => void
  onSetPackSoc: (packId: BatteryPackId, socPercent: number) => void
  onExecuteSwap: () => void
  energySimulation: ReturnType<typeof simulateDayEnergy>
  carSetup: CarSetup
  activeTraileringSession: boolean
}) {
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const racePrediction = authoritativeStrategy.prediction
  const batterySwapRecommendation = authoritativeStrategy.swapRecommendation
  const traileringOption = authoritativeStrategy.traileringRecommendation
  const energyModel = buildRaceCaptainEnergyModel({
    raceDay,
    currentMile,
    distanceRemaining,
    telemetry,
    telemetryHistory,
    energySimulation,
    authoritativeStrategy,
    carSetup,
    now: currentTime,
  })
  const {
    currentSocPercent,
    currentWhPerMile,
    requiredWhPerMile,
    currentWhIsSimulated,
    rollingWhPerMile,
    solarInputWatts,
    solarInputIsSimulated,
    solarInputIsEstimated,
    solarCapturedKwh,
    solarCapturedIsEstimated,
    solarCapturedUnavailable,
    energyUsedKwh,
    solarOffsetPercent,
    netEnergyLossKwh,
    nextStopDistance,
    projectedArrivalSoc,
    projectedFinishSoc,
    routeSocPoints,
    upcomingTimelineSegments,
    timeToSunset,
  } = energyModel
  const authoritativeProjectedArrivalSoc =
    racePrediction.projectedNextStopSocPercent ?? projectedArrivalSoc
  const authoritativeProjectedFinishSoc =
    racePrediction.projectedEndDaySocPercent ?? projectedFinishSoc

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 60_000)

    return () => window.clearInterval(intervalId)
  }, [])

  return (
    <section className="grid gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff8fcb]">
          Strategy Explanation
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-400">
          Detailed forecast, model assumptions, and strategy reasoning live here.
        </p>
      </div>

      <RacePredictionPanel prediction={racePrediction} />

      <BatteryStrategyPanel
        batteryState={raceBatteryState}
        recommendation={batterySwapRecommendation}
        onSetActivePack={onSetActivePack}
        onSetPackSoc={onSetPackSoc}
        onExecuteSwap={onExecuteSwap}
      />

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.8fr_1fr]">
        <NativeEnergyCard>
          <NativeEnergyTitle title="Efficiency Wh/mi" info />
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <EfficiencyReadout label="Required" value={requiredWhPerMile.toFixed(0)} highlight />
            <EfficiencyReadout
              label={rollingWhPerMile.label}
              value={rollingWhPerMile.value === null ? '--' : rollingWhPerMile.value.toFixed(0)}
              estimated={rollingWhPerMile.mode === 'estimated'}
            />
            <EfficiencyReadout label="Current" value={currentWhPerMile.toFixed(0)} simulated={currentWhIsSimulated} />
          </div>
          <EfficiencyRail
            requiredWhPerMile={requiredWhPerMile}
            rollingWhPerMile={rollingWhPerMile.value ?? currentWhPerMile}
            currentWhPerMile={currentWhPerMile}
          />
        </NativeEnergyCard>

        <NativeEnergyCard>
          <div className="flex items-start justify-between gap-3">
            <NativeEnergyTitle title="Solar Input" />
            <div className="text-right">
              <p className="text-3xl font-black text-white">{solarInputWatts.toFixed(0)}<span className="ml-1 text-xl">w</span></p>
              {solarInputIsEstimated ? <EstimatedBadge /> : solarInputIsSimulated ? <SimulatedBadge /> : null}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-4">
            <SolarChart />
            <div className="self-center text-right">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Solar Offset</p>
              <p className="mt-1 text-3xl font-black text-emerald-200">{solarOffsetPercent.toFixed(0)}%</p>
            </div>
          </div>
        </NativeEnergyCard>

        <NativeEnergyCard>
          <NativeEnergyTitle title="Today's Energy Balance" />
          <div className="mt-5 grid grid-cols-3 divide-x divide-white/10 text-center">
            <BalanceMetric label="Energy Used" value={energyUsedKwh.toFixed(2)} unit="kWh" />
            <BalanceMetric
              label="Solar Captured"
              value={solarCapturedUnavailable ? '--' : solarCapturedKwh.toFixed(2)}
              unit="kWh"
              color="text-emerald-200"
              badge={solarCapturedIsEstimated ? 'estimated' : undefined}
            />
            <BalanceMetric label="Net Loss" value={netEnergyLossKwh.toFixed(2)} unit="kWh" />
          </div>
          <div className="mt-5 h-4 overflow-hidden rounded-full bg-white/20">
            <div className="h-full bg-[#ff3ea5]" style={{ width: `${Math.min(100, solarOffsetPercent)}%` }} />
          </div>
          <p className="mt-2 text-center text-2xl font-black text-[#ff8fcb]">
            {solarOffsetPercent.toFixed(0)}% <span className="text-xs uppercase text-slate-300">of used</span>
          </p>
        </NativeEnergyCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.45fr]">
        <NativeEnergyCard>
          <NativeEnergyTitle title="Route Energy Timeline" info />
          <RouteEnergyTimeline
            segments={upcomingTimelineSegments}
            socPoints={routeSocPoints}
            currentSocPercent={currentSocPercent}
            projectedFinishSoc={authoritativeProjectedFinishSoc}
          />
        </NativeEnergyCard>
        <NativeEnergyCard>
          <NativeEnergyTitle title="Key Targets" />
          <div className="mt-3 divide-y divide-white/10">
            {buildTargetRows({
              nextStopDistance,
              distanceRemaining,
              projectedArrivalSoc: authoritativeProjectedArrivalSoc,
              projectedFinishSoc: authoritativeProjectedFinishSoc,
              timeToSunset,
            }).map((target) => (
              <div key={target.label} className="flex items-center justify-between gap-4 py-3">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  {target.label}
                </p>
                <p className={`text-xl font-black ${target.color}`}>{target.value}</p>
              </div>
            ))}
          </div>
        </NativeEnergyCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <NativeEnergyCard>
          <NativeEnergyTitle title="Swap Projection Details" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatusMetric label="Action" value={formatSwapPlannerAction(batterySwapRecommendation.action)} />
            <StatusMetric label="Confidence" value={batterySwapRecommendation.confidence} />
            <StatusMetric label="Next Stop SOC" value={formatPredictionSoc(batterySwapRecommendation.projectedNextStopSocPercent)} />
            <StatusMetric label="End-Day SOC" value={formatPredictionSoc(batterySwapRecommendation.projectedEndDaySocPercent)} />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{batterySwapRecommendation.reason}</p>
        </NativeEnergyCard>
        <NativeEnergyCard>
          <NativeEnergyTitle title="Trailering Energy Analysis" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatusMetric label="Action" value={traileringOption?.action ?? 'DRIVE'} />
            <StatusMetric label="Energy Saved" value={formatEnergyWh(traileringOption?.estimatedEnergySavedWh)} />
            <StatusMetric
              label="Mileage Penalty"
              value={traileringOption ? `${traileringOption.mileagePenalty.toFixed(1)} mi` : '--'}
            />
            <StatusMetric label="Active" value={activeTraileringSession ? 'yes' : 'no'} />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {traileringOption?.reason ?? 'Drive the current route section.'}
          </p>
        </NativeEnergyCard>
      </section>
    </section>
  )
}

function NativeEnergyCard({ children }: { children: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
      {children}
    </article>
  )
}

function MissionControlRaceHealthCard({ raceHealth }: { raceHealth: RaceHealth }) {
  return (
    <NativeEnergyCard>
      <NativeEnergyTitle title="Race Health" />
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className={`text-5xl font-black ${scoreValueColor(raceHealth.score)}`}>
            {raceHealth.score}
          </p>
          <p className="mt-1 text-sm font-black uppercase tracking-[0.12em] text-slate-300">
            {raceHealth.label}
          </p>
        </div>
        <div className="text-right text-sm text-slate-300">
          <p>Margin {raceHealth.breakdown.socMarginPercent.toFixed(1)}%</p>
          <p>Reserve {raceHealth.breakdown.activeReserveSocPercent}%</p>
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full ${raceHealth.score >= 75 ? 'bg-emerald-400' : raceHealth.score >= 60 ? 'bg-yellow-300' : 'bg-red-400'}`}
          style={{ width: `${Math.min(100, Math.max(0, raceHealth.score))}%` }}
        />
      </div>
    </NativeEnergyCard>
  )
}

function PredictionSummaryPanel({ prediction }: { prediction: RacePrediction }) {
  return (
    <NativeEnergyCard>
      <div className="flex items-start justify-between gap-3">
        <NativeEnergyTitle title="Prediction Summary" />
        <span
          className={`w-fit rounded border px-2 py-1 text-xs font-black uppercase tracking-[0.14em] ${predictionConfidenceClass(
            prediction.confidence
          )}`}
        >
          {prediction.confidence}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <StatusMetric
          label="Next Stop SOC"
          value={formatPredictionSoc(prediction.projectedNextStopSocPercent)}
        />
        <StatusMetric
          label="End-Day SOC"
          value={formatPredictionSoc(prediction.projectedEndDaySocPercent)}
        />
        <StatusMetric
          label="Solar Recovery"
          value={formatEnergyWh(prediction.projectedSolarRecoveredWh)}
        />
        <StatusMetric
          label="Confidence"
          value={prediction.confidence}
        />
      </div>
    </NativeEnergyCard>
  )
}

function BatteryStrategySummaryPanel({
  batteryState,
  recommendation,
}: {
  batteryState: RaceBatteryState
  recommendation: BatterySwapRecommendation
}) {
  const activePack = batteryState.packs[batteryState.activePackId]
  const sparePack =
    batteryState.packs[batteryState.activePackId === 'A' ? 'B' : 'A']

  return (
    <NativeEnergyCard>
      <NativeEnergyTitle title="Battery Strategy" />
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <StatusMetric
          label="Active Pack"
          value={`${activePack.id} / ${activePack.socPercent.toFixed(0)}%`}
        />
        <StatusMetric
          label="Spare Pack"
          value={`${sparePack.id} / ${sparePack.socPercent.toFixed(0)}%`}
        />
      </div>
      <p className={`mt-4 text-3xl font-black uppercase ${swapPlannerActionClass(recommendation.action)}`}>
        {formatSwapPlannerAction(recommendation.action)}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        {recommendation.reason}
      </p>
    </NativeEnergyCard>
  )
}

function TraileringStrategyPanel({
  traileringOption,
  activeTraileringSession,
}: {
  traileringOption?: AuthoritativeStrategyState['traileringRecommendation']
  activeTraileringSession: boolean
}) {
  const action = traileringOption?.action ?? 'DRIVE'

  return (
    <NativeEnergyCard>
      <NativeEnergyTitle title="Trailering Strategy" />
      <p className={`mt-4 text-3xl font-black uppercase ${traileringActionClass(action)}`}>
        {action.replaceAll('_', ' ')}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <StatusMetric
          label="Energy Benefit"
          value={formatEnergyWh(traileringOption?.estimatedEnergySavedWh)}
        />
        <StatusMetric
          label="Mileage Penalty"
          value={traileringOption ? `${traileringOption.mileagePenalty.toFixed(1)} mi` : '--'}
        />
        <StatusMetric
          label="Active"
          value={activeTraileringSession ? 'yes' : 'no'}
        />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        {traileringOption?.reason ?? 'Drive the current route section.'}
      </p>
    </NativeEnergyCard>
  )
}

function NextEventPanel({
  prediction,
  speedMph,
}: {
  prediction: RacePrediction
  speedMph?: number
}) {
  const distanceMiles = prediction.nextStopMiles
  const eta = formatEta({
    distanceMiles,
    speedMph,
  })

  return (
    <NativeEnergyCard>
      <NativeEnergyTitle title="Next Event" />
      <p className="mt-4 text-3xl font-black text-white">
        {prediction.nextScheduleEventLabel ?? 'Next checkpoint'}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <StatusMetric
          label="Distance"
          value={distanceMiles !== undefined ? `${distanceMiles.toFixed(1)} mi` : '--'}
        />
        <StatusMetric label="ETA" value={eta} />
        <StatusMetric
          label="Projected SOC"
          value={formatPredictionSoc(prediction.projectedNextStopSocPercent)}
        />
      </div>
    </NativeEnergyCard>
  )
}

function RecommendedSpeedPanel({
  recommendation,
  currentSpeedMph,
}: {
  recommendation: DeterministicStrategyRecommendation
  currentSpeedMph?: number
}) {
  const recommendedSpeed = recommendation.recommendedSpeedMph
  const speedDelta =
    recommendedSpeed !== undefined && currentSpeedMph !== undefined
      ? recommendedSpeed - currentSpeedMph
      : undefined

  return (
    <NativeEnergyCard>
      <NativeEnergyTitle title="Recommended Speed" />
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <StatusMetric
          label="Recommended"
          value={formatSpeed(recommendedSpeed)}
        />
        <StatusMetric
          label="Current"
          value={formatSpeed(currentSpeedMph)}
        />
        <StatusMetric
          label="Delta"
          value={formatSignedSpeedDelta(speedDelta)}
        />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        {recommendation.reason}
      </p>
    </NativeEnergyCard>
  )
}

function DeterministicStrategyRecommendationPanel({
  recommendation,
}: {
  recommendation: DeterministicStrategyRecommendation
}) {
  return (
    <NativeEnergyCard>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <NativeEnergyTitle title="Strategy Recommendation" />
        <div className="flex flex-wrap gap-2">
          <span
            className={`w-fit rounded border px-2 py-1 text-xs font-black uppercase tracking-[0.14em] ${strategySeverityClass(
              recommendation.severity
            )}`}
          >
            {recommendation.severity}
          </span>
          <span
            className={`w-fit rounded border px-2 py-1 text-xs font-black uppercase tracking-[0.14em] ${predictionConfidenceClass(
              recommendation.confidence
            )}`}
          >
            {recommendation.confidence} confidence
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
        <div>
          <p className={`text-4xl font-black uppercase ${strategyCommandClass(recommendation.command)}`}>
            {recommendation.title}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {recommendation.reason}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          <StatusMetric
            label="Recommended Speed"
            value={formatSpeed(recommendation.recommendedSpeedMph)}
          />
          <StatusMetric
            label="Confidence"
            value={recommendation.confidence}
          />
          <StatusMetric
            label="Warnings"
            value={String(recommendation.warnings.length)}
          />
        </div>
      </div>
    </NativeEnergyCard>
  )
}

function RacePredictionPanel({ prediction }: { prediction: RacePrediction }) {
  return (
    <NativeEnergyCard>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <NativeEnergyTitle title="Prediction Engine v1" info />
        <span
          className={`w-fit rounded border px-2 py-1 text-xs font-black uppercase tracking-[0.14em] ${predictionConfidenceClass(
            prediction.confidence
          )}`}
        >
          {prediction.confidence} confidence
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
        <PredictionMetric
          label="Next Schedule Event"
          value={formatScheduleEvent(prediction)}
        />
        <PredictionMetric
          label="End Segment SOC"
          value={formatPredictionSoc(prediction.projectedEndSegmentSocPercent)}
        />
        <PredictionMetric
          label="Next Stop SOC"
          value={formatPredictionSoc(prediction.projectedNextStopSocPercent)}
        />
        <PredictionMetric
          label="End Day SOC"
          value={formatPredictionSoc(prediction.projectedEndDaySocPercent)}
          highlight
        />
        <PredictionMetric
          label="Predicted Wh/mi"
          value={`${prediction.predictedWhPerMile.toFixed(0)} Wh/mi`}
        />
        <PredictionMetric
          label="Predicted MPPT"
          value={formatWatts(prediction.predictedMpptWatts)}
        />
        <PredictionMetric
          label="Stopped Recovery"
          value={formatEnergyWh(prediction.projectedSolarRecoveredStoppedWh)}
        />
        <PredictionMetric
          label="Trailering Recovery"
          value={formatEnergyWh(prediction.projectedSolarRecoveredTraileringWh)}
        />
        <PredictionMetric
          label="Net Day Energy"
          value={formatEnergyWh(prediction.projectedNetEnergyWh)}
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatusMetric
          label="Projected Drive"
          value={formatEnergyWh(prediction.projectedDriveEnergyWh)}
        />
        <StatusMetric
          label="Projected Solar"
          value={formatEnergyWh(prediction.projectedSolarRecoveredWh)}
        />
        <StatusMetric
          label="Remaining Day"
          value={
            prediction.remainingDayMiles !== undefined
              ? `${prediction.remainingDayMiles.toFixed(1)} mi`
              : '--'
          }
        />
      </div>
      {prediction.warnings.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {prediction.warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-md border border-yellow-300/30 bg-yellow-300/10 p-2 text-xs font-semibold text-yellow-100"
            >
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </NativeEnergyCard>
  )
}

function BatteryStrategyPanel({
  batteryState,
  recommendation,
  onSetActivePack,
  onSetPackSoc,
  onExecuteSwap,
}: {
  batteryState: RaceBatteryState
  recommendation: BatterySwapRecommendation
  onSetActivePack: (packId: BatteryPackId) => void
  onSetPackSoc: (packId: BatteryPackId, socPercent: number) => void
  onExecuteSwap: () => void
}) {
  const activePack = batteryState.packs[batteryState.activePackId]
  const sparePack = batteryState.packs[batteryState.activePackId === 'A' ? 'B' : 'A']

  return (
    <NativeEnergyCard>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <NativeEnergyTitle title="Battery Strategy" info />
        <span
          className={`w-fit rounded border px-2 py-1 text-xs font-black uppercase tracking-[0.14em] ${predictionConfidenceClass(
            recommendation.confidence
          )}`}
        >
          {recommendation.confidence} confidence
        </span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr]">
        <BatteryPackCard
          pack={activePack}
          title="Active Pack"
          onSetActivePack={onSetActivePack}
          onSetPackSoc={onSetPackSoc}
        />
        <BatteryPackCard
          pack={sparePack}
          title="Spare Pack"
          onSetActivePack={onSetActivePack}
          onSetPackSoc={onSetPackSoc}
        />
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Swap Recommendation
          </p>
          <p className={`mt-2 text-3xl font-black uppercase ${swapPlannerActionClass(recommendation.action)}`}>
            {formatSwapPlannerAction(recommendation.action)}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {recommendation.reason}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <StatusMetric label="Active" value={`${recommendation.activePackId} / ${recommendation.activeSocPercent.toFixed(1)}%`} />
            <StatusMetric label="Spare" value={`${recommendation.sparePackId} / ${recommendation.spareSocPercent.toFixed(1)}%`} />
            <StatusMetric label="End Segment" value={formatPredictionSoc(recommendation.projectedEndSegmentSocPercent)} />
            <StatusMetric label="Next Stop" value={formatPredictionSoc(recommendation.projectedNextStopSocPercent)} />
          </div>
          <button
            type="button"
            onClick={onExecuteSwap}
            className="mt-4 h-10 rounded-md border border-[#ff3ea5]/50 bg-[#ff3ea5]/15 px-3 text-sm font-black uppercase tracking-wide text-[#ff8fcb] transition hover:bg-[#ff3ea5]/25"
          >
            Execute Swap
          </button>
        </div>
      </div>
    </NativeEnergyCard>
  )
}

function BatteryPackCard({
  pack,
  title,
  onSetActivePack,
  onSetPackSoc,
}: {
  pack: RaceBatteryState['packs'][BatteryPackId]
  title: string
  onSetActivePack: (packId: BatteryPackId) => void
  onSetPackSoc: (packId: BatteryPackId, socPercent: number) => void
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            {title}
          </p>
          <p className="mt-1 text-4xl font-black text-white">Pack {pack.id}</p>
        </div>
        <span className={`rounded border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
          pack.role === 'active'
            ? 'border-[#ff3ea5]/40 bg-[#ff3ea5]/10 text-[#ff8fcb]'
            : 'border-sky-300/40 bg-sky-300/10 text-sky-200'
        }`}>
          {pack.role}
        </span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full bg-[#ff3ea5]"
          style={{ width: `${Math.min(100, Math.max(0, pack.socPercent))}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatusMetric label="SOC" value={`${pack.socPercent.toFixed(1)}%`} />
        <StatusMetric label="Energy" value={formatEnergyWh(pack.energyWh)} />
      </div>
      <div className="mt-3 grid gap-2">
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Set Pack {pack.id} SOC
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={pack.socPercent.toFixed(0)}
            onChange={(event) => onSetPackSoc(pack.id, Number(event.target.value))}
            className="h-9 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none focus:border-[#ff3ea5]/60"
          />
        </label>
        <button
          type="button"
          onClick={() => onSetActivePack(pack.id)}
          disabled={pack.role === 'active'}
          className="h-9 rounded-md border border-white/10 bg-white/5 px-3 text-xs font-black uppercase tracking-wide text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Set Active
        </button>
        {pack.isCharging ? (
          <p className="text-xs font-semibold text-emerald-200">Charging from MPPT</p>
        ) : null}
      </div>
    </div>
  )
}

function PredictionMetric({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-black ${highlight ? 'text-emerald-200' : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}

function predictionConfidenceClass(confidence: PredictionConfidence) {
  if (confidence === 'high') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  if (confidence === 'medium') return 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100'

  return 'border-red-400/40 bg-red-400/10 text-[#ff8fcb]'
}

function strategySeverityClass(
  severity: DeterministicStrategyRecommendation['severity']
) {
  if (severity === 'normal') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  if (severity === 'caution') return 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100'

  return 'border-red-400/40 bg-red-400/10 text-[#ff8fcb]'
}

function strategyCommandClass(
  command: DeterministicStrategyRecommendation['command']
) {
  if (command === 'swap_now' || command === 'reduce_speed') return 'text-[#ff8fcb]'
  if (command === 'plan_swap' || command === 'prioritize_charging') return 'text-yellow-100'
  if (command === 'increase_speed_allowed') return 'text-sky-200'

  return 'text-emerald-200'
}

function formatScheduleEvent(prediction: RacePrediction) {
  if (!prediction.nextScheduleEventLabel) return '--'

  return prediction.nextScheduleEventType
    ? `${prediction.nextScheduleEventLabel} (${prediction.nextScheduleEventType})`
    : prediction.nextScheduleEventLabel
}

function formatPredictionSoc(value?: number) {
  return value === undefined || !Number.isFinite(value)
    ? '--'
    : `${value.toFixed(1)}%`
}

function formatEnergyWh(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '--'

  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)} kWh`

  return `${value.toFixed(0)} Wh`
}

function formatWhPerMile(value?: number) {
  return value === undefined || !Number.isFinite(value)
    ? '--'
    : `${value.toFixed(0)} Wh/mi`
}

function formatTelemetryAge(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '--'

  if (value < 60) return `${Math.round(value)}s`

  const minutes = Math.floor(value / 60)
  const seconds = Math.round(value % 60)

  return `${minutes}m ${seconds}s`
}

function formatSwapPlannerAction(action: BatterySwapRecommendation['action']) {
  if (action === 'swap_now') return 'Swap Now'
  if (action === 'plan_swap') return 'Plan Swap'

  return 'No Swap'
}

function swapPlannerActionClass(action: BatterySwapRecommendation['action']) {
  if (action === 'swap_now') return 'text-[#ff8fcb]'
  if (action === 'plan_swap') return 'text-yellow-100'

  return 'text-emerald-200'
}

function NativeEnergyTitle({ title, info = false }: { title: string; info?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
        {title}
      </p>
      {info ? (
        <span className="grid h-4 w-4 place-items-center rounded-full border border-slate-500 text-[10px] font-bold text-slate-400">
          i
        </span>
      ) : null}
    </div>
  )
}

function DecisionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/10 p-3 last:border-b-0">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-300">{label}</p>
      <p className="mt-1 text-2xl font-black text-emerald-200">{value}</p>
    </div>
  )
}

function FinishSocScale({ projectedFinishSoc }: { projectedFinishSoc: number }) {
  const markerPosition = Math.min(
    100,
    Math.max(0, ((projectedFinishSoc + 20) / 70) * 100)
  )

  return (
    <div className="mt-6">
      <div className="relative h-4 overflow-visible rounded-full bg-white/15">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500 via-amber-300 via-45% to-sky-400" />
        <div
          className="absolute -top-3 h-0 w-0 border-x-[9px] border-t-[15px] border-x-transparent border-t-white"
          style={{ left: `calc(${markerPosition}% - 0.5625rem)` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-5 text-xs font-bold">
        <span className="text-red-400">-20%</span>
        <span className="text-amber-300">0%</span>
        <span className="text-emerald-200">10%</span>
        <span className="text-emerald-200">25%</span>
        <span className="text-right text-sky-300">50%+</span>
      </div>
    </div>
  )
}

function BatteryStatus({
  label,
  id,
  soc,
  kwh,
  color,
  simulated = false,
}: {
  label: string
  id: string
  soc: number
  kwh: number
  color: 'magenta' | 'info'
  simulated?: boolean
}) {
  const accent = color === 'magenta' ? '#ff3ea5' : nativeInfo

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: accent }}>
        {label}
      </p>
      <div className="mt-2 flex items-end gap-4">
        <p className="text-5xl font-black" style={{ color: accent }}>{id}</p>
        <p className="text-4xl font-black text-white">{soc.toFixed(0)}%</p>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/20">
        <div className="h-full" style={{ width: `${Math.min(100, Math.max(0, soc))}%`, backgroundColor: accent }} />
      </div>
      <p className="mt-2 text-center text-sm font-bold" style={{ color: accent }}>
        {kwh.toFixed(2)} kWh
      </p>
      {simulated ? <SimulatedBadge className="mx-auto mt-2" /> : null}
    </div>
  )
}

function SegmentedInventoryBar({
  activePercent,
  reservePercent,
}: {
  activePercent: number
  reservePercent: number
}) {
  const activeSegments = Math.round((Math.min(100, Math.max(0, activePercent)) / 100) * 8)
  const reserveSegments = Math.round((Math.min(100, Math.max(0, reservePercent)) / 100) * 8)

  return (
    <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/15">
      {Array.from({ length: 16 }).map((_, index) => (
        <div
          key={index}
          className="border-r border-black/30 last:border-r-0"
          style={{
            width: '6.25%',
            backgroundColor: index < 10 ? '#ff3ea5' : nativeInfo,
            opacity:
              index < 8
                ? index < activeSegments ? 0.9 : 0.22
                : index - 8 < reserveSegments ? 0.9 : 0.22,
          }}
        />
      ))}
    </div>
  )
}

function EfficiencyReadout({
  label,
  value,
  highlight = false,
  simulated = false,
  estimated = false,
}: {
  label: string
  value: string
  highlight?: boolean
  simulated?: boolean
  estimated?: boolean
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">{label}</p>
      <p className={`mt-1 text-4xl font-black ${highlight ? 'text-emerald-200' : 'text-white'}`}>{value}</p>
      <p className="text-sm text-slate-300">Wh/mi</p>
      {simulated ? <SimulatedBadge className="mx-auto mt-2" /> : null}
      {estimated ? <EstimatedBadge className="mx-auto mt-2" /> : null}
    </div>
  )
}

function EfficiencyRail({
  requiredWhPerMile,
  rollingWhPerMile,
  currentWhPerMile,
}: {
  requiredWhPerMile: number
  rollingWhPerMile: number
  currentWhPerMile: number
}) {
  const min = 20
  const max = 70
  const position = (value: number) =>
    Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))

  return (
    <div className="mt-6">
      <div className="relative h-8">
        <div className="absolute left-0 right-0 top-3 h-1 bg-white/25" />
        <div className="absolute left-0 top-3 h-1 bg-[#ff3ea5]" style={{ width: `${position(requiredWhPerMile)}%` }} />
        <div className="absolute top-0 h-5 w-5 rounded-full border-2 border-white bg-slate-200" style={{ left: `calc(${position(rollingWhPerMile)}% - 0.625rem)` }} />
        <div className="absolute top-0 h-0 w-0 border-x-[10px] border-t-[18px] border-x-transparent border-t-[#ff3ea5]" style={{ left: `calc(${position(requiredWhPerMile)}% - 0.625rem)` }} />
        <div className="absolute top-0 h-5 w-5 rounded-full border-2 border-white bg-slate-200" style={{ left: `calc(${position(currentWhPerMile)}% - 0.625rem)` }} />
      </div>
      <div className="grid grid-cols-6 text-xs text-slate-300">
        {[20, 30, 40, 50, 60, 70].map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  )
}

function SolarChart() {
  return (
    <svg viewBox="0 0 100 72" className="h-36 w-full" role="img" aria-label="Solar input over time">
      {[18, 36, 54].map((line) => (
        <line key={line} x1="0" x2="100" y1={line} y2={line} stroke="rgba(255,255,255,0.14)" strokeWidth="0.8" />
      ))}
      <path
        d={`${solarTrendPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} L 100 72 L 0 72 Z`}
        fill="rgba(126,211,33,0.16)"
      />
      <polyline
        points={solarTrendPoints.map((point) => `${point.x},${point.y}`).join(' ')}
        fill="none"
        stroke="#ff3ea5"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BalanceMetric({
  label,
  value,
  unit,
  color = 'text-white',
  badge,
}: {
  label: string
  value: string
  unit: string
  color?: string
  badge?: 'estimated'
}) {
  return (
    <div className="px-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">{label}</p>
      <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
      <p className={color}>{unit}</p>
      {badge === 'estimated' ? <EstimatedBadge className="mx-auto mt-2" /> : null}
    </div>
  )
}

function RouteEnergyTimeline({
  segments,
  socPoints,
  currentSocPercent,
  projectedFinishSoc,
}: {
  segments: Array<{
    label: string
    detail: string
    color: string
    barColor: string
  }>
  socPoints: Array<{ x: number; y: number; soc: number }>
  currentSocPercent: number
  projectedFinishSoc: number
}) {
  const linePoints = socPoints.map((point) => `${point.x},${100 - point.y}`).join(' ')
  const lowestPoint = socPoints.reduce((lowest, point) =>
    point.soc < lowest.soc ? point : lowest
  , socPoints[0])

  return (
    <div className="mt-4">
      <div className="grid grid-cols-5 gap-2 text-center text-xs uppercase tracking-wide">
        {segments.map((segment) => (
          <TimelineStop
            key={`${segment.label}-${segment.detail}`}
            label={segment.label}
            detail={segment.detail}
            color={segment.color}
          />
        ))}
      </div>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-white/10">
        {segments.map((segment) => (
          <div key={`${segment.label}-${segment.barColor}`} className={segment.barColor} style={{ width: '20%' }} />
        ))}
      </div>
      <div className="mt-4 h-56 rounded-md border border-white/10 bg-black/25 p-3">
        <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Projected active battery state of charge">
          {[20, 40, 60, 80].map((line) => (
            <line key={line} x1="0" x2="100" y1={line} y2={line} stroke="rgba(255,255,255,0.12)" strokeWidth="0.7" />
          ))}
          <line x1="0" x2="100" y1="24" y2="24" stroke="rgba(126,211,33,0.5)" strokeDasharray="4 4" />
          <line x1="0" x2="100" y1="50" y2="50" stroke="rgba(250,204,21,0.45)" strokeDasharray="4 4" />
          <line x1="0" x2="100" y1="76" y2="76" stroke="rgba(239,68,68,0.55)" strokeDasharray="4 4" />
          <polyline
            points={linePoints}
            fill="none"
            stroke="#ff3ea5"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={socPoints[0]?.x ?? 0} cy={100 - (socPoints[0]?.y ?? currentSocPercent)} r="3" fill="#060808" stroke="#22c55e" strokeWidth="2" />
          <circle cx={lowestPoint.x} cy={100 - lowestPoint.y} r="3" fill="#060808" stroke="#ef4444" strokeWidth="2" />
          <circle cx={socPoints[socPoints.length - 1]?.x ?? 100} cy={100 - (socPoints[socPoints.length - 1]?.y ?? projectedFinishSoc)} r="3" fill="#060808" stroke="#22c55e" strokeWidth="2" />
          <text x="3" y={Math.max(8, 96 - currentSocPercent)} fill="#22c55e" fontSize="7" fontWeight="800">{currentSocPercent.toFixed(0)}%</text>
          <text x={Math.max(4, lowestPoint.x - 3)} y={Math.min(96, 106 - lowestPoint.y)} fill="#ef4444" fontSize="7" fontWeight="800">{lowestPoint.soc.toFixed(0)}%</text>
          <text x="88" y={Math.max(8, 96 - projectedFinishSoc)} fill="#22c55e" fontSize="7" fontWeight="800">{projectedFinishSoc.toFixed(0)}%</text>
          <text x="92" y="26" fill="#22c55e" fontSize="6" fontWeight="800">SAFE</text>
          <text x="88" y="51" fill="#facc15" fontSize="6" fontWeight="800">CAUTION</text>
          <text x="88" y="77" fill="#ef4444" fontSize="6" fontWeight="800">DANGER</text>
        </svg>
      </div>
    </div>
  )
}

function TimelineStop({
  label,
  detail,
  color,
}: {
  label: string
  detail: string
  color: string
}) {
  return (
    <div>
      <p className={`font-black ${color}`}>{label}</p>
      <p className="text-slate-300">{detail}</p>
    </div>
  )
}

function RaceCommandCard({
  raceDay,
  authoritativeStrategy,
}: {
  raceDay: RaceDay
  authoritativeStrategy: AuthoritativeStrategyState
}) {
  const trailering = authoritativeStrategy.traileringRecommendation
  const recommendation = authoritativeStrategy.strategyRecommendation

  return (
    <section className="rounded-lg border border-[#ff3ea5]/30 bg-[#ff3ea5]/10 p-4 shadow-xl shadow-black/20">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-semibold text-[#ff8fcb]">
            Race Command
          </p>
          <h1 className="mt-1 text-3xl font-black text-white sm:text-4xl">
            {formatSpeed(authoritativeStrategy.recommendedSpeedMph)}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
            {recommendation.reason}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge label={`Day ${raceDay.day}`} className="border-white/20 bg-white/10 text-slate-100" />
          <Badge label={recommendation.title} className="border-[#ff3ea5]/40 bg-black/25 text-[#ff8fcb]" />
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <CommandMetric
          label="Recommended Speed"
          value={formatSpeed(authoritativeStrategy.recommendedSpeedMph)}
        />
        <CommandMetric label="Strategy Command" value={recommendation.title} detail={recommendation.reason} />
        <CommandMetric
          label="End-Day SOC"
          value={formatPredictionSoc(authoritativeStrategy.projectedEndDaySocPercent)}
        />
        <CommandMetric
          label="Battery Swap Advice"
          value={formatSwapPlannerAction(authoritativeStrategy.swapRecommendation.action)}
          detail={authoritativeStrategy.swapRecommendation.reason}
        />
        <CommandMetric
          label="Trailering Advice"
          value={trailering?.action ?? 'DRIVE'}
          detail={trailering?.reason}
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

function TelemetrySubviewSelector({
  activeSubview,
  onSubviewChange,
}: {
  activeSubview: TelemetrySubview
  onSubviewChange: (subview: TelemetrySubview) => void
}) {
  const subviews: Array<{ id: TelemetrySubview; label: string }> = [
    { id: 'vehicle', label: 'Vehicle' },
    { id: 'mppt', label: 'MPPT' },
    { id: 'connections', label: 'Connections' },
  ]

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-2">
      <div className="grid gap-2 sm:grid-cols-3">
        {subviews.map((subview) => (
          <button
            key={subview.id}
            type="button"
            onClick={() => onSubviewChange(subview.id)}
            className={`h-10 rounded-md border px-3 text-sm font-black uppercase tracking-wide transition ${
              activeSubview === subview.id
                ? 'border-[#ff3ea5]/50 bg-[#ff3ea5]/15 text-[#ff8fcb]'
                : 'border-white/10 bg-white/5 text-slate-300 hover:border-[#ff3ea5]/30 hover:bg-white/10'
            }`}
          >
            {subview.label}
          </button>
        ))}
      </div>
    </section>
  )
}

const mpptFields = [
  'mpptPvVoltage',
  'mpptPvCurrent',
  'mpptPvPowerWatts',
  'mpptBatteryVoltage',
  'mpptChargeCurrent',
  'mpptChargePowerWatts',
  'mpptDailyEnergyWh',
  'mpptStatus',
  'mpptFault',
] as const

function formatWatts(value?: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(0)} W`
    : '--'
}

function formatVolts(value?: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(1)} V`
    : '--'
}

function formatAmps(value?: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(1)} A`
    : '--'
}

function solarInputSource(telemetry: TelemetryData | null) {
  if (telemetry?.mpptChargePowerWatts !== undefined) return 'mpptChargePowerWatts'
  if (telemetry?.mpptPvPowerWatts !== undefined) return 'mpptPvPowerWatts'
  if (telemetry?.solarPowerWatts !== undefined) return 'solarPowerWatts'
  return 'setup estimate'
}

function latestMpptAgeSeconds(
  telemetryHistory: TelemetryHistorySample[],
  telemetry: TelemetryData | null
) {
  const latestHistoryTimestamp = [...telemetryHistory]
    .reverse()
    .find(
      (sample) =>
        sample.mpptChargePowerWatts !== undefined ||
        sample.mpptDailyEnergyWh !== undefined
    )?.timestamp
  const latestTelemetryTimestamp =
    telemetry &&
    (telemetry.mpptChargePowerWatts !== undefined ||
      telemetry.mpptPvPowerWatts !== undefined ||
      telemetry.mpptDailyEnergyWh !== undefined)
      ? telemetry.timestamp
      : undefined
  const latestTimestamp = latestHistoryTimestamp ?? latestTelemetryTimestamp

  return latestTimestamp !== undefined
    ? Math.max(0, Math.round((Date.now() - latestTimestamp) / 1000))
    : null
}

function integrateMpptChargeEnergyWh(telemetryHistory: TelemetryHistorySample[]) {
  const samples = telemetryHistory
    .filter(
      (sample) =>
        sample.mpptChargePowerWatts !== undefined &&
        Number.isFinite(sample.mpptChargePowerWatts)
    )
    .sort((left, right) => left.timestamp - right.timestamp)

  if (samples.length < 2) return null

  let energyWh = 0

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    const deltaHours = Math.max(0, current.timestamp - previous.timestamp) / 3_600_000
    const averagePower =
      ((previous.mpptChargePowerWatts ?? 0) + (current.mpptChargePowerWatts ?? 0)) / 2

    energyWh += Math.max(0, averagePower) * deltaHours
  }

  return energyWh
}

function classifyDataFreshness(ageSeconds?: number) {
  const vehicleStatus = classifyVehicleNodeStatusFromAgeMs(
    ageSeconds === undefined ? null : ageSeconds * 1000
  )

  if (vehicleStatus === 'online') {
    return { label: 'online', tone: 'healthy' as const, vehicleStatus }
  }
  if (vehicleStatus === 'stale') {
    return { label: 'stale', tone: 'warning' as const, vehicleStatus }
  }

  return { label: 'offline', tone: 'danger' as const, vehicleStatus }
}

function telemetrySourceDisplay(source: TelemetrySource) {
  if (source === 'esp32') return 'ESP32'
  if (source === 'simulator' || source === 'mock-esp32') return 'simulator'
  if (source === 'cloud') return 'cloud'
  return 'local'
}

function formatTimestamp(value?: string | number | null) {
  if (value === undefined || value === null) return '--'

  const timestamp =
    typeof value === 'number' ? value : Date.parse(value)

  if (!Number.isFinite(timestamp)) return '--'

  return new Date(timestamp).toLocaleTimeString()
}

function formatSeconds(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '--'
  }

  return `${Math.max(0, Math.round(value))}s`
}

function formatMilliseconds(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '--'
  }

  return `${Math.max(0, Math.round(value))} ms`
}

function formatTemperatureF(valueC?: number | null) {
  if (valueC === undefined || valueC === null || !Number.isFinite(valueC)) {
    return '--'
  }

  return `${celsiusToFahrenheit(valueC).toFixed(1)} F`
}

function celsiusToFahrenheit(valueC: number) {
  return valueC * 1.8 + 32
}

function MpptLivePanel({
  telemetry,
  telemetryHistory,
  carSetup,
}: {
  telemetry: TelemetryData | null
  telemetryHistory: TelemetryHistorySample[]
  carSetup: CarSetup
}) {
  const solarSource = solarInputSource(telemetry)
  const chargePower = telemetry?.mpptChargePowerWatts
  const capturedTodayWh =
    telemetry?.mpptDailyEnergyWh ?? integrateMpptChargeEnergyWh(telemetryHistory)
  const mpptAgeSeconds = latestMpptAgeSeconds(telemetryHistory, telemetry)
  const missingFields = mpptFields.filter((field) => telemetry?.[field] === undefined)
  const noMpptData = missingFields.length === mpptFields.length

  return (
    <section className="grid gap-4">
      {noMpptData ? (
        <div className="rounded-md border border-slate-400/25 bg-slate-400/10 p-3 text-sm font-semibold text-slate-300">
          No MPPT data
        </div>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatusMetric label="MPPT Status" value={telemetry?.mpptStatus ?? telemetry?.mpptChargeState ?? '--'} />
        <StatusMetric label="MPPT Fault" value={telemetry?.mpptFault ?? '--'} />
        <StatusMetric label="PV Voltage" value={formatVolts(telemetry?.mpptPvVoltage)} />
        <StatusMetric label="PV Current" value={formatAmps(telemetry?.mpptPvCurrent)} />
        <StatusMetric label="PV Power" value={formatWatts(telemetry?.mpptPvPowerWatts)} />
        <StatusMetric label="Charge Voltage" value={formatVolts(telemetry?.mpptBatteryVoltage)} />
        <StatusMetric label="Charge Current" value={formatAmps(telemetry?.mpptChargeCurrent)} />
        <StatusMetric label="Charge Power" value={formatWatts(telemetry?.mpptChargePowerWatts)} />
        <StatusMetric
          label="Daily Energy"
          value={
            telemetry?.mpptDailyEnergyWh !== undefined
              ? `${telemetry.mpptDailyEnergyWh.toFixed(0)} Wh / ${(telemetry.mpptDailyEnergyWh / 1000).toFixed(2)} kWh`
              : '--'
          }
        />
        <StatusMetric
          label="Solar Input Source"
          value={solarSource}
        />
        {solarSource === 'setup estimate' ? (
          <p className="text-xs font-semibold text-slate-400">
            {carSetup.solarWatts.toFixed(0)} W estimated
          </p>
        ) : null}
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <MiniPanel title="Live Charge Power">
          <StatusMetric label="Current" value={formatWatts(chargePower)} />
        </MiniPanel>
        <MiniPanel title="Solar Captured Today">
          <StatusMetric
            label="Captured"
            value={
              capturedTodayWh !== null
                ? `${capturedTodayWh.toFixed(0)} Wh / ${(capturedTodayWh / 1000).toFixed(2)} kWh`
                : '--'
            }
          />
          {telemetry?.mpptDailyEnergyWh === undefined && capturedTodayWh !== null ? (
            <p className="mt-2 text-xs font-semibold text-slate-400">
              Integrated from MPPT charge power history
            </p>
          ) : null}
        </MiniPanel>
        <MiniPanel title="Solar Data Age">
          <StatusMetric
            label="Age"
            value={mpptAgeSeconds !== null ? `${mpptAgeSeconds}s` : '--'}
          />
          {solarSource === 'setup estimate' ? (
            <p className="mt-2 text-xs font-semibold text-slate-400">
              Fallback mode: estimated/setup data
            </p>
          ) : null}
        </MiniPanel>
      </section>
    </section>
  )
}

function ConnectionStatusPanel({
  telemetry,
  telemetryHistory,
  telemetryStatus,
  connectionStatus,
  lastPacketAt,
  packetAgeSeconds,
  packetStats,
  cloudPacketStatus,
  source,
  cloudNode,
  cloudHealth,
  geolocation,
}: {
  telemetry: TelemetryData | null
  telemetryHistory: TelemetryHistorySample[]
  telemetryStatus: TelemetryConnectionStatus
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  lastPacketAt?: number
  packetAgeSeconds?: number
  packetStats: TelemetryPacketStats
  cloudPacketStatus: CloudTelemetryPacketStatus | null
  source: TelemetrySource
  cloudNode: TelemetryNodeId
  cloudHealth: CloudTelemetryHealth | null
  geolocation: ReturnType<typeof useGeolocation>
}) {
  const vehicleFreshness = classifyDataFreshness(
    packetAgeSeconds
  )
  const canTrustCloudPacket =
    source === 'cloud' && vehicleFreshness.vehicleStatus !== 'offline'
  const trustedCloudPacketStatus = canTrustCloudPacket ? cloudPacketStatus : null
  const mpptAge = latestMpptAgeSeconds(telemetryHistory, telemetry)
  const mpptFreshness = classifyDataFreshness(mpptAge ?? undefined)
  const missingMpptFields = mpptFields.filter((field) => telemetry?.[field] === undefined).length
  const gpsAgeSeconds = geolocation.timestamp
    ? Math.max(0, Math.round((Date.now() - geolocation.timestamp) / 1000))
    : undefined
  const gpsFreshness = classifyDataFreshness(gpsAgeSeconds)
  const displayedPacketRateHz =
    vehicleFreshness.vehicleStatus === 'offline'
      ? 0
      : trustedCloudPacketStatus?.packetRateHz !== undefined
        ? trustedCloudPacketStatus.packetRateHz
        : packetStats.packetsPerMinute / 60
  const displayedSource =
    source === 'cloud'
      ? trustedCloudPacketStatus?.source ?? telemetrySourceDisplay(source)
      : telemetrySourceDisplay(source)
  const displayedVehicleNodeStatus = vehicleNodeStatusLabel(
    vehicleFreshness.vehicleStatus
  )
  const displayedBackendStatus =
    cloudHealth?.cloudBackendStatus ??
    (source === 'cloud' || connectionStatus === 'connected'
      ? 'connected'
      : 'error')
  const displayedHealthEndpoint =
    cloudHealth?.healthEndpointStatus ?? (cloudHealth?.ok ? 'healthy' : 'error')
  const displayedTelemetryFresh =
    vehicleFreshness.vehicleStatus === 'online' &&
    trustedCloudPacketStatus?.telemetryFresh !== false
      ? 'true'
      : 'false'
  const lastCloudUpdateAt =
    cloudPacketStatus?.updatedAt ?? cloudHealth?.latestVehicleUpdatedAt ?? null

  return (
    <section className="grid gap-4">
      <MiniPanel title="Vehicle Telemetry">
        <div className="grid gap-3 sm:grid-cols-3">
          <ConnectionField
            label="Vehicle ESP32"
            value={displayedVehicleNodeStatus}
            tone={vehicleFreshness.tone}
          />
          <StatusMetric label="Last Vehicle Packet" value={formatTimestamp(lastCloudUpdateAt ?? lastPacketAt)} />
          <StatusMetric label="Vehicle Packet Age" value={formatSeconds(packetAgeSeconds)} />
          <StatusMetric label="Packet Rate" value={`${displayedPacketRateHz.toFixed(2)} Hz`} />
          <StatusMetric label="Source" value={displayedSource} />
          <StatusMetric label="Node" value={cloudNode} />
          <StatusMetric label="Vehicle Node Status" value={vehicleFreshness.label} />
          <StatusMetric label="Telemetry State" value={telemetryStatus} />
          <StatusMetric
            label="Telemetry Fresh"
            value={displayedTelemetryFresh}
          />
          <StatusMetric
            label="Last Cloud Status"
            value={
              cloudPacketStatus?.lastCloudStatus !== undefined
                ? String(cloudPacketStatus.lastCloudStatus)
                : '--'
            }
          />
          <StatusMetric
            label="ESP32 Packet Age"
            value={formatMilliseconds(trustedCloudPacketStatus?.lastPacketAgeMs)}
          />
        </div>
      </MiniPanel>
      <MiniPanel title="MPPT Telemetry">
        <div className="grid gap-3 sm:grid-cols-3">
          <ConnectionField label="Status" value={mpptFreshness.label} tone={mpptFreshness.tone} />
          <StatusMetric label="Last MPPT Packet" value={mpptAge !== null ? `${mpptAge}s ago` : '--'} />
          <StatusMetric label="MPPT Data Age" value={mpptAge !== null ? `${mpptAge}s` : '--'} />
          <StatusMetric label="Last Charge Power" value={formatWatts(telemetry?.mpptChargePowerWatts)} />
          <StatusMetric label="Missing Fields" value={String(missingMpptFields)} />
        </div>
      </MiniPanel>
      <MiniPanel title="Cloud Telemetry">
        <div className="grid gap-3 sm:grid-cols-3">
          <ConnectionField
            label="Cloud Backend"
            value={displayedBackendStatus === 'connected' ? 'connected' : 'unavailable'}
            tone={displayedBackendStatus === 'connected' ? 'healthy' : 'danger'}
          />
          <ConnectionField
            label="Redis"
            value={cloudHealth?.redis ?? 'not_configured'}
            tone={cloudHealth?.redis === 'connected' ? 'healthy' : cloudHealth?.redis === 'error' ? 'danger' : 'neutral'}
          />
          <ConnectionField
            label="Health Endpoint"
            value={displayedHealthEndpoint}
            tone={displayedHealthEndpoint === 'healthy' ? 'healthy' : 'danger'}
          />
          <StatusMetric label="Last Redis Read" value={formatTimestamp(cloudHealth?.lastRedisReadAt)} />
          <StatusMetric label="Last Vehicle Packet" value={formatTimestamp(cloudHealth?.latestVehicleUpdatedAt)} />
          <StatusMetric label="Health Node" value={cloudHealth?.latestVehicleNode ?? '--'} />
          <StatusMetric label="Vehicle Packet Age" value={formatSeconds(cloudHealth?.latestVehiclePacketAgeSeconds)} />
          <StatusMetric label="Latest Updated" value={formatTimestamp(cloudPacketStatus?.updatedAt)} />
        </div>
      </MiniPanel>
      <MiniPanel title="GPS">
        <div className="grid gap-3 sm:grid-cols-3">
          <ConnectionField label="Permission" value={geolocation.status} tone={geolocation.status === 'watching' ? 'healthy' : geolocation.status === 'error' || geolocation.status === 'permission-denied' ? 'danger' : 'neutral'} />
          <ConnectionField label="GPS Fix" value={geolocation.latitude !== null && geolocation.longitude !== null ? 'available' : 'unavailable'} tone={geolocation.latitude !== null && geolocation.longitude !== null ? gpsFreshness.tone : 'neutral'} />
          <StatusMetric label="Lat/Lon" value={geolocation.latitude !== null && geolocation.longitude !== null ? `${geolocation.latitude.toFixed(5)}, ${geolocation.longitude.toFixed(5)}` : '--'} />
          <StatusMetric label="GPS Age" value={gpsAgeSeconds !== undefined ? `${gpsAgeSeconds}s` : '--'} />
        </div>
      </MiniPanel>
    </section>
  )
}

function ConnectionField({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'healthy' | 'warning' | 'danger' | 'neutral'
}) {
  const toneClass =
    tone === 'healthy'
      ? 'text-emerald-200'
      : tone === 'warning'
        ? 'text-yellow-100'
        : tone === 'danger'
          ? 'text-red-300'
          : 'text-slate-300'

  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#ff8fcb]">
        {label}
      </p>
      <p className={`mt-1 text-base font-black ${toneClass}`}>{value}</p>
    </div>
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
  lazy = false,
  children,
}: {
  title: string
  lazy?: boolean
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <details
      className="rounded-lg border border-white/10 bg-white/[0.035]"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none p-3 text-sm font-black text-white marker:hidden sm:p-4 sm:text-base">
        <span className="text-[#ff8fcb]">{title}</span>
      </summary>
      {lazy && !isOpen ? null : (
        <div className="grid gap-2 border-t border-white/10 p-2 sm:gap-4 sm:p-4">
          {children}
        </div>
      )}
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
  effectiveStatusSource = 'fallback',
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
            Legacy strategy debug only
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Historical predictive strategy internals for diagnostics. Visible
            decisions, logs, and snapshots use the authoritative strategy state.
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
  showDevelopmentSources = false,
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
  showDevelopmentSources?: boolean
}) {
  const visibleTelemetrySources = showDevelopmentSources
    ? telemetrySources
    : telemetrySources.filter(
        (telemetrySource) =>
          telemetrySource === 'cloud' || telemetrySource === 'esp32'
      )

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3 sm:p-4">
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
            {visibleTelemetrySources.map((telemetrySource) => (
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

function telemetryEnergyTimestamp(
  telemetry: TelemetryData,
  effectiveLastPacketAt?: number
) {
  if (effectiveLastPacketAt !== undefined) return effectiveLastPacketAt
  if (telemetry.timestamp > 1_000_000_000_000) return telemetry.timestamp

  return Date.now()
}

function formatSpeed(value?: number) {
  return value === undefined ? '--' : `${value.toFixed(1)} mph`
}

function formatSignedSpeedDelta(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '--'

  const sign = value > 0 ? '+' : ''

  return `${sign}${value.toFixed(1)} mph`
}

function formatEta({
  distanceMiles,
  speedMph,
}: {
  distanceMiles?: number
  speedMph?: number
}) {
  if (
    distanceMiles === undefined ||
    !Number.isFinite(distanceMiles) ||
    distanceMiles <= 0
  ) {
    return '--'
  }

  const safeSpeed =
    speedMph !== undefined && Number.isFinite(speedMph) && speedMph > 1
      ? speedMph
      : rx2Config.defaultTargetSpeedMph
  const totalMinutes = Math.round((distanceMiles / safeSpeed) * 60)

  if (totalMinutes < 60) return `${totalMinutes} min`

  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
}

function scoreValueColor(score: number) {
  if (score >= 75) return 'text-emerald-200'
  if (score >= 60) return 'text-yellow-100'

  return 'text-[#ff8fcb]'
}

function traileringActionClass(action: ReturnType<typeof generatePredictiveStrategy>['routeIntelligence']['traileringOption']['action']) {
  if (action === 'DRIVE') return 'text-emerald-200'
  if (action === 'CONSERVE_AND_DRIVE' || action === 'TRAILER_OPTIONAL') {
    return 'text-yellow-100'
  }

  return 'text-[#ff8fcb]'
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
  return source
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

function missionStatusStyle(status: MissionStatus) {
  if (status === 'ON_TARGET' || status === 'FINISH_PUSH') {
    return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  }

  if (status === 'CONSERVE' || status === 'DATA_UNCERTAIN') {
    return 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100'
  }

  return 'border-red-400/40 bg-red-400/10 text-[#ff8fcb]'
}

function missionStatusBannerStyle(status: MissionStatus) {
  if (status === 'ON_TARGET' || status === 'FINISH_PUSH') {
    return 'border-emerald-400/40 bg-emerald-400/10'
  }

  if (status === 'CONSERVE' || status === 'DATA_UNCERTAIN') {
    return 'border-yellow-300/40 bg-yellow-300/10'
  }

  return 'border-red-400/40 bg-red-400/10'
}

function formatMissionStatus(status: MissionStatus) {
  return status.replaceAll('_', ' ')
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
  if (status === 'CONSERVE' || status === 'DATA_UNCERTAIN') return 'caution'
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
    'LEGACY STRATEGY DEBUG SNAPSHOT',
    'Visible Race Captain decisions, logs, and snapshots use AuthoritativeStrategyState.',
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
  if (efficiencyWhPerMile > 55) warningsCount += 1

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


