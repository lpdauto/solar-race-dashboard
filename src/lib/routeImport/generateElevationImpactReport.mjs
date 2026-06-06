import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../..')
const routeElevationPath = path.join(projectRoot, 'src/data/routeElevation.json')
const mappedSegmentsPath = path.join(projectRoot, 'src/data/mappedRaceSegments.json')
const outputPath = path.join(projectRoot, 'src/data/elevationImpactReport.json')
const mainBatteryUsableWh = 4992
const vehicleWeightLbs = 980
const drivetrainEfficiency = 0.8
const regenEfficiency = 0.2
const maxUsefulDescentRecoveryPercent = 0.3
const maxRecoveryWhPerMile = 35
const feetToMeters = 0.3048
const lbsToKg = 0.45359237
const gravityMetersPerSecondSquared = 9.81
const tinyElevationFt = 3
const gradeWarningCapPercent = 12

const routeElevation = JSON.parse(await readFile(routeElevationPath, 'utf8'))
const mappedRaceSegments = JSON.parse(await readFile(mappedSegmentsPath, 'utf8'))
const routeElevationWithDrivingMiles = addDayDrivingMiles(routeElevation)
const report = generateElevationImpactReport({
  routeElevation: routeElevationWithDrivingMiles,
  mappedRaceSegments,
})

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log('Elevation impact report generated')
console.log(`Mapped segments: ${report.segments.length}`)
console.log(`Worst day: Day ${report.rankings.worstDayByNetElevationEnergy.day}`)
console.log(
  `Highest segment cost: ${report.rankings.highestNetElevationEnergyCostSegments[0]?.appSegmentTitle ?? 'n/a'}`
)
console.log(`Wrote ${path.relative(projectRoot, outputPath)}`)

function generateElevationImpactReport({ routeElevation, mappedRaceSegments }) {
  const segments = mappedRaceSegments.mappedSegments.map((segment) => {
    const elevationWindow = getElevationWindow({
      routeElevation,
      startMile: segment.kmlDrivingMileStart,
      endMile: segment.kmlDrivingMileEnd,
      day: segment.day,
    })
    const energy = estimateElevationEnergyWh({
      elevationGainFt: elevationWindow.elevationGainFt,
      elevationLossFt: elevationWindow.elevationLossFt,
      distanceMiles: elevationWindow.distanceMiles,
    })
    const estimatedSocCostPercent =
      mainBatteryUsableWh > 0
        ? roundPercent((energy.netElevationEnergyWh / mainBatteryUsableWh) * 100)
        : 0

    return {
      ...segment,
      elevationGainFt: elevationWindow.elevationGainFt,
      elevationLossFt: elevationWindow.elevationLossFt,
      maxSmoothedGradePercent: elevationWindow.maxSmoothedGradePercent,
      averageSmoothedGradePercent: elevationWindow.averageSmoothedGradePercent,
      climbEnergyWh: energy.climbEnergyWh,
      descentRecoveryWh: energy.descentRecoveryWh,
      netElevationEnergyWh: energy.netElevationEnergyWh,
      estimatedSocCostPercent,
      dataQualityWarnings: elevationWindow.dataQualityWarnings,
    }
  })
  const dayTotals = buildDayTotals(segments)

  return {
    generatedAt: new Date().toISOString(),
    source: {
      routeElevationGeneratedAt: routeElevation.generatedAt,
      routeElevationSource: routeElevation.source,
      mappedRaceSegmentsGeneratedAt: mappedRaceSegments.generatedAt,
    },
    assumptions: {
      mainBatteryUsableWh,
      vehicleWeightLbs,
      drivetrainEfficiency,
      regenEfficiency,
      maxUsefulDescentRecoveryPercent,
      maxRecoveryWhPerMile,
      gradeWarningCapPercent,
      note: 'Energy is based on aggregate elevation gain/loss windows, not raw point grade spikes.',
    },
    dayTotals,
    segments,
    rankings: {
      highestNetElevationEnergyCostSegments: topBy(
        segments,
        'netElevationEnergyWh',
        10
      ),
      highestElevationGainSegments: topBy(segments, 'elevationGainFt', 10),
      steepestSmoothedGradeSegments: topBy(
        segments,
        'maxSmoothedGradePercent',
        10
      ),
      segmentsWithDataQualityWarnings: segments.filter(
        (segment) => segment.dataQualityWarnings.length > 0
      ),
      worstDayByNetElevationEnergy: [...dayTotals].sort(
        (a, b) => b.totalNetElevationEnergyWh - a.totalNetElevationEnergyWh
      )[0],
    },
  }
}

function getElevationWindow({ routeElevation, startMile, endMile, day }) {
  const normalizedStartMile = Math.min(startMile, endMile)
  const normalizedEndMile = Math.max(startMile, endMile)
  const points = routeElevation.points.filter(
    (point) =>
      point.day === day &&
      point.segmentType !== 'trailer' &&
      typeof point.dayDrivingMile === 'number' &&
      point.dayDrivingMile >= normalizedStartMile &&
      point.dayDrivingMile <= normalizedEndMile
  )
  const smoothedGrades = points
    .map((point) => point.smoothedGradePercent)
    .filter((grade) => typeof grade === 'number')
    .map(Math.abs)
  const distanceMiles = Math.max(0, normalizedEndMile - normalizedStartMile)
  const elevationGainFt = roundFeet(
    points.reduce((total, point) => total + cleanElevationChange(point.elevationGainFt), 0)
  )
  const elevationLossFt = roundFeet(
    points.reduce((total, point) => total + cleanElevationChange(point.elevationLossFt), 0)
  )
  const maxSmoothedGradePercent =
    smoothedGrades.length > 0 ? roundGrade(Math.max(...smoothedGrades)) : null
  const averageSmoothedGradePercent =
    smoothedGrades.length > 0
      ? roundGrade(smoothedGrades.reduce((total, grade) => total + grade, 0) / smoothedGrades.length)
      : null

  return {
    elevationGainFt,
    elevationLossFt,
    maxSmoothedGradePercent,
    averageSmoothedGradePercent,
    distanceMiles: roundMiles(distanceMiles),
    dataQualityWarnings: buildWarnings({
      points,
      distanceMiles,
      maxSmoothedGradePercent,
    }),
  }
}

