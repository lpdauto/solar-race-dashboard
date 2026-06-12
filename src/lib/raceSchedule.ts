import type { RaceDay } from '@/data/raceRoute'
import routeData from '@/data/routeData.json'
import { rx2Config } from '@/lib/race/rx2Config'

export type RaceScheduleEventType =
  | 'drive'
  | 'stop'
  | 'lunch'
  | 'rest'
  | 'trailer'
  | 'impound'
  | 'post-finish'
  | 'morning'
  | 'finish'

export type RaceScheduleEvent = {
  id: string
  day: number
  type: RaceScheduleEventType
  label: string
  startMile?: number
  endMile?: number
  durationMinutes?: number
  solarChargingAllowed: boolean
  countsForMileage: boolean
  usesDefaultDuration?: boolean
}

export type RaceScheduleDefaults = {
  restStopDefaultMinutes: number
  lunchStopDefaultMinutes: number
  checkpointDefaultMinutes: number
  defaultTrailerSpeedMph: number
}

export type RaceScheduleForecastMode = 'normal' | 'conservative'

export type RaceScheduleForecast = {
  scheduleKnown: boolean
  forecastMode: RaceScheduleForecastMode
  usesDefaultDurations: boolean
  usesEstimatedDurations: boolean
  defaultDurationEventCount: number
  estimatedDurationEventCount: number
  projectedEndDaySocPercent: number
  projectedNextScheduleEventSocPercent?: number
  projectedAfterNextStopSocPercent?: number
  projectedDriveEnergyWh: number
  projectedSolarRecoveredDrivingWh: number
  projectedSolarRecoveredStoppedWh: number
  projectedSolarRecoveredTraileringWh: number
  projectedSolarRecoveredPostFinishWh: number
  projectedSolarRecoveredMorningWh: number
  projectedSolarRecoveredWh: number
  usableSolarRecoveryWh: number
  wastedSolarRecoveryWh: number
  projectedNetEnergyWh: number
  postFinishSolarRecoveryIncluded: boolean
  morningSolarRecoveryIncluded: boolean
  nextScheduleEventLabel?: string
  nextScheduleEventType?: RaceScheduleEventType
}

type GeneratedRouteSegment = {
  segmentId: string
  segmentName: string
  segmentType: 'driving' | 'trailer'
  day: number
  segmentMiles: number
}

type EnergyProjection = {
  energyWh: number
  driveEnergyWh: number
  drivingSolarWh: number
  stoppedSolarWh: number
  traileringSolarWh: number
  postFinishSolarWh: number
  morningSolarWh: number
  usableSolarRecoveryWh: number
  wastedSolarRecoveryWh: number
}

const eventTypeOrder: Record<RaceScheduleEventType, number> = {
  morning: -1,
  stop: 0,
  lunch: 0,
  rest: 0,
  trailer: 1,
  drive: 2,
  impound: 3,
  finish: 4,
  'post-finish': 5,
}

const conservativeDefaultRecoveryMultiplier = 0.5

export function defaultRaceScheduleConfig(): RaceScheduleDefaults {
  return {
    restStopDefaultMinutes: rx2Config.restStopDefaultMinutes,
    lunchStopDefaultMinutes: rx2Config.lunchStopDefaultMinutes,
    checkpointDefaultMinutes: rx2Config.checkpointDefaultMinutes,
    defaultTrailerSpeedMph: rx2Config.defaultTrailerSpeedMph,
  }
}

export function buildRaceSchedule({
  raceDay,
  config = defaultRaceScheduleConfig(),
}: {
  raceDay: RaceDay
  config?: RaceScheduleDefaults
}): RaceScheduleEvent[] {
  const baseEvents = buildDriveAndTrailerEvents({ raceDay, config })
  const stopEvents = buildCuratedStopEvents({ raceDay, config })
  const events = splitDriveEventsAroundStops({
    baseEvents,
    stopEvents,
  })

  return sortScheduleEvents([
    ...events,
    {
      id: `day-${raceDay.day}-finish`,
      day: raceDay.day,
      type: 'finish',
      label: `${raceDay.end} finish`,
      startMile: raceDay.distanceMiles,
      endMile: raceDay.distanceMiles,
      solarChargingAllowed: false,
      countsForMileage: true,
    },
  ])
}

