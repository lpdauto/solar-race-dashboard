import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../..')
const routeDataPath = path.join(projectRoot, 'src/data/routeData.json')
const outputPath = path.join(projectRoot, 'src/data/routeElevation.json')
const partialOutputPath = path.join(projectRoot, 'src/data/routeElevation.partial.json')
const noiseThresholdFt = 3
const metersToFeet = 3.280839895
const feetPerMile = 5280
const defaultBatchSize = 100
const defaultDelayMs = 350
const providerUrl = 'https://api.opentopodata.org/v1/ned10m'
const mode = process.argv[2] ?? 'mock'

const routeData = JSON.parse(await readFile(routeDataPath, 'utf8'))

if (mode === 'mock') {
  const routeElevation = createElevationData({
    routeData,
    source: 'mock',
    providerUrl: null,
    elevationsFt: routeData.routePoints.map(() => null),
    failedBatches: [],
  })

  await writeFile(outputPath, `${JSON.stringify(routeElevation, null, 2)}\n`, 'utf8')
  printSummary(routeElevation)
} else if (mode === 'opentopodata') {
  const routeElevation = await createOpenTopoDataElevation(routeData)

  await writeFile(outputPath, `${JSON.stringify(routeElevation, null, 2)}\n`, 'utf8')
  await rm(partialOutputPath, { force: true })
  printSummary(routeElevation)
} else {
  throw new Error(`Unknown elevation enrichment mode "${mode}".`)
}

process.exit(0)

async function createOpenTopoDataElevation(routeData) {
  const elevationsFt = await readPartialElevations(routeData.routePoints.length)
  const failedBatches = []
  const totalBatches = Math.ceil(routeData.routePoints.length / defaultBatchSize)
  const resumedPoints = elevationsFt.filter((value) => typeof value === 'number').length

  console.log(
    `Fetching OpenTopoData elevations in ${totalBatches} batches of ${defaultBatchSize} points`
  )
  if (resumedPoints > 0) {
    console.log(`Resuming from partial progress: ${resumedPoints}/${routeData.routePoints.length} points`)
  }

  for (let startIndex = 0; startIndex < routeData.routePoints.length; startIndex += defaultBatchSize) {
    const batchIndex = Math.floor(startIndex / defaultBatchSize) + 1
    const points = routeData.routePoints.slice(startIndex, startIndex + defaultBatchSize)

    if (
      points.every((_, offset) => typeof elevationsFt[startIndex + offset] === 'number')
    ) {
      continue
    }

    try {
      const batchElevationsFt = await fetchOpenTopoDataBatch(points)

      batchElevationsFt.forEach((elevationFt, offset) => {
        elevationsFt[startIndex + offset] = elevationFt
      })
    } catch (error) {
      failedBatches.push({
        batchIndex,
        startIndex,
        pointCount: points.length,
        error: error instanceof Error ? error.message : String(error),
      })
      await writePartial(routeData, elevationsFt, failedBatches)
      throw error
    }

    if (batchIndex % 10 === 0 || batchIndex === totalBatches) {
      console.log(`OpenTopoData batch ${batchIndex}/${totalBatches}`)
      await writePartial(routeData, elevationsFt, failedBatches)
    }

    await delay(defaultDelayMs)
  }

  return createElevationData({
    routeData,
    source: 'opentopodata',
    providerUrl,
    elevationsFt,
    failedBatches,
  })
}

async function readPartialElevations(pointCount) {
  try {
    const partial = JSON.parse(await readFile(partialOutputPath, 'utf8'))

    if (
      partial.source !== 'opentopodata' ||
      !Array.isArray(partial.points) ||
      partial.points.length !== pointCount
    ) {
      return Array.from({ length: pointCount }, () => null)
    }

    return partial.points.map((point) =>
      typeof point.elevationFt === 'number' ? point.elevationFt : null
    )
  } catch {
    return Array.from({ length: pointCount }, () => null)
  }
}

async function fetchOpenTopoDataBatch(points) {
  const locations = points
    .map((point) => `${point.latitude},${point.longitude}`)
    .join('|')
  const body = JSON.stringify({
    locations,
    interpolation: 'bilinear',
  })
  const maxAttempts = 3

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(providerUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const payload = await response.json()

      if (payload.status !== 'OK') {
        throw new Error(payload.error ?? `Provider status ${payload.status}`)
      }

      if (!Array.isArray(payload.results) || payload.results.length !== points.length) {
        throw new Error(
          `Expected ${points.length} elevations, received ${payload.results?.length ?? 0}`
        )
      }

      return payload.results.map((result) =>
        typeof result.elevation === 'number'
          ? roundFeet(result.elevation * metersToFeet)
          : null
      )
    } catch (error) {
      if (attempt === maxAttempts) throw error
      await delay(defaultDelayMs * attempt * 2)
    }
  }

  throw new Error('OpenTopoData request failed unexpectedly.')
}

