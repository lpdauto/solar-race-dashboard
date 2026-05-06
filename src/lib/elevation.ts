import type { RiskLevel, RoutePoint } from '@/data/raceRoute'
import { getMockElevationProfile } from '@/data/mockElevation'

export type ElevationPoint = RoutePoint & {
  elevationFeet: number
  gradePercent?: number
}

export type ElevationFetchResult = {
  profile: ElevationPoint[]
  usedFallback: boolean
  error?: string
}

export type ElevationStats = {
  minElevation: number
  maxElevation: number
  totalGain: number
  totalLoss: number
  steepestClimbGrade: number
  steepestDescentGrade: number
  highestGradeRisk: RiskLevel
  hasSteepClimbs: boolean
  hasLongDescents: boolean
  hasHighGain: boolean
  hasMildGrades: boolean
}

type OpenMeteoElevationResponse = {
  elevation?: number[]
}

const FEET_PER_METER = 3.28084
const FEET_PER_MILE = 5280

export function buildElevationApiUrl(points: RoutePoint[]) {
  const latitudes = points.map((point) => point.lat.toFixed(5)).join(',')
  const longitudes = points.map((point) => point.lng.toFixed(5)).join(',')

  return `https://api.open-meteo.com/v1/elevation?latitude=${latitudes}&longitude=${longitudes}`
}

export async function fetchElevationProfile(
  points: RoutePoint[],
  day?: number
): Promise<ElevationFetchResult> {
  try {
    const response = await fetch(buildElevationApiUrl(points))

    if (!response.ok) {
      throw new Error(`Elevation API returned ${response.status}`)
    }

    const data = (await response.json()) as OpenMeteoElevationResponse

    if (!Array.isArray(data.elevation) || data.elevation.length !== points.length) {
      throw new Error('Elevation API returned an unexpected profile shape')
    }

    const profile = points.map((point, index) => ({
      ...point,
      elevationFeet: Math.round(data.elevation![index] * FEET_PER_METER),
    }))

    return {
      profile: addGrades(profile),
      usedFallback: false,
    }
  } catch (error) {
    const profile = getMockElevationProfile(day ?? 0, points)

    return {
      profile: addGrades(profile),
      usedFallback: true,
      error:
        error instanceof Error
          ? error.message
          : 'Elevation API failed, using mock elevation profile',
    }
  }
}

export function calculateGradePercent(
  previousPoint: ElevationPoint,
  currentPoint: ElevationPoint
) {
  const distanceMiles = currentPoint.mile - previousPoint.mile

  if (distanceMiles <= 0) {
    return 0
  }

  const elevationDeltaFeet =
    currentPoint.elevationFeet - previousPoint.elevationFeet

  return (elevationDeltaFeet / (distanceMiles * FEET_PER_MILE)) * 100
}

export function calculateElevationStats(
  profile: ElevationPoint[]
): ElevationStats {
  if (profile.length === 0) {
    return {
      minElevation: 0,
      maxElevation: 0,
      totalGain: 0,
      totalLoss: 0,
      steepestClimbGrade: 0,
      steepestDescentGrade: 0,
      highestGradeRisk: 'low',
      hasSteepClimbs: false,
      hasLongDescents: false,
      hasHighGain: false,
      hasMildGrades: true,
    }
  }

  let totalGain = 0
  let totalLoss = 0
  let steepestClimbGrade = 0
  let steepestDescentGrade = 0
  let highestGradeRisk: RiskLevel = 'low'

  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1]
    const current = profile[index]
    const elevationDelta = current.elevationFeet - previous.elevationFeet
    const grade = current.gradePercent ?? calculateGradePercent(previous, current)

    if (elevationDelta > 0) {
      totalGain += elevationDelta
    } else {
      totalLoss += Math.abs(elevationDelta)
    }

    steepestClimbGrade = Math.max(steepestClimbGrade, grade)
    steepestDescentGrade = Math.min(steepestDescentGrade, grade)

    const gradeRisk = classifyGradeRisk(grade)

    if (
      riskRank(gradeRisk) > riskRank(highestGradeRisk) &&
      gradeRisk !== 'low'
    ) {
      highestGradeRisk = gradeRisk
    }
  }

  return {
    minElevation: Math.min(...profile.map((point) => point.elevationFeet)),
    maxElevation: Math.max(...profile.map((point) => point.elevationFeet)),
    totalGain: Math.round(totalGain),
    totalLoss: Math.round(totalLoss),
    steepestClimbGrade,
    steepestDescentGrade,
    highestGradeRisk,
    hasSteepClimbs: steepestClimbGrade >= 4,
    hasLongDescents: steepestDescentGrade <= -4 || totalLoss >= 600,
    hasHighGain: totalGain >= 900,
    hasMildGrades: steepestClimbGrade < 2 && steepestDescentGrade > -4,
  }
}

export function classifyGradeRisk(gradePercent: number): RiskLevel {
  const climbingGrade = Math.abs(Math.max(gradePercent, 0))

  if (climbingGrade < 2) return 'low'
  if (climbingGrade <= 4) return 'medium'
  if (climbingGrade <= 6) return 'high'
  return 'severe'
}

export function isDescentRegenOpportunity(gradePercent: number) {
  return gradePercent < -4
}

function addGrades(profile: ElevationPoint[]) {
  return profile.map((point, index) => {
    if (index === 0) {
      return {
        ...point,
        gradePercent: 0,
      }
    }

    return {
      ...point,
      gradePercent: calculateGradePercent(profile[index - 1], point),
    }
  })
}

function riskRank(risk: RiskLevel) {
  if (risk === 'severe') return 4
  if (risk === 'high') return 3
  if (risk === 'medium') return 2
  return 1
}