export function forecastRaceScheduleEnergy({
  events,
  currentMile,
  currentBatteryEnergyWh,
  predictedWhPerMile,
  predictedMpptWatts,
  driveSpeedMph,
  batteryCapacityWh,
  defaultTrailerSpeedMph = rx2Config.defaultTrailerSpeedMph,
  forecastMode = 'normal',
}: {
  events: RaceScheduleEvent[]
  currentMile: number
  currentBatteryEnergyWh: number
  predictedWhPerMile: number
  predictedMpptWatts: number
  driveSpeedMph: number
  batteryCapacityWh: number
  defaultTrailerSpeedMph?: number
  forecastMode?: RaceScheduleForecastMode
}): RaceScheduleForecast {
  const sortedEvents = sortScheduleEvents(events)
  const scheduleKnown = sortedEvents.length > 0
  const defaultDurationEventCount = sortedEvents.filter(
    (event) => event.usesDefaultDuration
  ).length
  const estimatedDurationEventCount = sortedEvents.filter((event) => {
    if (event.type !== 'trailer' || event.durationMinutes !== undefined) {
      return false
    }

    return estimateDurationMinutes({ event, defaultTrailerSpeedMph }) !== undefined
  }).length
  const projection: EnergyProjection = {
    energyWh: clamp(currentBatteryEnergyWh, 0, batteryCapacityWh),
    driveEnergyWh: 0,
    drivingSolarWh: 0,
    stoppedSolarWh: 0,
    traileringSolarWh: 0,
    postFinishSolarWh: 0,
    morningSolarWh: 0,
    usableSolarRecoveryWh: 0,
    wastedSolarRecoveryWh: 0,
  }
  let nextScheduleEventLabel: string | undefined
  let nextScheduleEventType: RaceScheduleEventType | undefined
  let projectedNextScheduleEventSocPercent: number | undefined
  let projectedAfterNextStopSocPercent: number | undefined

  for (const event of sortedEvents) {
    if (event.type === 'drive') {
      applyDriveEvent({
        event,
        currentMile,
        projection,
        predictedWhPerMile,
      predictedMpptWatts,
      driveSpeedMph,
      batteryCapacityWh,
      })
      continue
    }

    const eventMile = scheduleEventMile(event)

    if (eventMile < currentMile) continue

    if (!nextScheduleEventLabel) {
      nextScheduleEventLabel = event.label
      nextScheduleEventType = event.type
      projectedNextScheduleEventSocPercent = energyToSoc(
        projection.energyWh,
        batteryCapacityWh
      )
    }

    const beforeRecoveryWh = projection.energyWh

    applyNonDrivingEvent({
      event,
      projection,
      predictedMpptWatts,
      batteryCapacityWh,
      defaultTrailerSpeedMph,
      forecastMode,
    })

    if (
      projectedAfterNextStopSocPercent === undefined &&
      beforeRecoveryWh !== projection.energyWh &&
      event.type !== 'finish'
    ) {
      projectedAfterNextStopSocPercent = energyToSoc(
        projection.energyWh,
        batteryCapacityWh
      )
    }
  }

  const projectedSolarRecoveredWh =
    projection.drivingSolarWh +
    projection.stoppedSolarWh +
    projection.traileringSolarWh +
    projection.postFinishSolarWh +
    projection.morningSolarWh

  return {
    scheduleKnown,
    forecastMode,
    usesDefaultDurations: defaultDurationEventCount > 0,
    usesEstimatedDurations: estimatedDurationEventCount > 0,
    defaultDurationEventCount,
    estimatedDurationEventCount,
    projectedEndDaySocPercent: energyToSoc(projection.energyWh, batteryCapacityWh),
    projectedNextScheduleEventSocPercent,
    projectedAfterNextStopSocPercent,
    projectedDriveEnergyWh: projection.driveEnergyWh,
    projectedSolarRecoveredDrivingWh: projection.drivingSolarWh,
    projectedSolarRecoveredStoppedWh: projection.stoppedSolarWh,
    projectedSolarRecoveredTraileringWh: projection.traileringSolarWh,
    projectedSolarRecoveredPostFinishWh: projection.postFinishSolarWh,
    projectedSolarRecoveredMorningWh: projection.morningSolarWh,
    projectedSolarRecoveredWh,
    usableSolarRecoveryWh: projection.usableSolarRecoveryWh,
    wastedSolarRecoveryWh: projection.wastedSolarRecoveryWh,
    projectedNetEnergyWh: projection.driveEnergyWh - projectedSolarRecoveredWh,
    postFinishSolarRecoveryIncluded: projection.postFinishSolarWh > 0,
    morningSolarRecoveryIncluded: projection.morningSolarWh > 0,
    nextScheduleEventLabel,
    nextScheduleEventType,
  }
}

