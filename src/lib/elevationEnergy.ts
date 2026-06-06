import routeElevation from '@/data/routeElevation.json'
import { rx2Config } from '@/lib/race/rx2Config'

type ElevationPoint = {
  cumulativeMiles: number
  elevationFt: number | null
  elevationGainFt: number
  elevationLossFt: number
  smoothedGradePercent?: number | null
}

export type ElevationWindow = {
  elevationGainFt: number
  elevationLossFt: number
  maxSmoothedGradePercent: number | null
  averageSmoothedGradePercent: number | null
  distanceMiles: number
  dataQualityWarnings: string[]
}

export type ElevationEnergyEstimate = {
  climbEnergyWh: number
  descentRecoveryWh: number
  netElevationEnergyWh: number
}

export type ElevationWindowOptions = {
  day?: number
  includeTrailerSegments?: boolean
}

export type ElevationEnergyInput = {
  elevationGainFt: number
  elevationLossFt: number
  vehicleWeightLbs?: number
  drivetrainEfficiency?: number
  regenEfficiency?: number
  maxUsefulDescentRecoveryPercent?: number
  distanceMiles?: number
}

const feetToMeters = 0.3048
const lbsToKg = 0.45359237
const gravityMetersPerSecondSquared = 9.81
const tinyElevationFt = 3
const gradeWarningCapPercent = 12
const defaultDrivetrainEfficiency = 0.8
const defaultRegenEfficiency = 0.2
const defaultMaxUsefulDescentRecoveryPercent = 0.3
const maxRecoveryWhPerMile = 35

export function getElevationWindow(
  startMile: number,
  endMile: number,
  options: ElevationWindowOptions = {}
): ElevationWindow {
  const normalizedStartMile = Math.min(startMile, endMile)
  const normalizedEndMile = Math.max(startMile, endMile)
  const points = (routeElevation.points as ElevationPoint[]).filter((point) => {
    const inRange =
      point.cumulativeMiles >= normalizedStartMile &&
      point.cumulativeMiles <= normalizedEndMile

    if (!inRange) return false

    if (options.day !== undefined && (point as ElevationPoint & { day?: number }).day !== options.day) {
      return false
    }

    if (!options.includeTrailerSegments && (point as ElevationPoint & { segmentType?: string }).segmentType === 'trailer') {
      return false
    }

    return true
  })
  const distanceMiles = Math.max(0, normalizedEndMile - normalizedStartMile)
  const smoothedGrades = points
    .map((point) => point.smoothedGradePercent)
    .filter((grade): grade is number => typeof grade === 'number')
  const absoluteSmoothedGrades = smoothedGrades.map((grade) => Math.abs(grade))
  const elevationGainFt = roundFeet(
    points.reduce((total, point) => total + cleanElevationChange(point.elevationGainFt), 0)
  )
  const elevationLossFt = roundFeet(
    points.reduce((total, point) => total + cleanElevationChange(point.elevationLossFt), 0)
  )
  const maxSmoothedGradePercent =
    absoluteSmoothedGrades.length > 0
      ? roundGrade(Math.max(...absoluteSmoothedGrades))
      : null
  const averageSmoothedGradePercent =
    absoluteSmoothedGrades.length > 0
      ? roundGrade(
          absoluteSmoothedGrades.reduce((total, grade) => total + grade, 0) /
            absoluteSmoothedGrades.length
        )
      : null

  return {
    elevationGainFt,
    elevationLossFt,
    maxSmoothedGradePercent,
    averageSmoothedGradePercent,
    distanceMiles: roundMiles(distanceMiles),
    dataQualityWarnings: buildElevationWindowWarnings({
      points,
      maxSmoothedGradePercent,
      distanceMiles,
    }),
  }
}