function createElevationData({
  routeData,
  source,
  providerUrl,
  elevationsFt,
  failedBatches,
}) {
  const points = routeData.routePoints.map((point, index) => {
    const previousPoint = routeData.routePoints[index - 1]
    const previousElevationFt = index > 0 ? elevationsFt[index - 1] : null
    const elevationFt = elevationsFt[index]
    const rawDeltaFt =
      typeof elevationFt === 'number' && typeof previousElevationFt === 'number'
        ? elevationFt - previousElevationFt
        : 0
    const filteredDeltaFt =
      Math.abs(rawDeltaFt) >= noiseThresholdFt ? rawDeltaFt : 0
    const legMiles = previousPoint
      ? Math.max(0, point.cumulativeMiles - previousPoint.cumulativeMiles)
      : 0
    const gradePercent =
      legMiles > 0 && filteredDeltaFt !== 0
        ? roundGrade((filteredDeltaFt / (legMiles * feetPerMile)) * 100)
        : null

    return {
      ...point,
      elevationFt,
      gradePercent,
      elevationGainFt: filteredDeltaFt > 0 ? roundFeet(filteredDeltaFt) : 0,
      elevationLossFt: filteredDeltaFt < 0 ? roundFeet(Math.abs(filteredDeltaFt)) : 0,
    }
  })
  const segments = routeData.segments.map((segment) =>
    summarizeSegment(segment, points)
  )
  const days = summarizeDays(segments)

  return {
    generatedAt: new Date().toISOString(),
    source,
    mode: source,
    providerUrl,
    totalPoints: points.length,
    noiseThresholdFt,
    failedBatches,
    sourceRouteData: {
      generatedAt: routeData.source?.generatedAt,
      sourceFile: routeData.source?.sourceFile,
      totalRouteMiles: routeData.stats?.totalRouteMiles,
      totalDrivingMiles: routeData.stats?.totalDrivingMiles,
      totalTrailerMiles: routeData.stats?.totalTrailerMiles,
    },
    notes: [
      source === 'mock'
        ? 'Mock elevation mode intentionally does not call network APIs.'
        : 'OpenTopoData mode runs only in this offline generation script.',
      'Generated JSON should be committed for offline race use.',
      'Elevation deltas below 3 ft between adjacent points are treated as noise for gain/loss and grade calculations.',
      'TODO: plug Google Elevation or Mapbox terrain lookup here as alternate offline providers if needed.',
    ],
    days,
    segments,
    points,
  }
}

function summarizeSegment(segment, points) {
  const segmentPoints = points.slice(segment.pointStartIndex, segment.pointEndIndex + 1)
  const gradeValues = segmentPoints
    .map((point) => point.gradePercent)
    .filter((grade) => typeof grade === 'number')
  const absoluteGradeValues = gradeValues.map((grade) => Math.abs(grade))

  return {
    segmentId: segment.segmentId,
    segmentName: segment.segmentName,
    segmentType: segment.segmentType,
    day: segment.day,
    startMile: segment.cumulativeStartMiles,
    endMile: segment.cumulativeEndMiles,
    distanceMiles: segment.segmentMiles,
    elevationGainFt: roundFeet(
      segmentPoints.reduce((total, point) => total + point.elevationGainFt, 0)
    ),
    elevationLossFt: roundFeet(
      segmentPoints.reduce((total, point) => total + point.elevationLossFt, 0)
    ),
    maxGradePercent:
      absoluteGradeValues.length > 0 ? roundGrade(Math.max(...absoluteGradeValues)) : null,
    averageGradePercent:
      absoluteGradeValues.length > 0
        ? roundGrade(
            absoluteGradeValues.reduce((total, grade) => total + grade, 0) /
              absoluteGradeValues.length
          )
        : null,
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
        segmentCount: 0,
        gradeDistanceWeightedTotal: 0,
        gradeDistanceWeightedMiles: 0,
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
        day.gradeDistanceWeightedTotal +=
          segment.averageGradePercent * segment.distanceMiles
        day.gradeDistanceWeightedMiles += segment.distanceMiles
      }

      dayMap.set(segment.day, day)
      return dayMap
    }, new Map()).values()
  )
    .map(({ gradeDistanceWeightedTotal, gradeDistanceWeightedMiles, ...day }) => ({
      ...day,
      maxGradePercent:
        typeof day.maxGradePercent === 'number'
          ? roundGrade(day.maxGradePercent)
          : null,
      averageGradePercent:
        gradeDistanceWeightedMiles > 0
          ? roundGrade(gradeDistanceWeightedTotal / gradeDistanceWeightedMiles)
          : null,
    }))
    .sort((a, b) => a.day - b.day)
}

async function writePartial(routeData, elevationsFt, failedBatches) {
  const partialElevation = createElevationData({
    routeData,
    source: 'opentopodata',
    providerUrl,
    elevationsFt,
    failedBatches,
  })

  await writeFile(partialOutputPath, `${JSON.stringify(partialElevation, null, 2)}\n`, 'utf8')
}

function printSummary(routeElevation) {
  console.log(`${routeElevation.source} route elevation enrichment complete`)
  console.log(`Output points: ${routeElevation.points.length}`)
  console.log(`Segments: ${routeElevation.segments.length}`)
  console.log(`Days: ${routeElevation.days.length}`)
  console.log(`Failed batches: ${routeElevation.failedBatches.length}`)
  console.log(`Wrote ${path.relative(projectRoot, outputPath)}`)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function roundFeet(value) {
  return Number(value.toFixed(1))
}

function roundGrade(value) {
  return Number(value.toFixed(3))
}

function roundMiles(value) {
  return Number(value.toFixed(4))
}