function buildDriveAndTrailerEvents({
  raceDay,
  config,
}: {
  raceDay: RaceDay
  config: RaceScheduleDefaults
}): RaceScheduleEvent[] {
  const generatedSegments = (routeData.segments as GeneratedRouteSegment[])
    .filter((segment) => segment.day === raceDay.day)
  let drivenMile = 0
  const events: RaceScheduleEvent[] = []

  for (const segment of generatedSegments) {
    if (segment.segmentType === 'driving') {
      const startMile = drivenMile
      const endMile = Math.min(
        raceDay.distanceMiles,
        drivenMile + Math.max(0, segment.segmentMiles)
      )

      if (endMile > startMile) {
        events.push({
          id: segment.segmentId,
          day: raceDay.day,
          type: 'drive',
          label: segment.segmentName,
          startMile,
          endMile,
          solarChargingAllowed: true,
          countsForMileage: true,
        })
      }

      drivenMile = endMile
      continue
    }

    const trailerMinutes =
      config.defaultTrailerSpeedMph > 0
        ? Math.max(0, segment.segmentMiles) / config.defaultTrailerSpeedMph * 60
        : undefined

    events.push({
      id: segment.segmentId,
      day: raceDay.day,
      type: 'trailer',
      label: segment.segmentName,
      startMile: drivenMile,
      endMile: drivenMile,
      durationMinutes: trailerMinutes,
      solarChargingAllowed: true,
      countsForMileage: false,
      usesDefaultDuration: true,
    })
  }

  if (events.length === 0) {
    return [
      {
        id: `day-${raceDay.day}-drive`,
        day: raceDay.day,
        type: 'drive',
        label: `${raceDay.start} to ${raceDay.end}`,
        startMile: 0,
        endMile: raceDay.distanceMiles,
        solarChargingAllowed: true,
        countsForMileage: true,
      },
    ]
  }

  return events
}

function buildCuratedStopEvents({
  raceDay,
  config,
}: {
  raceDay: RaceDay
  config: RaceScheduleDefaults
}) {
  const interiorPoints = raceDay.routePoints
    .filter((point) => point.mile > 0 && point.mile < raceDay.distanceMiles)
    .sort((left, right) => left.mile - right.mile)
  const lunchPoint = interiorPoints
    .map((point) => ({
      point,
      distanceFromMidday: Math.abs(point.mile - raceDay.distanceMiles / 2),
    }))
    .sort((left, right) => left.distanceFromMidday - right.distanceFromMidday)[0]
    ?.point

  return interiorPoints.map<RaceScheduleEvent>((point, index) => {
    const isLunch = lunchPoint?.mile === point.mile
    const label = point.label ?? `Mile ${point.mile.toFixed(1)} checkpoint`

    return {
      id: `day-${raceDay.day}-${isLunch ? 'lunch' : 'checkpoint'}-${index + 1}`,
      day: raceDay.day,
      type: isLunch ? 'lunch' : 'stop',
      label,
      startMile: point.mile,
      endMile: point.mile,
      durationMinutes: isLunch
        ? config.lunchStopDefaultMinutes
        : config.checkpointDefaultMinutes,
      solarChargingAllowed: true,
      countsForMileage: false,
      usesDefaultDuration: true,
    }
  })
}

function splitDriveEventsAroundStops({
  baseEvents,
  stopEvents,
}: {
  baseEvents: RaceScheduleEvent[]
  stopEvents: RaceScheduleEvent[]
}) {
  const insertedStopIds = new Set<string>()
  const events: RaceScheduleEvent[] = []

  for (const event of baseEvents) {
    if (event.type !== 'drive') {
      events.push(event)
      continue
    }

    const driveStart = event.startMile ?? 0
    const driveEnd = event.endMile ?? driveStart
    const stopsInDrive = stopEvents.filter((stop) => {
      const stopMile = scheduleEventMile(stop)

      return stopMile > driveStart && stopMile < driveEnd
    })
    let cursor = driveStart

    for (const stop of stopsInDrive) {
      const stopMile = scheduleEventMile(stop)

      if (stopMile > cursor) {
        events.push({
          ...event,
          id: `${event.id}-to-${stop.id}`,
          endMile: stopMile,
        })
      }

      events.push(stop)
      insertedStopIds.add(stop.id)
      cursor = stopMile
    }

    if (driveEnd > cursor) {
      events.push({
        ...event,
        id: stopsInDrive.length > 0 ? `${event.id}-after-stops` : event.id,
        startMile: cursor,
        endMile: driveEnd,
      })
    }
  }

  for (const stop of stopEvents) {
    if (!insertedStopIds.has(stop.id)) {
      events.push(stop)
    }
  }

  return events
}

