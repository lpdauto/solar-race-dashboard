import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../..')
const routeDataPath = path.join(projectRoot, 'src/data/routeData.json')
const raceRoutePath = path.join(projectRoot, 'src/data/raceRoute.ts')
const outputPath = path.join(projectRoot, 'src/data/mappedRaceSegments.json')

const routeData = JSON.parse(await readFile(routeDataPath, 'utf8'))
const raceRoute = extractRaceRoute(await readFile(raceRoutePath, 'utf8'))
const mappedOutput = mapRaceSegmentsToKmlMileage({ raceRoute, routeData })

await writeFile(outputPath, `${JSON.stringify(mappedOutput, null, 2)}\n`, 'utf8')

console.log('Mapped raceRoute strategy segments onto KML driving mileage')
console.log(`Mapped segments: ${mappedOutput.mappedSegments.length}`)
mappedOutput.daySummaries.forEach((summary) => {
  console.log(
    `Day ${summary.day}: ${summary.mappingConfidence} confidence, app ${summary.appMiles} mi, KML driving ${summary.kmlDrivingMiles} mi, diff ${summary.drivingMileageDifference} mi`
  )
})
console.log(`Wrote ${path.relative(projectRoot, outputPath)}`)

function mapRaceSegmentsToKmlMileage({ raceRoute, routeData }) {
  const daySummaries = raceRoute.map((raceDay) =>
    createDayMappingSummary(raceDay, routeData.segments)
  )
  const mappedSegments = raceRoute.flatMap((raceDay) => {
    const daySummary = daySummaries.find((summary) => summary.day === raceDay.day)

    if (!daySummary) return []

    return raceDay.segments.map((segment, index) =>
      mapSegment({
        raceDay,
        segment,
        segmentIndex: index,
        daySummary,
      })
    )
  })

  return {
    generatedAt: new Date().toISOString(),
    mappingMethod:
      'Proportional per-day mapping from app semantic segment mile ranges onto KML-derived driving mileage.',
    notes: [
      'KML driving mileage is treated as the geometry/mileage authority.',
      'raceRoute.ts remains the semantic strategy, terrain, and risk authority.',
      'Mapping is proportional and does not yet snap segment boundaries to GPS turns, stops, or intersections.',
      'Trailer mileage is preserved in day summaries but excluded from kmlDrivingMileStart/kmlDrivingMileEnd because trailered miles do not count as official driven race mileage.',
    ],
    daySummaries,
    mappedSegments,
  }
}

function createDayMappingSummary(raceDay, kmlSegments) {
  const daySegments = kmlSegments.filter((segment) => segment.day === raceDay.day)
  const kmlDrivingMiles = daySegments
    .filter((segment) => segment.segmentType === 'driving')
    .reduce((total, segment) => total + segment.segmentMiles, 0)
  const kmlTrailerMiles = daySegments
    .filter((segment) => segment.segmentType === 'trailer')
    .reduce((total, segment) => total + segment.segmentMiles, 0)
  const kmlTotalMiles = kmlDrivingMiles + kmlTrailerMiles
  const drivingMileageDifference = kmlDrivingMiles - raceDay.distanceMiles

  return {
    day: raceDay.day,
    appMiles: roundMiles(raceDay.distanceMiles),
    kmlDrivingMiles: roundMiles(kmlDrivingMiles),
    kmlTotalMiles: roundMiles(kmlTotalMiles),
    kmlTrailerMiles: roundMiles(kmlTrailerMiles),
    drivingMileageDifference: roundMiles(drivingMileageDifference),
    mappingConfidence: confidenceForDifference(
      Math.abs(drivingMileageDifference),
      raceDay.distanceMiles
    ),
    mappedSegmentCount: raceDay.segments.length,
  }
}

function mapSegment({ raceDay, segment, segmentIndex, daySummary }) {
  const appStartRatio = safeRatio(segment.mileStart, raceDay.distanceMiles)
  const appEndRatio = safeRatio(segment.mileEnd, raceDay.distanceMiles)

  return {
    day: raceDay.day,
    appSegmentId: `day-${raceDay.day}-app-segment-${segmentIndex + 1}`,
    appSegmentTitle: segment.title,
    appMileStart: roundMiles(segment.mileStart),
    appMileEnd: roundMiles(segment.mileEnd),
    kmlMileStart: roundMiles(appStartRatio * daySummary.kmlTotalMiles),
    kmlMileEnd: roundMiles(appEndRatio * daySummary.kmlTotalMiles),
    kmlDrivingMileStart: roundMiles(appStartRatio * daySummary.kmlDrivingMiles),
    kmlDrivingMileEnd: roundMiles(appEndRatio * daySummary.kmlDrivingMiles),
    segmentType: segment.type,
    risk: segment.risk,
    terrainSummary: segment.notes,
    strategy: segment.strategy,
    mappingConfidence: daySummary.mappingConfidence,
    mappingNotes: [
      'Mapped proportionally by app segment mile range within the app day distance.',
      `Day ${raceDay.day} app miles ${daySummary.appMiles}; KML driving miles ${daySummary.kmlDrivingMiles}; difference ${daySummary.drivingMileageDifference} mi.`,
      'This is not exact GPS turn-by-turn matching.',
    ],
  }
}

function extractRaceRoute(source) {
  const marker = 'export const raceRoute'
  const start = source.indexOf(marker)

  if (start === -1) {
    throw new Error('Could not find raceRoute export.')
  }

  const assignment = source.indexOf('=', start)
  const arrayStart = source.indexOf('[', assignment)
  const arrayEnd = findMatchingBracket(source, arrayStart)
  const arraySource = source.slice(arrayStart, arrayEnd + 1)

  return Function(`"use strict"; return (${arraySource});`)()
}

function findMatchingBracket(source, startIndex) {
  let depth = 0
  let quote = null
  let escaped = false

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }

    if (char === '[') depth += 1
    if (char === ']') depth -= 1

    if (depth === 0) return index
  }

  throw new Error('Could not find end of raceRoute array.')
}

function confidenceForDifference(absoluteDifferenceMiles, appMiles) {
  const differencePercent = appMiles > 0 ? absoluteDifferenceMiles / appMiles : 1

  if (absoluteDifferenceMiles <= 3 || differencePercent <= 0.02) return 'HIGH'
  if (absoluteDifferenceMiles <= 7 || differencePercent <= 0.05) return 'MEDIUM'
  return 'LOW'
}

function safeRatio(value, denominator) {
  return denominator > 0 ? value / denominator : 0
}

function roundMiles(value) {
  return Number(value.toFixed(4))
}
