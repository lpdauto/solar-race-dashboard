'use client'

import Image from 'next/image'
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
import {
  findTeamMemberById,
  teamMembers,
  type TeamMember,
} from '@/data/teamMembers'
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
import {
  emptyPublicRaceCrew,
  loadPublicRaceCrew,
  savePublicRaceCrew,
  type PublicRaceCrewSelection,
} from '@/lib/publicRaceCrew'
import { getLiveTelemetryGpsPosition } from '@/lib/liveTelemetryGps'
import {
  calculatePhysicalMiles,
  calculateScoringMiles,
  calculateScoringMilesRemaining,
  calculateMandatoryTraileringMiles,
} from '@/lib/routeMileage'
import { rx2Config } from '@/lib/race/rx2Config'
import {
  createInitialRaceBatteryState,
  executeBatterySwap,
  forceSwapSocPercent,
  meaningfulSpareAdvantagePercent,
  planSwapSocPercent,
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
  freshTelemetryWindowSeconds,
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
import type { WeatherRisk, WeatherStrategySummary } from '@/types/weather'

type DayCommandCenterProps = {
  raceDay: RaceDay
  initialRole?: PrototypeRole
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

export default function DayCommandCenter({
  raceDay,
  initialRole = 'race-captain',
}: DayCommandCenterProps) {
  const searchParams = useSearchParams()
  const [currentMile, setCurrentMile] = useState(0)
  const [manualMode, setManualMode] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('driver')
  const [prototypeRole, setPrototypeRole] =
    useState<PrototypeRole>(initialRole)
  const [mobileMapExpanded, setMobileMapExpanded] = useState(false)
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
  const [currentCrewDraft, setCurrentCrewDraft] =
    useState<PublicRaceCrewSelection>(emptyPublicRaceCrew)
  const [currentCrewSaved, setCurrentCrewSaved] =
    useState<PublicRaceCrewSelection>(emptyPublicRaceCrew)
  const [currentCrewSaveStatus, setCurrentCrewSaveStatus] = useState('')
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
  const scoringMiles = calculateScoringMiles(raceDay)
  const physicalMiles = calculatePhysicalMiles(raceDay)
  const mandatoryTraileringMiles = calculateMandatoryTraileringMiles(raceDay)
  const scoringMilesRemaining = calculateScoringMilesRemaining({
    raceDay,
    currentMile,
  })
  const telemetryController = useTelemetry({
    currentMile,
    currentSegment,
  })
  const liveGpsPosition = getLiveTelemetryGpsPosition(
    telemetryController.telemetry
  )
  const currentVehicleMapLocation = liveGpsPosition
    ? {
        ...liveGpsPosition,
        label:
          telemetryController.source === 'cloud'
            ? 'Live cloud GPS'
            : 'Live telemetry GPS',
      }
    : undefined
  const geolocation = useGeolocation()
  const queryView = searchParams.get('view')
  const queryNode = searchParams.get('node')
  const navigationQuery = searchParams.toString()
  const activeNavigationSection = navigationSectionFromRole(prototypeRole)
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
        distanceMiles: physicalMiles,
        scoringMiles,
        traileringSolarHours: mandatoryTraileringMiles > 0 ? 0.5 : 0,
        elevationStats,
        carSetup,
      }),
    [carSetup, elevationStats, mandatoryTraileringMiles, physicalMiles, scoringMiles]
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
    ) ?? initialRole

    setPrototypeRole((currentRole) =>
      nextRole === currentRole ? currentRole : nextRole
    )

    const nextNode = searchParams.get('node') as TelemetryNodeId | null

    if (nextNode && nextNode !== telemetryController.cloudNode) {
      telemetryController.setCloudNode(nextNode)
    }
  }, [initialRole, navigationQuery, searchParams, telemetryController.cloudNode, telemetryController.setCloudNode])

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
    let cancelled = false

    async function syncCurrentCrew() {
      const storedCrew = await loadPublicRaceCrew()

      if (!cancelled) {
        setCurrentCrewDraft(storedCrew)
        setCurrentCrewSaved(storedCrew)
      }
    }

    syncCurrentCrew()

    return () => {
      cancelled = true
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

  async function saveCurrentCrew() {
    if (
      currentCrewDraft.driverId &&
      currentCrewDraft.driverId === currentCrewDraft.passengerId
    ) {
      setCurrentCrewSaveStatus('Driver and passenger must be different students.')
      return
    }

    setCurrentCrewSaveStatus('Saving current crew...')
    const result = await savePublicRaceCrew(currentCrewDraft)

    setCurrentCrewSaved(currentCrewDraft)
    setCurrentCrewSaveStatus(
      result.source === 'server'
        ? 'Current crew saved for the public tracker.'
        : result.error ?? 'Current crew saved for this browser.'
    )
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
              Day {raceDay.day}
            </p>
            <h1 className="mt-0.5 text-base font-black text-white sm:mt-1 sm:text-lg">
              {prototypeRoleLabel(prototypeRole)} View
            </h1>
          </div>
          <DayRoleTabs day={raceDay.day} activeRole={prototypeRole} />
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
            <RaceCaptainEnergyCommandCenter
              raceDay={raceDay}
              currentMile={currentMile}
              distanceRemaining={distanceRemaining}
              telemetry={telemetryController.telemetry}
              telemetryAgeSeconds={telemetryController.effectivePacketAgeSeconds}
              telemetryHistory={telemetryController.telemetryHistory}
              raceBatteryState={raceBatteryState}
              authoritativeStrategy={authoritativeStrategy}
              missionStatus={missionStatus}
              raceHealth={raceHealth}
              alerts={raceCaptainAlerts}
              energySimulation={energySimulation}
              carSetup={carSetup}
            />
          </>
        ) : null}

        {prototypeRole === 'strategy' ? (
          <>
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
              weatherSummary={weather.strategySummary}
              weatherDetail={
                <WeatherWindPanel
                  dayNumber={raceDay.day}
                  routePoints={raceDay.routePoints}
                  currentMile={currentMile}
                  currentRaceSpeedMph={telemetryController.telemetry?.speedMph}
                />
              }
            />
            <AccordionSection title="Energy Forecast Debug" lazy>
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
                currentLocation={currentVehicleMapLocation}
                heightClass="h-[420px] md:h-[620px]"
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
                    currentLocation={currentVehicleMapLocation}
                    heightClass="h-[360px]"
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
          <VehicleSystemsPanel
            telemetry={telemetryController.telemetry}
            telemetryStatus={telemetryController.effectiveStatus}
            connectionStatus={telemetryController.effectiveConnectionStatus}
            connectionError={telemetryController.connectionError}
            lastPacketAt={telemetryController.effectiveLastPacketAt}
            packetAgeSeconds={telemetryController.effectivePacketAgeSeconds}
            packetStats={telemetryController.effectivePacketStats}
            cloudPacketStatus={telemetryController.cloudPacketStatus}
            source={telemetryController.source}
            cloudNode={telemetryController.cloudNode}
            cloudHealth={telemetryController.cloudHealth}
            geolocation={geolocation}
            raceBatteryState={raceBatteryState}
          />
        ) : null}

        {prototypeRole === 'operations' ? (
          <>
            <CurrentCrewPanel
              draft={currentCrewDraft}
              saved={currentCrewSaved}
              saveStatus={currentCrewSaveStatus}
              onChange={(selection) => {
                setCurrentCrewDraft(selection)
                setCurrentCrewSaveStatus('')
              }}
              onSave={saveCurrentCrew}
            />

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
                currentLocation={currentVehicleMapLocation}
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
                  <StatusMetric label="Scoring remaining" value={`${scoringMilesRemaining.toFixed(1)} mi`} />
                  <StatusMetric label="Scoring completed" value={`${countingMilesToday.toFixed(1)} mi`} />
                  <StatusMetric label="Mandatory trailering" value={`${mandatoryTraileringMiles.toFixed(1)} mi`} />
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
          <CurrentCrewPanel
            draft={currentCrewDraft}
            saved={currentCrewSaved}
            saveStatus={currentCrewSaveStatus}
            onChange={(selection) => {
              setCurrentCrewDraft(selection)
              setCurrentCrewSaveStatus('')
            }}
            onSave={saveCurrentCrew}
          />

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
          Day {raceDay.day} &gt; {prototypeRoleLabel(role)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:min-w-72">
        {previousDisabled ? (
          <span className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-sm font-bold text-slate-500">
            ← Previous
          </span>
        ) : (
          <Link
            href={dayNavigationHref(previousDay, role, searchParams)}
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
            href={dayNavigationHref(nextDay, role, searchParams)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-center text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10"
          >
            Day {nextDay} →
          </Link>
        )}
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

function DayRoleTabs({
  day,
  activeRole,
}: {
  day: number
  activeRole: PrototypeRole
}) {
  return (
    <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-white/10 bg-black/25 p-1">
      {prototypeRoles.map((roleOption) => {
        const active = roleOption.id === activeRole

        return (
          <Link
            key={roleOption.id}
            href={dayRoleHref(day, roleOption.id)}
            className={`shrink-0 rounded px-3 py-2 text-xs font-black transition ${
              active
                ? 'border border-[#ff3ea5]/40 bg-[#ff3ea5]/20 text-[#ff8fcb]'
                : 'border border-transparent text-slate-200 hover:border-white/10 hover:bg-white/5'
            }`}
          >
            {roleOption.label}
          </Link>
        )
      })}
    </div>
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

function navigationSectionFromRole(role: PrototypeRole): DayNavigationSection {
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
  if (section === 'race-day') return 'Navigation'
  if (section === 'telemetry') return `Vehicle Systems > ${telemetryNodeLabel(node)}`
  if (section === 'setup') return 'Operations'
  if (section === 'reports') return 'Operations'

  return prototypeRoleLabel(role)
}

function dayNavigationHref(
  day: number,
  role: PrototypeRole,
  searchParams: ReturnType<typeof useSearchParams>
) {
  const nextSearchParams = new URLSearchParams()
  const node = searchParams.get('node')

  if (role === 'vehicle-systems' && node) {
    nextSearchParams.set('node', node)
  }

  const query = nextSearchParams.toString()

  return `${dayRoleHref(day, role)}${query ? `?${query}` : ''}`
}

function dayRoleHref(day: number, role: PrototypeRole) {
  return `/day/${day}/${role}`
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
      title: 'GPS Status',
      mainValue: manualMode ? 'MAN' : 'GPS',
      supportingItems: [
        { label: 'Mode', value: manualMode ? 'manual mile' : 'GPS assist' },
        { label: 'GPS', value: manualMode ? 'manual' : 'auto' },
        { label: 'Counting', value: `${countingMilesToday.toFixed(1)} mi` },
        { label: 'Trailered', value: `${traileredMilesToday.toFixed(1)} mi` },
      ],
      statusLabel: manualMode ? 'manual' : 'gps',
      riskLevel: 'neutral',
      actionText: 'Open for GPS assist and manual mile controls.',
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
  missionStatus,
  raceHealth,
  alerts,
  energySimulation,
  carSetup,
}: {
  raceDay: RaceDay
  currentMile: number
  distanceRemaining: number
  telemetry: TelemetryData | null
  telemetryAgeSeconds?: number
  telemetryHistory: TelemetryHistorySample[]
  raceBatteryState: RaceBatteryState
  authoritativeStrategy: AuthoritativeStrategyState
  missionStatus: MissionStatus
  raceHealth: RaceHealth
  alerts: string[]
  energySimulation: ReturnType<typeof simulateDayEnergy>
  carSetup: CarSetup
}) {
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const racePrediction = authoritativeStrategy.prediction
  const batterySwapRecommendation = authoritativeStrategy.swapRecommendation
  const deterministicStrategyRecommendation =
    authoritativeStrategy.strategyRecommendation
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
    currentWhPerMile,
    requiredWhPerMile,
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
      <RaceCaptainCommandBanner
        missionStatus={missionStatus}
        recommendation={deterministicStrategyRecommendation}
        swapRecommendation={batterySwapRecommendation}
        raceHealth={raceHealth}
      />

      <CriticalNumbersGrid
        prediction={racePrediction}
        currentWhPerMile={currentWhPerMile}
        requiredWhPerMile={requiredWhPerMile}
        solarRecoveredWh={racePrediction.projectedSolarRecoveredWh}
        reserveMarginPercent={raceHealth.breakdown.socMarginPercent}
      />

      <NextEventPanel
        prediction={racePrediction}
        speedMph={telemetry?.speedMph}
      />

      <section className="grid gap-4 xl:grid-cols-1">
        <BatteryStrategySummaryPanel
          batteryState={raceBatteryState}
          recommendation={batterySwapRecommendation}
        />
      </section>

      <RaceCaptainAlertsPanel alerts={alerts} />

    </section>
  )
}

function StrategyEngineeringCenter({
  raceDay,
  currentMile,
  distanceRemaining,
  telemetry,
  telemetryAgeSeconds,
  telemetryHistory,
  raceBatteryState,
  authoritativeStrategy,
  onSetActivePack,
  onSetPackSoc,
  onExecuteSwap,
  energySimulation,
  carSetup,
  activeTraileringSession,
  weatherSummary,
  weatherDetail,
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
  weatherSummary: WeatherStrategySummary
  weatherDetail: ReactNode
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
      <StrategySummaryCard
        recommendation={authoritativeStrategy.strategyRecommendation}
        prediction={racePrediction}
        recommendedSpeedMph={authoritativeStrategy.recommendedSpeedMph}
      />

      <section className="grid gap-3 xl:grid-cols-2">
        <CompactEnergyForecast prediction={racePrediction} />
        <CompactBatteryPlan
          batteryState={raceBatteryState}
          finalRecommendation={authoritativeStrategy.strategyRecommendation}
          swapRecommendation={batterySwapRecommendation}
          onExecuteSwap={onExecuteSwap}
        />
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <CompactWeatherStrategy summary={weatherSummary} />
        <CompactTraileringStrategy
          traileringOption={traileringOption}
          prediction={racePrediction}
          activeTraileringSession={activeTraileringSession}
        />
      </section>

      <AccordionSection title="Prediction Engine Metrics" lazy>
        <RacePredictionPanel prediction={racePrediction} />
      </AccordionSection>

      <AccordionSection title="Weather Details" lazy>
        {weatherDetail}
      </AccordionSection>

      {process.env.NODE_ENV === 'development' ? (
        <StrategyPipelineDebugPanel
          telemetry={telemetry}
          telemetryAgeSeconds={telemetryAgeSeconds}
          telemetryHistory={telemetryHistory}
          raceBatteryState={raceBatteryState}
          prediction={racePrediction}
          recommendation={authoritativeStrategy.strategyRecommendation}
          swapRecommendation={batterySwapRecommendation}
          currentWhPerMile={currentWhPerMile}
          requiredWhPerMile={requiredWhPerMile}
        />
      ) : null}
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

function StrategySummaryCard({
  recommendation,
  prediction,
  recommendedSpeedMph,
}: {
  recommendation: DeterministicStrategyRecommendation
  prediction: RacePrediction
  recommendedSpeedMph?: number
}) {
  return (
    <NativeEnergyCard>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff8fcb]">
            Strategy Summary
          </p>
          <h2 className={`mt-1 text-3xl font-black uppercase ${strategyCommandClass(recommendation.command)}`}>
            {recommendation.title}
          </h2>
          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-300">
            {recommendation.reason}
          </p>
        </div>
        <span
          className={`w-fit rounded border px-2 py-1 text-xs font-black uppercase tracking-[0.14em] ${predictionConfidenceClass(
            recommendation.confidence
          )}`}
        >
          {recommendation.confidence} confidence
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <StatusMetric label="Next Stop SOC" value={formatPredictionSoc(prediction.projectedNextStopSocPercent)} />
        <StatusMetric label="Projected Finish SOC" value={formatPredictionSoc(prediction.projectedEndDaySocPercent)} />
        <StatusMetric label="Forecast Net Energy" value={formatForecastNetEnergy(prediction.projectedNetEnergyWh)} />
        <StatusMetric label="Cruise Speed" value={formatSpeed(recommendedSpeedMph)} />
        <StatusMetric label="Confidence" value={recommendation.confidence} />
        <StatusMetric label="Warnings" value={String(recommendation.warnings.length)} />
      </div>
    </NativeEnergyCard>
  )
}

function CompactEnergyForecast({ prediction }: { prediction: RacePrediction }) {
  return (
    <NativeEnergyCard>
      <NativeEnergyTitle title="Energy Forecast" />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <StatusMetric label="Drive Energy" value={formatEnergyWh(prediction.projectedDriveEnergyWh)} />
        <StatusMetric label="Solar Recovery" value={formatEnergyWh(prediction.projectedSolarRecoveredWh)} />
        <StatusMetric label="Forecast Net Energy" value={formatForecastNetEnergy(prediction.projectedNetEnergyWh)} />
        <StatusMetric label="Finish SOC" value={formatPredictionSoc(prediction.projectedEndDaySocPercent)} />
      </div>
    </NativeEnergyCard>
  )
}

function CompactBatteryPlan({
  batteryState,
  finalRecommendation,
  swapRecommendation,
  onExecuteSwap,
}: {
  batteryState: RaceBatteryState
  finalRecommendation: DeterministicStrategyRecommendation
  swapRecommendation: BatterySwapRecommendation
  onExecuteSwap: () => void
}) {
  const activePack = batteryState.packs[batteryState.activePackId]
  const sparePack =
    batteryState.packs[batteryState.activePackId === 'A' ? 'B' : 'A']
  const canExecuteSwap = finalRecommendation.command === 'swap_now'
  const nextStopSoc =
    finalRecommendation.supportingData.projectedNextStopSocPercent ??
    swapRecommendation.projectedNextStopSocPercent
  const finishSoc =
    finalRecommendation.supportingData.projectedEndDaySocPercent ??
    swapRecommendation.projectedEndDaySocPercent

  return (
    <NativeEnergyCard>
      <NativeEnergyTitle title="Battery Plan" />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <StatusMetric label="Active Pack" value={`${activePack.id} / ${activePack.socPercent.toFixed(0)}%`} />
        <StatusMetric label="Spare Pack" value={`${sparePack.id} / ${sparePack.socPercent.toFixed(0)}%`} />
        <StatusMetric label="Recommendation" value={finalRecommendation.title} />
        <StatusMetric label="Next Stop SOC" value={formatPredictionSoc(nextStopSoc)} />
        <StatusMetric label="Finish SOC" value={formatPredictionSoc(finishSoc)} />
        <StatusMetric label="Confidence" value={finalRecommendation.confidence} />
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-slate-300">{finalRecommendation.reason}</p>
        {canExecuteSwap ? (
          <button
            type="button"
            onClick={onExecuteSwap}
            className="h-9 shrink-0 rounded-md border border-[#ff3ea5]/50 bg-[#ff3ea5]/15 px-3 text-xs font-black uppercase tracking-wide text-[#ff8fcb] transition hover:bg-[#ff3ea5]/25"
          >
            Execute Swap
          </button>
        ) : null}
      </div>
    </NativeEnergyCard>
  )
}

function CompactWeatherStrategy({
  summary,
}: {
  summary: WeatherStrategySummary
}) {
  return (
    <NativeEnergyCard>
      <NativeEnergyTitle title="Weather Strategy" />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <StatusMetric label="Wind Impact" value={`${summary.maxHeadwindMph.toFixed(1)} mph headwind`} />
        <StatusMetric label="Solar Impact" value={`${summary.averageSolarRadiationWm2.toFixed(0)} W/m2`} />
        <StatusMetric label="Speed Adjustment" value={`${summary.recommendedSpeedAdjustmentMph} mph`} />
        <StatusMetric label="Risk" value={summary.weatherRisk} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        {summary.notes[0] ?? 'Weather does not require a strategy adjustment right now.'}
      </p>
    </NativeEnergyCard>
  )
}

function CompactTraileringStrategy({
  traileringOption,
  prediction,
  activeTraileringSession,
}: {
  traileringOption?: AuthoritativeStrategyState['traileringRecommendation']
  prediction: RacePrediction
  activeTraileringSession: boolean
}) {
  return (
    <NativeEnergyCard>
      <NativeEnergyTitle title="Trailering Strategy" />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <StatusMetric label="Recommendation" value={traileringOption?.action ?? 'DRIVE'} />
        <StatusMetric label="Energy Saved" value={formatEnergyWh(traileringOption?.estimatedEnergySavedWh)} />
        <StatusMetric
          label="Mileage Penalty"
          value={traileringOption ? `${traileringOption.mileagePenalty.toFixed(1)} mi` : '--'}
        />
        <StatusMetric label="SOC Impact" value={formatPredictionSoc(prediction.projectedEndDaySocPercent)} />
        <StatusMetric label="Active" value={activeTraileringSession ? 'yes' : 'no'} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        {traileringOption?.reason ?? 'Drive the current route section.'}
      </p>
    </NativeEnergyCard>
  )
}

function StrategyPipelineDebugPanel({
  telemetry,
  telemetryAgeSeconds,
  telemetryHistory,
  raceBatteryState,
  prediction,
  recommendation,
  swapRecommendation,
  currentWhPerMile,
  requiredWhPerMile,
}: {
  telemetry: TelemetryData | null
  telemetryAgeSeconds?: number
  telemetryHistory: TelemetryHistorySample[]
  raceBatteryState: RaceBatteryState
  prediction: RacePrediction
  recommendation: DeterministicStrategyRecommendation
  swapRecommendation: BatterySwapRecommendation
  currentWhPerMile: number
  requiredWhPerMile: number
}) {
  const activePack = raceBatteryState.packs[raceBatteryState.activePackId]
  const sparePack =
    raceBatteryState.packs[raceBatteryState.activePackId === 'A' ? 'B' : 'A']
  const spareAdvantagePercent = sparePack.socPercent - activePack.socPercent
  const swapAllowed =
    spareAdvantagePercent >= meaningfulSpareAdvantagePercent
  const consistencyFindings = checkStrategyConsistency({
    telemetry,
    prediction,
    recommendation,
    swapRecommendation,
    activeSocPercent: activePack.socPercent,
    spareSocPercent: sparePack.socPercent,
    currentWhPerMile,
    requiredWhPerMile,
  })
  const trigger = strategyTriggerExplanation({
    recommendation,
    swapRecommendation,
    prediction,
    activeSocPercent: activePack.socPercent,
  })
  const dataSource = strategyDataSourceSummary({
    telemetry,
    telemetryAgeSeconds,
    telemetryHistory,
    prediction,
    recommendation,
  })

  return (
    <AccordionSection title="Strategy Pipeline Debug" lazy>
      <div className="grid gap-3">
        <MiniPanel title="Strategy Inputs">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StatusMetric label="Active Battery SOC" value={`${activePack.socPercent.toFixed(1)}%`} />
            <StatusMetric label="Spare Battery SOC" value={`${sparePack.socPercent.toFixed(1)}%`} />
            <StatusMetric label="Current Wh/mi" value={`${currentWhPerMile.toFixed(0)} Wh/mi`} />
            <StatusMetric label="Required Wh/mi" value={`${requiredWhPerMile.toFixed(0)} Wh/mi`} />
            <StatusMetric label="Projected Drive Energy" value={formatEnergyWh(prediction.projectedDriveEnergyWh)} />
            <StatusMetric label="Projected Solar Recovery" value={formatEnergyWh(prediction.projectedSolarRecoveredWh)} />
            <StatusMetric label="Projected Finish SOC" value={formatPredictionSoc(prediction.projectedEndDaySocPercent)} />
            <StatusMetric label="Forecast Net Energy" value={formatForecastNetEnergy(prediction.projectedNetEnergyWh)} />
            <StatusMetric label="Recommended Action" value={recommendation.title} />
            <StatusMetric label="Confidence Source" value={dataSource.confidenceSource} />
            <StatusMetric label="Data Source" value={dataSource.primarySource} />
            <StatusMetric label="Telemetry Age" value={formatTelemetryAge(telemetryAgeSeconds)} />
            <StatusMetric label="Spare Advantage" value={`${spareAdvantagePercent.toFixed(1)}%`} />
            <StatusMetric label="Swap Threshold" value={`${meaningfulSpareAdvantagePercent}%`} />
            <StatusMetric label="Swap Guard" value={swapAllowed ? 'allowed' : 'blocked'} />
            <StatusMetric label="Final Recommendation" value={recommendation.title} />
          </div>
        </MiniPanel>

        <MiniPanel title="Decision Reasoning">
          <div className="grid gap-2 sm:grid-cols-2">
            <StatusMetric label="Recommendation" value={recommendation.title} />
            <StatusMetric label="Trigger" value={trigger.trigger} />
            <StatusMetric label="Threshold" value={trigger.threshold} />
            <StatusMetric label="Value Used" value={trigger.value} />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {recommendation.reason}
          </p>
        </MiniPanel>

        <MiniPanel title="Consistency Checker">
          {consistencyFindings.length > 0 ? (
            <div className="grid gap-2">
              {consistencyFindings.map((finding) => (
                <p
                  key={finding}
                  className="rounded-md border border-yellow-300/30 bg-yellow-300/10 p-2 text-xs font-semibold leading-5 text-yellow-100"
                >
                  {finding}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate-400">
              No obvious cross-panel inconsistencies detected.
            </p>
          )}
        </MiniPanel>
      </div>
    </AccordionSection>
  )
}

function checkStrategyConsistency({
  telemetry,
  prediction,
  recommendation,
  swapRecommendation,
  activeSocPercent,
  spareSocPercent,
  currentWhPerMile,
  requiredWhPerMile,
}: {
  telemetry: TelemetryData | null
  prediction: RacePrediction
  recommendation: DeterministicStrategyRecommendation
  swapRecommendation: BatterySwapRecommendation
  activeSocPercent: number
  spareSocPercent: number
  currentWhPerMile: number
  requiredWhPerMile: number
}) {
  const findings: string[] = []
  const batteriesEffectivelyEqual = Math.abs(activeSocPercent - spareSocPercent) < 2

  if (swapRecommendation.action === 'swap_now' && batteriesEffectivelyEqual) {
    findings.push(
      'Swap is recommended while active and spare SOC are effectively equal. Check projected next-stop/end-segment SOC trigger.'
    )
  }

  if (
    (prediction.projectedEndDaySocPercent ?? 0) >= 95 &&
    (prediction.projectedNetEnergyWh ?? 0) < -5000
  ) {
    findings.push(
      'Finish SOC is near 100% while net energy balance is strongly negative. This usually means solar/stop recovery or clamping is masking a visible deficit.'
    )
  }

  if (
    currentWhPerMile < requiredWhPerMile &&
    (recommendation.command === 'swap_now' || recommendation.severity === 'urgent')
  ) {
    findings.push(
      'Current Wh/mi is below required Wh/mi while an urgent action is active. The trigger is likely SOC projection, stale telemetry, or swap planning, not efficiency.'
    )
  }

  if (!telemetry) {
    findings.push('No telemetry packet is available; prediction is using fallback/default inputs.')
  }

  if (prediction.confidence === 'low') {
    findings.push(`Prediction confidence is low: ${prediction.warnings[0] ?? 'see prediction warnings.'}`)
  }

  return findings
}

function strategyTriggerExplanation({
  recommendation,
  swapRecommendation,
  prediction,
  activeSocPercent,
}: {
  recommendation: DeterministicStrategyRecommendation
  swapRecommendation: BatterySwapRecommendation
  prediction: RacePrediction
  activeSocPercent: number
}) {
  if (swapRecommendation.action === 'swap_now') {
    return {
      trigger: 'swapRecommendation.action === swap_now',
      threshold: `force swap ${forceSwapSocPercent}% / absolute minimum ${rx2Config.absoluteMinimumSocPercent}%`,
      value: `next stop ${formatPredictionSoc(prediction.projectedNextStopSocPercent)}, end segment ${formatPredictionSoc(prediction.projectedEndSegmentSocPercent)}, active ${activeSocPercent.toFixed(1)}%`,
    }
  }

  if (recommendation.command === 'swap_now') {
    return {
      trigger: 'strategyRecommendation.command === swap_now',
      threshold: `force swap ${forceSwapSocPercent}%`,
      value: `next stop ${formatPredictionSoc(prediction.projectedNextStopSocPercent)}, end segment ${formatPredictionSoc(prediction.projectedEndSegmentSocPercent)}`,
    }
  }

  if (recommendation.command === 'reduce_speed') {
    return {
      trigger: 'efficiency/SOC/thermal reduce-speed rule',
      threshold: `Wh/mi > 55 or next stop < ${planSwapSocPercent}% or end day < reserve`,
      value: `predicted ${prediction.predictedWhPerMile.toFixed(0)} Wh/mi, next stop ${formatPredictionSoc(prediction.projectedNextStopSocPercent)}`,
    }
  }

  return {
    trigger: recommendation.command,
    threshold: 'first matching deterministic strategy rule',
    value: recommendation.reason,
  }
}

function strategyDataSourceSummary({
  telemetry,
  telemetryAgeSeconds,
  telemetryHistory,
  prediction,
  recommendation,
}: {
  telemetry: TelemetryData | null
  telemetryAgeSeconds?: number
  telemetryHistory: TelemetryHistorySample[]
  prediction: RacePrediction
  recommendation: DeterministicStrategyRecommendation
}) {
  const stale =
    telemetryAgeSeconds !== undefined &&
    telemetryAgeSeconds > freshTelemetryWindowSeconds
  const primarySource = !telemetry
    ? 'fallback'
    : telemetry.source === 'simulator'
      ? 'simulator'
      : stale
        ? 'stale telemetry'
        : 'telemetry'
  const confidenceSource = [
    prediction.confidence === 'low' ? 'prediction low' : '',
    stale ? 'stale telemetry' : '',
    telemetryHistory.length > 1 ? 'rolling history' : 'latest/fallback',
    recommendation.warnings.length ? `${recommendation.warnings.length} warning(s)` : '',
  ].filter(Boolean).join(' + ')

  return {
    primarySource,
    confidenceSource: confidenceSource || prediction.confidence,
  }
}

function RaceCaptainCommandBanner({
  missionStatus,
  recommendation,
  swapRecommendation,
  raceHealth,
}: {
  missionStatus: MissionStatus
  recommendation: DeterministicStrategyRecommendation
  swapRecommendation: BatterySwapRecommendation
  raceHealth: RaceHealth
}) {
  const recommendedAction =
    swapRecommendation.action === 'no_swap'
      ? recommendation.title
      : formatSwapPlannerAction(swapRecommendation.action)

  return (
    <section className={`rounded-lg border p-3 shadow-xl shadow-black/20 sm:p-4 ${missionStatusBannerStyle(missionStatus)}`}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.7fr)] lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">
            Command Decision
          </p>
          <h2 className={`mt-1 text-3xl font-black uppercase sm:text-4xl ${strategyCommandClass(recommendation.command)}`}>
            {recommendedAction}
          </h2>
          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-100">
            Reason: {recommendation.reason}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <CommandMetric label="Mission" value={formatMissionStatus(missionStatus)} />
          <CommandMetric
            label="Speed"
            value={formatSpeed(recommendation.recommendedSpeedMph)}
          />
          <CommandMetric
            label="Health"
            value={`${raceHealth.score} / 100`}
          />
          <CommandMetric label="Urgency" value={recommendation.severity} />
          <CommandMetric label="Confidence" value={recommendation.confidence} />
          <CommandMetric label="Warnings" value={String(recommendation.warnings.length)} />
        </div>
      </div>
    </section>
  )
}

function CriticalNumbersGrid({
  prediction,
  currentWhPerMile,
  requiredWhPerMile,
  solarRecoveredWh,
  reserveMarginPercent,
}: {
  prediction: RacePrediction
  currentWhPerMile: number
  requiredWhPerMile: number
  solarRecoveredWh?: number
  reserveMarginPercent?: number
}) {
  return (
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
      <CommandMetric
        label="Current Wh/mi"
        value={`${currentWhPerMile.toFixed(0)} Wh/mi`}
      />
      <CommandMetric
        label="Required Wh/mi"
        value={`${requiredWhPerMile.toFixed(0)} Wh/mi`}
      />
      <CommandMetric
        label="Next Stop SOC"
        value={formatPredictionSoc(prediction.projectedNextStopSocPercent)}
      />
      <CommandMetric
        label="Finish SOC"
        value={formatPredictionSoc(prediction.projectedEndDaySocPercent)}
      />
      <CommandMetric
        label="Reserve Margin"
        value={
          reserveMarginPercent !== undefined
            ? `${reserveMarginPercent.toFixed(1)}%`
            : '--'
        }
      />
      <CommandMetric
        label="Solar Recovery"
        value={formatEnergyWh(solarRecoveredWh)}
      />
    </section>
  )
}

function RaceCaptainAlertsPanel({ alerts }: { alerts: string[] }) {
  const visibleAlerts = alerts.slice(0, 4)
  const hiddenAlerts = alerts.slice(4)

  return (
    <MiniPanel title={`Alerts (${alerts.length})`}>
      {alerts.length > 0 ? (
        <div className="grid gap-2">
          {visibleAlerts.map((alert) => (
            <AlertMessage key={alert} alert={alert} />
          ))}
          {hiddenAlerts.length > 0 ? (
            <details className="rounded-md border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm font-black text-[#ff8fcb]">
                Show all alerts ({hiddenAlerts.length} more)
              </summary>
              <div className="mt-3 grid gap-2">
                {hiddenAlerts.map((alert) => (
                  <AlertMessage key={alert} alert={alert} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-400">
          No active race captain alerts.
        </p>
      )}
    </MiniPanel>
  )
}

function AlertMessage({ alert }: { alert: string }) {
  return (
    <p className="rounded-md border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-xs font-semibold leading-5 text-yellow-100 sm:text-sm">
      {alert}
    </p>
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

export function formatForecastNetEnergy(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '--'

  const magnitude =
    Math.abs(value) >= 1000
      ? `${(Math.abs(value) / 1000).toFixed(2)} kWh`
      : `${Math.abs(value).toFixed(0)} Wh`

  if (value < 0) return `+${magnitude} surplus`
  if (value > 0) return `-${magnitude} deficit`

  return '0 Wh balanced'
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

function VehicleSystemsPanel({
  telemetry,
  telemetryStatus,
  connectionStatus,
  connectionError,
  lastPacketAt,
  packetAgeSeconds,
  packetStats,
  cloudPacketStatus,
  source,
  cloudNode,
  cloudHealth,
  geolocation,
  raceBatteryState,
}: {
  telemetry: TelemetryData | null
  telemetryStatus: TelemetryConnectionStatus
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  connectionError?: string
  lastPacketAt?: number
  packetAgeSeconds?: number
  packetStats: TelemetryPacketStats
  cloudPacketStatus: CloudTelemetryPacketStatus | null
  source: TelemetrySource
  cloudNode: TelemetryNodeId
  cloudHealth: CloudTelemetryHealth | null
  geolocation: ReturnType<typeof useGeolocation>
  raceBatteryState: RaceBatteryState
}) {
  const vehicleFreshness = classifyDataFreshness(
    source === 'cloud' && cloudHealth
      ? cloudHealth.latestVehiclePacketAgeSeconds ?? undefined
      : packetAgeSeconds
  )
  const canTrustCloudPacket =
    source === 'cloud' && vehicleFreshness.vehicleStatus !== 'offline'
  const trustedCloudPacketStatus = canTrustCloudPacket ? cloudPacketStatus : null
  const displayedGps = getDisplayedGpsStatus({
    source,
    telemetry,
    geolocation,
  })
  const gpsAgeSeconds = displayedGps.ageSeconds
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
    cloudHealth?.vehicleTelemetryFresh !== false &&
    trustedCloudPacketStatus?.telemetryFresh !== false
      ? 'true'
      : 'false'
  const lastCloudUpdateAt =
    source === 'cloud' && cloudHealth
      ? cloudHealth.latestVehicleUpdatedAt
      : cloudPacketStatus?.updatedAt ?? cloudHealth?.latestVehicleUpdatedAt ?? null
  const displayedPacketAgeSeconds =
    source === 'cloud' && cloudHealth
      ? cloudHealth.latestVehiclePacketAgeSeconds ?? undefined
      : packetAgeSeconds
  const activeBatteryId = raceBatteryState.activePackId
  const batteryAIsActive = activeBatteryId === 'A'
  const batteryBIsActive = activeBatteryId === 'B'

  return (
    <section className="grid gap-4">
      <SystemAccordion title="Vehicle" status={displayedVehicleNodeStatus} tone={vehicleFreshness.tone} defaultOpen>
        <SystemSubsection title="Info">
          <SystemMetricGrid>
            <StatusMetric label="Speed" value={formatSpeed(telemetry?.speedMph)} />
            <StatusMetric label="SOC" value={formatPercent(telemetry?.batterySocPercent)} />
            <StatusMetric label="Wh/mi" value={formatWhPerMile(telemetry?.efficiencyWhPerMile ?? telemetry?.whPerMile)} />
            <StatusMetric label="Voltage" value={formatVolts(telemetry?.batteryVoltage)} />
            <StatusMetric label="Current" value={formatAmps(telemetry?.batteryCurrent)} />
            <StatusMetric label="Battery temp" value={formatTemperatureF(telemetry?.batteryTempC)} />
            <StatusMetric label="Controller temp" value={formatTemperatureF(telemetry?.controllerTempC)} />
            <StatusMetric label="Motor temp" value={formatTemperatureF(telemetry?.motorTempC)} />
          </SystemMetricGrid>
        </SystemSubsection>
        <SystemSubsection title="Connection">
          <SystemMetricGrid>
            <ConnectionField label="Vehicle ESP32 status" value={displayedVehicleNodeStatus} tone={vehicleFreshness.tone} />
            <StatusMetric label="Last vehicle packet" value={formatTimestamp(lastCloudUpdateAt ?? lastPacketAt)} />
            <StatusMetric label="Vehicle packet age" value={formatSeconds(displayedPacketAgeSeconds)} />
            <StatusMetric label="Packet rate" value={`${displayedPacketRateHz.toFixed(2)} Hz`} />
            <StatusMetric label="Telemetry fresh" value={displayedTelemetryFresh} />
            <StatusMetric label="Source" value={displayedSource} />
            <StatusMetric label="Node" value={cloudNode} />
            <StatusMetric label="Status message" value={connectionError ?? cloudPacketStatus?.connectionStatus ?? '--'} />
          </SystemMetricGrid>
        </SystemSubsection>
      </SystemAccordion>

      <BatterySystemAccordion
        title="Battery A"
        packId="A"
        isActive={batteryAIsActive}
        batteryState={raceBatteryState}
        telemetry={batteryAIsActive ? telemetry : null}
        vehicleFreshness={vehicleFreshness}
        source={displayedSource}
        lastPacketAt={lastCloudUpdateAt ?? lastPacketAt}
        packetAgeSeconds={displayedPacketAgeSeconds}
        connectionError={connectionError}
      />

      <BatterySystemAccordion
        title="Battery B"
        packId="B"
        isActive={batteryBIsActive}
        batteryState={raceBatteryState}
        telemetry={batteryBIsActive ? telemetry : null}
        vehicleFreshness={vehicleFreshness}
        source={displayedSource}
        lastPacketAt={lastCloudUpdateAt ?? lastPacketAt}
        packetAgeSeconds={displayedPacketAgeSeconds}
        connectionError={connectionError}
      />

      <SystemAccordion
        title="Cloud"
        status={displayedBackendStatus === 'connected' ? 'Connected' : 'Backend unavailable'}
        tone={displayedBackendStatus === 'connected' ? 'healthy' : 'danger'}
        defaultOpen
      >
        <SystemSubsection title="Info">
          <SystemMetricGrid>
            <ConnectionField
              label="Cloud backend status"
              value={displayedBackendStatus === 'connected' ? 'Connected' : 'Unavailable'}
              tone={displayedBackendStatus === 'connected' ? 'healthy' : 'danger'}
            />
            <ConnectionField
              label="Redis/API status"
              value={cloudHealth?.redis ?? 'not_configured'}
              tone={cloudHealth?.redis === 'connected' ? 'healthy' : cloudHealth?.redis === 'error' ? 'danger' : 'neutral'}
            />
            <StatusMetric label="Latest cloud packet" value={formatTimestamp(cloudHealth?.latestVehicleUpdatedAt)} />
            <StatusMetric label="Latest updated time" value={formatTimestamp(cloudPacketStatus?.updatedAt)} />
          </SystemMetricGrid>
        </SystemSubsection>
        <SystemSubsection title="Connection">
          <SystemMetricGrid>
          <ConnectionField
            label="Cloud telemetry status"
            value={displayedBackendStatus === 'connected' ? 'connected' : 'unavailable'}
            tone={displayedBackendStatus === 'connected' ? 'healthy' : 'danger'}
          />
          <ConnectionField
            label="Backend/API endpoint"
            value={displayedHealthEndpoint}
            tone={displayedHealthEndpoint === 'healthy' ? 'healthy' : 'danger'}
          />
          <ConnectionField
            label="Redis configured"
            value={cloudHealth?.redis ?? 'not_configured'}
            tone={cloudHealth?.redis === 'connected' ? 'healthy' : cloudHealth?.redis === 'error' ? 'danger' : 'neutral'}
          />
            <StatusMetric label="Last cloud packet age" value={formatSeconds(cloudHealth?.latestVehiclePacketAgeSeconds)} />
            <StatusMetric label="Last Redis read" value={formatTimestamp(cloudHealth?.lastRedisReadAt)} />
            <StatusMetric label="Health node" value={cloudHealth?.latestVehicleNode ?? '--'} />
            <StatusMetric label="Status message" value={cloudHealth?.error ?? connectionError ?? '--'} />
          </SystemMetricGrid>
        </SystemSubsection>
      </SystemAccordion>

      <SystemAccordion
        title="GPS"
        status={displayedGps.hasFix ? 'Live fix' : 'No fix'}
        tone={displayedGps.hasFix ? gpsFreshness.tone : 'neutral'}
      >
        <SystemSubsection title="Info">
          <SystemMetricGrid>
            <StatusMetric label="GPS provider" value={displayedGps.permission} />
            <ConnectionField label="GPS fix status" value={displayedGps.hasFix ? 'available' : 'unavailable'} tone={displayedGps.hasFix ? gpsFreshness.tone : 'neutral'} />
            <StatusMetric label="Latitude/longitude" value={displayedGps.latLon} />
            <StatusMetric label="Satellites" value={displayedGps.satellites} />
            <StatusMetric label="Heading" value={displayedGps.heading} />
            <StatusMetric label="Altitude" value={displayedGps.altitude} />
            <StatusMetric label="GPS age" value={displayedGps.age} />
          </SystemMetricGrid>
        </SystemSubsection>
        <SystemSubsection title="Connection">
          <SystemMetricGrid>
            <StatusMetric label="GPS source" value={displayedGps.permission} />
            <ConnectionField label="Vehicle GPS dependency/status" value={displayedVehicleNodeStatus} tone={vehicleFreshness.tone} />
            <StatusMetric label="Last GPS packet" value={formatTimestamp(lastCloudUpdateAt ?? lastPacketAt)} />
            <StatusMetric label="GPS packet age" value={displayedGps.age} />
            <StatusMetric label="Status message" value={displayedGps.hasFix ? 'Vehicle GPS fix available' : 'Waiting for vehicle GPS fix'} />
          </SystemMetricGrid>
        </SystemSubsection>
      </SystemAccordion>
    </section>
  )
}

function getDisplayedGpsStatus({
  source,
  telemetry,
  geolocation,
}: {
  source: TelemetrySource
  telemetry: TelemetryData | null
  geolocation: ReturnType<typeof useGeolocation>
}) {
  const telemetryHasCoordinates = hasValidGpsCoordinates(
    telemetry?.gpsLat,
    telemetry?.gpsLng
  )
  const useTelemetryGps =
    source === 'cloud' ||
    source === 'esp32' ||
    source === 'mock-esp32' ||
    source === 'simulator'
  const latitude = useTelemetryGps ? telemetry?.gpsLat : geolocation.latitude
  const longitude = useTelemetryGps ? telemetry?.gpsLng : geolocation.longitude
  const hasCoordinates = hasValidGpsCoordinates(latitude, longitude)
  const hasFix =
    telemetryHasCoordinates ||
    (useTelemetryGps && telemetry?.gpsFix === true) ||
    (!useTelemetryGps &&
      geolocation.latitude !== null &&
      geolocation.longitude !== null)
  const telemetryGpsAgeSeconds =
    typeof telemetry?.gpsAgeMs === 'number' && Number.isFinite(telemetry.gpsAgeMs)
      ? Math.max(0, Math.round(telemetry.gpsAgeMs / 1000))
      : undefined
  const browserGpsAgeSeconds = geolocation.timestamp
    ? Math.max(0, Math.round((Date.now() - geolocation.timestamp) / 1000))
    : undefined
  const ageSeconds = useTelemetryGps
    ? telemetryGpsAgeSeconds
    : browserGpsAgeSeconds
  const permission = useTelemetryGps
    ? source === 'cloud'
      ? 'cloud'
      : 'not required'
    : geolocation.status

  const latLon =
    hasCoordinates &&
    typeof latitude === 'number' &&
    typeof longitude === 'number'
      ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
      : '--'

  return {
    permission,
    permissionTone: gpsPermissionTone(permission, geolocation.status),
    hasFix,
    ageSeconds,
    latLon,
    age: ageSeconds !== undefined ? `${ageSeconds}s` : '--',
    satellites: formatOptionalNumber(telemetry?.gpsSatellites, 0),
    heading: formatDegrees(telemetry?.gpsHeading),
    altitude:
      typeof telemetry?.gpsElevationFt === 'number' &&
      Number.isFinite(telemetry.gpsElevationFt)
        ? `${telemetry.gpsElevationFt.toFixed(0)} ft`
        : '--',
  }
}

function SystemAccordion({
  title,
  status,
  tone,
  defaultOpen = false,
  children,
}: {
  title: string
  status: string
  tone: 'healthy' | 'warning' | 'danger' | 'neutral'
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details
      className="group rounded-lg border border-white/10 bg-white/[0.045] shadow-xl shadow-black/20"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-[#ff3ea5]/25 bg-[#ff3ea5]/12 p-3 transition hover:bg-[#ff3ea5]/18 group-open:bg-[#ff3ea5]/16 sm:p-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
            {title}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-300">
            Info + connection diagnostics
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ConnectionBadge value={status} tone={tone} />
          <span className="text-xs font-black uppercase tracking-[0.12em] text-[#ff8fcb] group-open:hidden">
            OPEN
          </span>
          <span className="hidden text-xs font-black uppercase tracking-[0.12em] text-[#ff8fcb] group-open:inline">
            CLOSE
          </span>
        </div>
      </summary>
      <div className="grid gap-3 border-t border-white/10 p-3 sm:p-4">
        {children}
      </div>
    </details>
  )
}

function SystemSubsection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  )
}

function SystemMetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  )
}

function ConnectionBadge({
  value,
  tone,
}: {
  value: string
  tone: 'healthy' | 'warning' | 'danger' | 'neutral'
}) {
  const toneClass =
    tone === 'healthy'
      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
      : tone === 'warning'
        ? 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100'
        : tone === 'danger'
          ? 'border-red-400/30 bg-red-400/10 text-red-200'
          : 'border-slate-300/20 bg-slate-300/10 text-slate-300'

  return (
    <span className={`rounded border px-2 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${toneClass}`}>
      {value}
    </span>
  )
}

function BatterySystemAccordion({
  title,
  packId,
  isActive,
  batteryState,
  telemetry,
  vehicleFreshness,
  source,
  lastPacketAt,
  packetAgeSeconds,
  connectionError,
}: {
  title: string
  packId: BatteryPackId
  isActive: boolean
  batteryState: RaceBatteryState
  telemetry: TelemetryData | null
  vehicleFreshness: ReturnType<typeof classifyDataFreshness>
  source: string
  lastPacketAt?: string | number | null
  packetAgeSeconds?: number
  connectionError?: string
}) {
  const pack = batteryState.packs[packId]
  const status = isActive ? vehicleNodeStatusLabel(vehicleFreshness.vehicleStatus) : 'Not configured'
  const tone = isActive ? vehicleFreshness.tone : 'neutral'

  return (
    <SystemAccordion title={title} status={status} tone={tone}>
      <SystemSubsection title="Info">
        <SystemMetricGrid>
          <StatusMetric label="SOC" value={isActive ? formatPercent(telemetry?.batterySocPercent ?? pack.socPercent) : `${pack.socPercent.toFixed(1)}%`} />
          <StatusMetric label="Voltage" value={isActive ? formatVolts(telemetry?.batteryVoltage) : '--'} />
          <StatusMetric label="Current" value={isActive ? formatAmps(telemetry?.batteryCurrent) : '--'} />
          <StatusMetric label="Power" value={isActive ? formatWatts(telemetry?.batteryPowerWatts) : '--'} />
          <StatusMetric label="Temp" value={isActive ? formatTemperatureF(telemetry?.batteryTempC) : '--'} />
          <StatusMetric label="Health/status" value={isActive ? vehicleFreshness.label : 'Not configured'} />
        </SystemMetricGrid>
      </SystemSubsection>
      <SystemSubsection title="Connection">
        <SystemMetricGrid>
          <ConnectionField label={`${title} ESP32 status`} value={status} tone={tone} />
          <StatusMetric label="Last packet" value={isActive ? formatTimestamp(lastPacketAt) : '--'} />
          <StatusMetric label="Packet age" value={isActive ? formatSeconds(packetAgeSeconds) : '--'} />
          <StatusMetric label="Telemetry fresh" value={isActive && vehicleFreshness.vehicleStatus === 'online' ? 'true' : 'false'} />
          <StatusMetric label="Source" value={isActive ? source : 'Not configured'} />
          <StatusMetric label="Status message" value={isActive ? connectionError ?? 'Using active vehicle pack telemetry' : 'Standalone BMS feed not configured'} />
        </SystemMetricGrid>
      </SystemSubsection>
    </SystemAccordion>
  )
}

function hasValidGpsCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined
) {
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  )
}

function gpsPermissionTone(
  permission: string,
  browserStatus: ReturnType<typeof useGeolocation>['status']
): 'healthy' | 'warning' | 'danger' | 'neutral' {
  if (permission === 'cloud' || permission === 'not required') return 'healthy'
  if (browserStatus === 'watching') return 'healthy'
  if (browserStatus === 'error' || browserStatus === 'permission-denied') {
    return 'danger'
  }

  return 'neutral'
}

function formatOptionalNumber(value: number | undefined, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : '--'
}

function formatDegrees(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(0)} deg`
    : '--'
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
  cloudHealth,
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
  cloudHealth: CloudTelemetryHealth | null
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
  const vehicleSourceStatus =
    source === 'cloud' && cloudHealth?.vehicleNodeStatus
      ? cloudHealth.vehicleNodeStatus
      : null
  const sourceStatusLabel = vehicleSourceStatus
    ? vehicleNodeStatusLabel(vehicleSourceStatus)
    : status
  const sourceStatusClass = vehicleSourceStatus
    ? vehicleSourceStatus === 'online'
      ? statusStyles.connected
      : vehicleSourceStatus === 'stale'
        ? statusStyles.warning
        : statusStyles.disconnected
    : statusStyles[status]
  const cloudConnectionLabel =
    source === 'cloud'
      ? cloudHealth?.cloudBackendStatus === 'connected'
        ? 'Cloud Backend Connected'
        : 'Cloud Backend Unavailable'
      : connectionStatus

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
        <Badge label={sourceStatusLabel} className={sourceStatusClass} />
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
          health={cloudHealth}
        />
      </div>

      <div className="mt-3 grid gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm sm:grid-cols-3">
        <LogMetric label="Source" value={telemetrySourceLabel(source)} />
        <LogMetric
          label={source === 'cloud' ? 'Cloud Backend' : 'Connection'}
          value={cloudConnectionLabel}
        />
        <LogMetric
          label="Last Vehicle Packet"
          value={
            source === 'cloud' && cloudHealth
              ? formatSeconds(cloudHealth.latestVehiclePacketAgeSeconds)
              : formatLastPacketAge(lastPacketAt)
          }
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

function CurrentCrewPanel({
  draft,
  saved,
  saveStatus,
  onChange,
  onSave,
}: {
  draft: PublicRaceCrewSelection
  saved: PublicRaceCrewSelection
  saveStatus: string
  onChange: (selection: PublicRaceCrewSelection) => void
  onSave: () => void
}) {
  const driver = findTeamMemberById(draft.driverId)
  const passenger = findTeamMemberById(draft.passengerId)
  const hasUnsavedChanges =
    draft.driverId !== saved.driverId || draft.passengerId !== saved.passengerId

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-400">
            Current Crew
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Saves the public tracker driver/passenger selection in this browser.
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          className="rounded-md border border-[#ff3ea5]/40 bg-[#ff3ea5]/15 px-4 py-2 text-sm font-black text-white transition hover:bg-[#ff3ea5]/25"
        >
          Save
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <TeamMemberSelect
          label="Driver"
          value={draft.driverId}
          excludeId={draft.passengerId}
          onChange={(driverId) => onChange({ ...draft, driverId })}
        />
        <TeamMemberSelect
          label="Passenger"
          value={draft.passengerId}
          excludeId={draft.driverId}
          onChange={(passengerId) => onChange({ ...draft, passengerId })}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <CrewPreviewCard label="Driver" member={driver} />
        <CrewPreviewCard label="Passenger" member={passenger} />
      </div>

      <p className="mt-3 text-xs font-bold text-slate-400">
        {saveStatus ||
          (hasUnsavedChanges
            ? 'Unsaved crew change.'
            : 'Current crew is saved locally.')}
      </p>
    </section>
  )
}

function TeamMemberSelect({
  label,
  value,
  excludeId,
  onChange,
}: {
  label: string
  value: string
  excludeId: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.14em] text-[#ff8fcb]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#ff3ea5]/60"
      >
        <option value="">Unassigned</option>
        {teamMembers
          .filter((member) => member.id !== excludeId)
          .map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} - {member.role}
            </option>
          ))}
      </select>
    </label>
  )
}

function CrewPreviewCard({
  label,
  member,
}: {
  label: 'Driver' | 'Passenger'
  member: TeamMember | null
}) {
  return (
    <article className="flex items-center gap-3 rounded-md border border-white/10 bg-black/30 p-3">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
        {member?.imageSrc ? (
          <Image
            src={member.imageSrc}
            alt={member.imageAlt}
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xl font-black text-slate-500">
            ?
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <p className="truncate text-base font-black text-white">
          {member?.name ?? 'Unassigned'}
        </p>
        <p className="text-sm font-bold text-slate-400">
          {member?.role ?? 'Select a student'}
        </p>
      </div>
    </article>
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