function applyDriveEvent({
  event,
  currentMile,
  projection,
  predictedWhPerMile,
  predictedMpptWatts,
  driveSpeedMph,
  batteryCapacityWh,
}: {
  event: RaceScheduleEvent
  currentMile: number
  projection: EnergyProjection
  predictedWhPerMile: number
  predictedMpptWatts: number
  driveSpeedMph: number
  batteryCapacityWh: number
}) {
  const startMile = event.startMile ?? 0
  const endMile = event.endMile ?? startMile

  if (endMile <= currentMile) return

  const miles = Math.max(0, endMile - Math.max(startMile, currentMile))
  const driveEnergyWh = miles * predictedWhPerMile
  const driveHours = driveSpeedMph > 1 ? miles / driveSpeedMph : 0
  const solarWh = event.solarChargingAllowed
    ? predictedMpptWatts * driveHours
    : 0

  projection.driveEnergyWh += driveEnergyWh
  projection.drivingSolarWh += solarWh
  const rawEnergyAfterDrive = projection.energyWh - driveEnergyWh
  const rawEnergyAfterSolar = rawEnergyAfterDrive + solarWh
  const wastedSolarWh = Math.max(0, rawEnergyAfterSolar - batteryCapacityWh)

  projection.usableSolarRecoveryWh += Math.max(0, solarWh - wastedSolarWh)
  projection.wastedSolarRecoveryWh += wastedSolarWh
  projection.energyWh = clamp(rawEnergyAfterSolar, 0, batteryCapacityWh)
}

function applyNonDrivingEvent({
  event,
  projection,
  predictedMpptWatts,
  batteryCapacityWh,
  defaultTrailerSpeedMph,
  forecastMode,
}: {
  event: RaceScheduleEvent
  projection: EnergyProjection
  predictedMpptWatts: number
  batteryCapacityWh: number
  defaultTrailerSpeedMph: number
  forecastMode: RaceScheduleForecastMode
}) {
  if (!event.solarChargingAllowed) return

  const durationMinutes = event.durationMinutes ?? estimateDurationMinutes({
    event,
    defaultTrailerSpeedMph,
  })
  const durationUsesDefault =
    Boolean(event.usesDefaultDuration) ||
    (event.type === 'trailer' && event.durationMinutes === undefined)
  const recoveryMultiplier =
    forecastMode === 'conservative' && durationUsesDefault
      ? conservativeDefaultRecoveryMultiplier
      : 1
  const solarWh =
    predictedMpptWatts * Math.max(0, durationMinutes ?? 0) / 60 * recoveryMultiplier

  if (event.type === 'trailer') {
    projection.traileringSolarWh += solarWh
  } else if (event.type === 'post-finish') {
    projection.postFinishSolarWh += solarWh
  } else if (event.type === 'morning') {
    projection.morningSolarWh += solarWh
  } else {
    projection.stoppedSolarWh += solarWh
  }

  applySolarRecovery({
    projection,
    solarWh,
    batteryCapacityWh,
  })
}

function applySolarRecovery({
  projection,
  solarWh,
  batteryCapacityWh,
}: {
  projection: EnergyProjection
  solarWh: number
  batteryCapacityWh: number
}) {
  const rawEnergyAfterSolar = projection.energyWh + solarWh
  const wastedSolarWh = Math.max(0, rawEnergyAfterSolar - batteryCapacityWh)

  projection.usableSolarRecoveryWh += Math.max(0, solarWh - wastedSolarWh)
  projection.wastedSolarRecoveryWh += wastedSolarWh
  projection.energyWh = clamp(rawEnergyAfterSolar, 0, batteryCapacityWh)
}

function estimateDurationMinutes({
  event,
  defaultTrailerSpeedMph,
}: {
  event: RaceScheduleEvent
  defaultTrailerSpeedMph: number
}) {
  if (event.type !== 'trailer') return undefined

  const startMile = event.startMile ?? 0
  const endMile = event.endMile ?? startMile
  const trailerMiles = Math.abs(endMile - startMile)

  if (defaultTrailerSpeedMph <= 0 || trailerMiles <= 0) return undefined

  return trailerMiles / defaultTrailerSpeedMph * 60
}

function sortScheduleEvents(events: RaceScheduleEvent[]) {
  return [...events].sort((left, right) => {
    const mileDelta = scheduleEventMile(left) - scheduleEventMile(right)

    if (mileDelta !== 0) return mileDelta

    return eventTypeOrder[left.type] - eventTypeOrder[right.type]
  })
}

function scheduleEventMile(event: RaceScheduleEvent) {
  return event.startMile ?? event.endMile ?? 0
}

function energyToSoc(energyWh: number, batteryCapacityWh: number) {
  if (batteryCapacityWh <= 0) return 0

  return clamp(energyWh / batteryCapacityWh * 100, 0, 100)
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min

  return Math.min(max, Math.max(min, value))
}
