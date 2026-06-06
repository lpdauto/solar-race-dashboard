import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../..')
const routeElevationPath = path.join(projectRoot, 'src/data/routeElevation.json')
const reportPath = path.join(projectRoot, 'src/data/routeElevationValidationReport.json')
const feetPerMile = 5280
const noiseThresholdFt = 3
const smoothingWindowSize = 5
const safeDistanceMiles = 0.01
const gradeWarningPercent = 12
const elevationJumpWarningFt = 50

const routeElevation = JSON.parse(await readFile(routeElevationPath, 'utf8'))
const { updatedRouteElevation, report } = validateAndSmoothElevation(routeElevation)

await writeFile(routeElevationPath, `${JSON.stringify(updatedRouteElevation, null, 2)}\n`, 'utf8')
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log('Route elevation validation complete')
console.log(`Missing elevations: ${report.missingElevationCount}`)
console.log(`Max raw grade: ${report.maxGradePercentRaw}%`)
console.log(`Max smoothed grade: ${report.maxSmoothedGradePercent}%`)
console.log(`Grade spikes: ${report.topGradeSpikes.length}`)
console.log(`Warnings: ${report.warnings.length}`)
console.log(`Wrote ${path.relative(projectRoot, reportPath)}`)

function validateAndSmoothElevation(routeElevation) {
  const enrichedPoints = routeElevation.points.map((point, index, points) => {
    const previousPoint = points[index - 1]
    const previousElevationFt = previousPoint?.elevationFt
    const elevationFt = point.elevationFt
    const legMiles = previousPoint
      ? Math.max(0, point.cumulativeMiles - previousPoint.cumulativeMiles)
      : 0
    const rawElevationDeltaFt =
      typeof elevationFt === 'number' && typeof previousElevationFt === 'number'
        ? elevationFt - previousElevationFt
        : 0
    const filteredElevationDeltaFt =
      Math.abs(rawElevationDeltaFt) >= noiseThresholdFt ? rawElevationDeltaFt : 0
    const gradePercentRaw =
      legMiles >= safeDistanceMiles && filteredElevationDeltaFt !== 0
        ? roundGrade((filteredElevationDeltaFt / (legMiles * feetPerMile)) * 100)
        : null

    return {
      ...point,
      gradePercentRaw,
      gradePercent: point.gradePercent ?? gradePercentRaw,
      smoothedGradePercent: null,
      validation: {
        legMiles: roundMiles(legMiles),
        rawElevationDeltaFt: roundFeet(rawElevationDeltaFt),
        tooShortForGrade: index > 0 && legMiles < safeDistanceMiles,
      },
    }
  })

  const points = enrichedPoints.map((point, index) => ({
    ...point,
    smoothedGradePercent: smoothGradeAtIndex(enrichedPoints, index),
  }))
  const segments = routeElevation.segments.map((segment) =>
    summarizeSegment(segment, points)
  )
  const days = summarizeDays(segments)
  const report = buildValidationReport({
    routeElevation,
    points,
    segments,
    days,
  })

  return {
    updatedRouteElevation: {
      ...routeElevation,
      validationGeneratedAt: new Date().toISOString(),
      smoothing: {
        smoothingWindowSize,
        safeDistanceMiles,
        gradeWarningPercent,
        elevationJumpWarningFt,
        note: 'smoothedGradePercent is derived from gradePercentRaw only; elevationFt values are unchanged.',
      },
      days,
      segments,
      points,
    },
    report,
  }
}

function smoothGradeAtIndex(points, index) {
  const halfWindow = Math.floor(smoothingWindowSize / 2)
  const windowGrades = points
    .slice(
      Math.max(0, index - halfWindow),
      Math.min(points.length, index + halfWindow + 1)
    )
    .map((point) => point.gradePercentRaw)
    .filter((grade) => typeof grade === 'number')

  if (windowGrades.length === 0) return null

  return roundGrade(
    windowGrades.reduce((total, grade) => total + grade, 0) / windowGrades.length
  )
}