function addDayDrivingMiles(routeElevation) {
  const drivingSegmentOffsets = new Map()
  const drivingMilesByDay = new Map()

  for (const segment of routeElevation.segments) {
    if (segment.segmentType !== 'driving') continue

    const currentDayMiles = drivingMilesByDay.get(segment.day) ?? 0
    drivingSegmentOffsets.set(segment.segmentId, currentDayMiles)
    drivingMilesByDay.set(segment.day, currentDayMiles + segment.distanceMiles)
  }

  return {
    ...routeElevation,
    points: routeElevation.points.map((point) => {
      if (point.segmentType !== 'driving') return point

      const segmentOffset = drivingSegmentOffsets.get(point.segmentId)

      return {
        ...point,
        dayDrivingMile:
          typeof segmentOffset === 'number'
            ? roundMiles(segmentOffset + point.segmentMiles)
            : undefined,
      }
    }),
  }
}

function estimateElevationEnergyWh({
  elevationGainFt,
  elevationLossFt,
  distanceMiles,
}) {
  const massKg = vehicleWeightLbs * lbsToKg
  const climbEnergyWh =
    potentialEnergyWh({
      massKg,
      elevationFt: cleanElevationChange(elevationGainFt),
    }) / drivetrainEfficiency
  const rawDescentRecoveryWh =
    potentialEnergyWh({
      massKg,
      elevationFt: cleanElevationChange(elevationLossFt),
    }) * regenEfficiency
  const descentRecoveryWh = Math.min(
    rawDescentRecoveryWh,
    climbEnergyWh * maxUsefulDescentRecoveryPercent,
    distanceMiles * maxRecoveryWhPerMile
  )

  return {
    climbEnergyWh: roundWh(climbEnergyWh),
    descentRecoveryWh: roundWh(descentRecoveryWh),
    netElevationEnergyWh: roundWh(Math.max(0, climbEnergyWh - descentRecoveryWh)),
  }
}

function buildDayTotals(segments) {
  return Array.from(
    segments.reduce((dayMap, segment) => {
      const day = dayMap.get(segment.day) ?? {
        day: segment.day,
        totalElevationGainFt: 0,
        totalElevationLossFt: 0,
        totalClimbEnergyWh: 0,
        totalDescentRecoveryWh: 0,
        totalNetElevationEnergyWh: 0,
        estimatedSocCostPercent: 0,
        worstSegmentOfDay: null,
      }

      day.totalElevationGainFt += segment.elevationGainFt
      day.totalElevationLossFt += segment.elevationLossFt
      day.totalClimbEnergyWh += segment.climbEnergyWh
      day.totalDescentRecoveryWh += segment.descentRecoveryWh
      day.totalNetElevationEnergyWh += segment.netElevationEnergyWh

      if (
        !day.worstSegmentOfDay ||
        segment.netElevationEnergyWh > day.worstSegmentOfDay.netElevationEnergyWh
      ) {
        day.worstSegmentOfDay = {
          appSegmentId: segment.appSegmentId,
          appSegmentTitle: segment.appSegmentTitle,
          netElevationEnergyWh: segment.netElevationEnergyWh,
          estimatedSocCostPercent: segment.estimatedSocCostPercent,
        }
      }

      dayMap.set(segment.day, day)
      return dayMap
    }, new Map()).values()
  ).map((day) => ({
    ...day,
    totalElevationGainFt: roundFeet(day.totalElevationGainFt),
    totalElevationLossFt: roundFeet(day.totalElevationLossFt),
    totalClimbEnergyWh: roundWh(day.totalClimbEnergyWh),
    totalDescentRecoveryWh: roundWh(day.totalDescentRecoveryWh),
    totalNetElevationEnergyWh: roundWh(day.totalNetElevationEnergyWh),
    estimatedSocCostPercent: roundPercent(
      (day.totalNetElevationEnergyWh / mainBatteryUsableWh) * 100
    ),
  }))
}

function topBy(items, key, limit) {
  return [...items]
    .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
    .slice(0, limit)
}

function potentialEnergyWh({ massKg, elevationFt }) {
  return (massKg * gravityMetersPerSecondSquared * elevationFt * feetToMeters) / 3600
}

function cleanElevationChange(value) {
  return Math.abs(value) < tinyElevationFt ? 0 : Math.max(0, value)
}

function buildWarnings({ points, distanceMiles, maxSmoothedGradePercent }) {
  const warnings = []

  if (points.length === 0) warnings.push('No elevation points found for this mapped segment.')
  if (distanceMiles <= 0) warnings.push('Mapped segment has zero distance.')
  if (
    maxSmoothedGradePercent !== null &&
    maxSmoothedGradePercent > gradeWarningCapPercent
  ) {
    warnings.push(
      `Smoothed grade exceeds ${gradeWarningCapPercent}%; cap grade influence in strategy.`
    )
  }

  return warnings
}

function roundMiles(value) {
  return Number(value.toFixed(4))
}

function roundFeet(value) {
  return Number(value.toFixed(1))
}

function roundGrade(value) {
  return Number(value.toFixed(3))
}

function roundWh(value) {
  return Number(value.toFixed(1))
}

function roundPercent(value) {
  return Number(value.toFixed(2))
}