export function estimateElevationEnergyWh({
  elevationGainFt,
  elevationLossFt,
  vehicleWeightLbs = rx2Config.estimatedRaceWeightLbs,
  drivetrainEfficiency = defaultDrivetrainEfficiency,
  regenEfficiency = defaultRegenEfficiency,
  maxUsefulDescentRecoveryPercent = defaultMaxUsefulDescentRecoveryPercent,
  distanceMiles,
}: ElevationEnergyInput): ElevationEnergyEstimate {
  const massKg = vehicleWeightLbs * lbsToKg
  const climbEnergyWh =
    potentialEnergyWh({
      massKg,
      elevationFt: cleanElevationChange(elevationGainFt),
    }) / clampEfficiency(drivetrainEfficiency, defaultDrivetrainEfficiency)
  const rawDescentRecoveryWh =
    potentialEnergyWh({
      massKg,
      elevationFt: cleanElevationChange(elevationLossFt),
    }) * clampEfficiency(regenEfficiency, defaultRegenEfficiency)
  const climbRecoveryCapWh = climbEnergyWh * maxUsefulDescentRecoveryPercent
  const perMileRecoveryCapWh =
    distanceMiles !== undefined ? Math.max(0, distanceMiles) * maxRecoveryWhPerMile : Number.POSITIVE_INFINITY
  const descentRecoveryWh = Math.min(
    rawDescentRecoveryWh,
    climbRecoveryCapWh,
    perMileRecoveryCapWh
  )

  return {
    climbEnergyWh: roundWh(climbEnergyWh),
    descentRecoveryWh: roundWh(descentRecoveryWh),
    netElevationEnergyWh: roundWh(Math.max(0, climbEnergyWh - descentRecoveryWh)),
  }
}

export function summarizeElevationImpact(startMile: number, endMile: number) {
  const window = getElevationWindow(startMile, endMile)
  const estimate = estimateElevationEnergyWh({
    elevationGainFt: window.elevationGainFt,
    elevationLossFt: window.elevationLossFt,
    vehicleWeightLbs: rx2Config.estimatedRaceWeightLbs,
    distanceMiles: window.distanceMiles,
  })
  const terrainLabel =
    window.elevationGainFt >= 800
      ? 'Major climb'
      : window.elevationGainFt >= 300
        ? 'Moderate climb'
        : window.elevationLossFt >= 300
          ? 'Descent opportunity'
          : 'Mild elevation change'

  return {
    terrainLabel,
    elevationSummary: `+${window.elevationGainFt.toFixed(0)} ft gain / -${window.elevationLossFt.toFixed(0)} ft loss`,
    energySummary: `Estimated climb cost: ${estimate.climbEnergyWh.toFixed(0)} Wh`,
    netEnergySummary: `Net elevation cost: ${estimate.netElevationEnergyWh.toFixed(0)} Wh`,
    window,
    estimate,
  }
}

function potentialEnergyWh({
  massKg,
  elevationFt,
}: {
  massKg: number
  elevationFt: number
}) {
  return (massKg * gravityMetersPerSecondSquared * elevationFt * feetToMeters) / 3600
}

function cleanElevationChange(value: number) {
  return Math.abs(value) < tinyElevationFt ? 0 : Math.max(0, value)
}

function buildElevationWindowWarnings({
  points,
  maxSmoothedGradePercent,
  distanceMiles,
}: {
  points: ElevationPoint[]
  maxSmoothedGradePercent: number | null
  distanceMiles: number
}) {
  const warnings: string[] = []

  // OpenTopoData point-to-point grade spikes were observed in validation.
  // Raw grades should not directly drive strategy; use aggregate gain/loss windows.
  if (points.length === 0) warnings.push('No elevation points found for this window.')
  if (distanceMiles <= 0) warnings.push('Elevation window has zero distance.')
  if (
    maxSmoothedGradePercent !== null &&
    maxSmoothedGradePercent > gradeWarningCapPercent
  ) {
    warnings.push(
      `Smoothed grade exceeds ${gradeWarningCapPercent}% in this window; cap grade influence in strategy.`
    )
  }

  return warnings
}

function clampEfficiency(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(1, Math.max(0.01, value))
}

function roundMiles(value: number) {
  return Number(value.toFixed(4))
}

function roundFeet(value: number) {
  return Number(value.toFixed(1))
}

function roundGrade(value: number) {
  return Number(value.toFixed(3))
}

function roundWh(value: number) {
  return Number(value.toFixed(1))
}