function buildValidationReport({ routeElevation, points, segments, days }) {
  const missingElevationCount = points.filter(
    (point) => typeof point.elevationFt !== 'number'
  ).length
  const rawGradeValues = points
    .map((point) => point.gradePercentRaw)
    .filter((grade) => typeof grade === 'number')
  const smoothedGradeValues = points
    .map((point) => point.smoothedGradePercent)
    .filter((grade) => typeof grade === 'number')
  const topGradeSpikes = points
    .filter((point) => typeof point.gradePercentRaw === 'number')
    .map((point) => ({
      pointIndex: point.pointIndex,
      day: point.day,
      segmentId: point.segmentId,
      segmentName: point.segmentName,
      cumulativeMiles: point.cumulativeMiles,
      segmentMiles: point.segmentMiles,
      latitude: point.latitude,
      longitude: point.longitude,
      elevationFt: point.elevationFt,
      gradePercentRaw: point.gradePercentRaw,
      smoothedGradePercent: point.smoothedGradePercent,
      legMiles: point.validation.legMiles,
      rawElevationDeltaFt: point.validation.rawElevationDeltaFt,
    }))
    .sort((a, b) => Math.abs(b.gradePercentRaw) - Math.abs(a.gradePercentRaw))
    .slice(0, 20)
  const tinyDistanceJumpsAll = points
    .filter(
      (point) =>
        point.validation.tooShortForGrade &&
        Math.abs(point.validation.rawElevationDeltaFt) >= noiseThresholdFt
    )
    .map(pointWarning)
  const elevationJumpsAll = points
    .filter(
      (point) =>
        Math.abs(point.validation.rawElevationDeltaFt) > elevationJumpWarningFt
    )
    .map(pointWarning)
  const steepGradesAll = points
    .filter(
      (point) =>
        typeof point.gradePercentRaw === 'number' &&
        Math.abs(point.gradePercentRaw) > gradeWarningPercent
    )
    .map(pointWarning)
  const tinyDistanceJumps = tinyDistanceJumpsAll.slice(0, 50)
  const elevationJumps = elevationJumpsAll.slice(0, 50)
  const steepGrades = steepGradesAll
    .slice(0, 50)
  const warnings = [
    ...tinyDistanceJumps.map(
      (point) =>
        `Short leg ${point.legMiles} mi with ${point.rawElevationDeltaFt} ft elevation change at point ${point.pointIndex}.`
    ),
    ...elevationJumps.map(
      (point) =>
        `Elevation jump ${point.rawElevationDeltaFt} ft at point ${point.pointIndex}.`
    ),
    ...steepGrades.map(
      (point) =>
        `Raw grade ${point.gradePercentRaw}% above ${gradeWarningPercent}% at point ${point.pointIndex}.`
    ),
  ]

  return {
    generatedAt: new Date().toISOString(),
    source: routeElevation.source,
    providerUrl: routeElevation.providerUrl,
    totalPoints: points.length,
    missingElevationCount,
    maxGradePercentRaw:
      rawGradeValues.length > 0
        ? roundGrade(maxAbsolute(rawGradeValues))
        : null,
    maxSmoothedGradePercent:
      smoothedGradeValues.length > 0
        ? roundGrade(maxAbsolute(smoothedGradeValues))
        : null,
    smoothing: {
      smoothingWindowSize,
      safeDistanceMiles,
      noiseThresholdFt,
    },
    topGradeSpikes,
    perDayMaxGrade: days.map((day) => ({
      day: day.day,
      maxGradePercent: day.maxGradePercent,
      maxSmoothedGradePercent: day.maxSmoothedGradePercent,
      averageSmoothedGradePercent: day.averageSmoothedGradePercent,
    })),
    perSegmentMaxGrade: segments.map((segment) => ({
      segmentId: segment.segmentId,
      segmentName: segment.segmentName,
      segmentType: segment.segmentType,
      day: segment.day,
      maxGradePercent: segment.maxGradePercent,
      maxSmoothedGradePercent: segment.maxSmoothedGradePercent,
      averageSmoothedGradePercent: segment.averageSmoothedGradePercent,
    })),
    warningCounts: {
      gradeAbove12Percent: steepGradesAll.length,
      tooShortDistanceWithElevationChange: tinyDistanceJumpsAll.length,
      elevationJumpAbove50Ft: elevationJumpsAll.length,
    },
    warnings,
  }
}

function summarizeSegment(segment, points) {
  const segmentPoints = points.filter((point) => point.segmentId === segment.segmentId)
  const rawGrades = segmentPoints
    .map((point) => point.gradePercentRaw)
    .filter((grade) => typeof grade === 'number')
  const smoothedGrades = segmentPoints
    .map((point) => point.smoothedGradePercent)
    .filter((grade) => typeof grade === 'number')

  return {
    ...segment,
    maxGradePercent:
      rawGrades.length > 0 ? roundGrade(maxAbsolute(rawGrades)) : null,
    averageGradePercent:
      rawGrades.length > 0 ? roundGrade(averageAbsolute(rawGrades)) : null,
    maxSmoothedGradePercent:
      smoothedGrades.length > 0 ? roundGrade(maxAbsolute(smoothedGrades)) : null,
    averageSmoothedGradePercent:
      smoothedGrades.length > 0 ? roundGrade(averageAbsolute(smoothedGrades)) : null,
  }
}

function summarizeDays(segments) {
  return Array.from(
    segments.reduce((dayMap, segment) => {
      const day = dayMap.get(segment.day) ?? {
        day: segment.day,
        startMile: segment.startMile,
        endMile: segment.endMile,
        distanceMiles: 0,
        elevationGainFt: 0,
        elevationLossFt: 0,
        drivingElevationGainFt: 0,
        drivingElevationLossFt: 0,
        trailerElevationGainFt: 0,
        trailerElevationLossFt: 0,
        maxGradePercent: null,
        averageGradePercent: null,
        maxSmoothedGradePercent: null,
        averageSmoothedGradePercent: null,
        segmentCount: 0,
        rawGradeWeightedTotal: 0,
        rawGradeWeightedMiles: 0,
        smoothedGradeWeightedTotal: 0,
        smoothedGradeWeightedMiles: 0,
      }

      day.startMile = Math.min(day.startMile, segment.startMile)
      day.endMile = Math.max(day.endMile, segment.endMile)
      day.distanceMiles = roundMiles(day.distanceMiles + segment.distanceMiles)
      day.elevationGainFt = roundFeet(day.elevationGainFt + segment.elevationGainFt)
      day.elevationLossFt = roundFeet(day.elevationLossFt + segment.elevationLossFt)
      day.segmentCount += 1

      if (segment.segmentType === 'driving') {
        day.drivingElevationGainFt = roundFeet(
          day.drivingElevationGainFt + segment.elevationGainFt
        )
        day.drivingElevationLossFt = roundFeet(
          day.drivingElevationLossFt + segment.elevationLossFt
        )
      } else {
        day.trailerElevationGainFt = roundFeet(
          day.trailerElevationGainFt + segment.elevationGainFt
        )
        day.trailerElevationLossFt = roundFeet(
          day.trailerElevationLossFt + segment.elevationLossFt
        )
      }

      if (typeof segment.maxGradePercent === 'number') {
        day.maxGradePercent =
          day.maxGradePercent === null
            ? segment.maxGradePercent
            : Math.max(day.maxGradePercent, segment.maxGradePercent)
      }

      if (typeof segment.averageGradePercent === 'number') {
        day.rawGradeWeightedTotal += segment.averageGradePercent * segment.distanceMiles
        day.rawGradeWeightedMiles += segment.distanceMiles
      }

      if (typeof segment.maxSmoothedGradePercent === 'number') {
        day.maxSmoothedGradePercent =
          day.maxSmoothedGradePercent === null
            ? segment.maxSmoothedGradePercent
            : Math.max(day.maxSmoothedGradePercent, segment.maxSmoothedGradePercent)
      }

      if (typeof segment.averageSmoothedGradePercent === 'number') {
        day.smoothedGradeWeightedTotal +=
          segment.averageSmoothedGradePercent * segment.distanceMiles
        day.smoothedGradeWeightedMiles += segment.distanceMiles
      }

      dayMap.set(segment.day, day)
      return dayMap
    }, new Map()).values()
  )
    .map(
      ({
        rawGradeWeightedTotal,
        rawGradeWeightedMiles,
        smoothedGradeWeightedTotal,
        smoothedGradeWeightedMiles,
        ...day
      }) => ({
        ...day,
        maxGradePercent:
          typeof day.maxGradePercent === 'number'
            ? roundGrade(day.maxGradePercent)
            : null,
        averageGradePercent:
          rawGradeWeightedMiles > 0
            ? roundGrade(rawGradeWeightedTotal / rawGradeWeightedMiles)
            : null,
        maxSmoothedGradePercent:
          typeof day.maxSmoothedGradePercent === 'number'
            ? roundGrade(day.maxSmoothedGradePercent)
            : null,
        averageSmoothedGradePercent:
          smoothedGradeWeightedMiles > 0
            ? roundGrade(smoothedGradeWeightedTotal / smoothedGradeWeightedMiles)
            : null,
      })
    )
    .sort((a, b) => a.day - b.day)
}

function pointWarning(point) {
  return {
    pointIndex: point.pointIndex,
    day: point.day,
    segmentId: point.segmentId,
    segmentName: point.segmentName,
    cumulativeMiles: point.cumulativeMiles,
    legMiles: point.validation.legMiles,
    rawElevationDeltaFt: point.validation.rawElevationDeltaFt,
    gradePercentRaw: point.gradePercentRaw,
    smoothedGradePercent: point.smoothedGradePercent,
  }
}

function maxAbsolute(values) {
  return values.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
}

function averageAbsolute(values) {
  return values.reduce((total, value) => total + Math.abs(value), 0) / values.length
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
