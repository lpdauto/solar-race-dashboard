import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../..')
const defaultRouteDataPath = path.join(projectRoot, 'src/data/routeData.json')
const defaultRaceRoutePath = path.join(projectRoot, 'src/data/raceRoute.ts')
const defaultOutputPath = path.join(projectRoot, 'src/data/routeValidationReport.json')

const routeDataPath = process.argv[2] ?? defaultRouteDataPath
const raceRoutePath = process.argv[3] ?? defaultRaceRoutePath
const outputPath = process.argv[4] ?? defaultOutputPath

const routeData = JSON.parse(await readFile(routeDataPath, 'utf8'))
const raceRouteText = await readFile(raceRoutePath, 'utf8')
const raceRoute = extractRaceRoute(raceRouteText)
const report = buildRouteValidationReport(routeData, raceRoute)

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(printValidationReport(report))
console.log(`Wrote ${path.relative(projectRoot, outputPath)}`)

function buildRouteValidationReport(routeData, raceRoute) {
  const generatedDays = groupGeneratedSegmentsByDay(routeData.segments)
  const existingTotalMiles = roundMiles(
    raceRoute.reduce((total, day) => total + day.distanceMiles, 0)
  )
  const perDayComparison = raceRoute.map((existingDay) => {
    const generatedDay = generatedDays.get(existingDay.day) ?? emptyGeneratedDay(existingDay.day)
    const segmentComparison = compareSegmentsByName({
      day: existingDay.day,
      generatedSegments: generatedDay.segments,
      existingSegments: existingDay.segments,
    })

    return {
      day: existingDay.day,
      existing: {
        start: existingDay.start,
        end: existingDay.end,
        distanceMiles: existingDay.distanceMiles,
        segmentCount: existingDay.segments.length,
      },
      generated: {
        totalMiles: roundMiles(generatedDay.totalMiles),
        drivingMiles: roundMiles(generatedDay.drivingMiles),
        trailerMiles: roundMiles(generatedDay.trailerMiles),
        segmentCount: generatedDay.segments.length,
        drivingSegmentCount: generatedDay.segments.filter(
          (segment) => segment.segmentType === 'driving'
        ).length,
        trailerSegmentCount: generatedDay.segments.filter(
          (segment) => segment.segmentType === 'trailer'
        ).length,
      },
      differences: {
        generatedTotalMinusExistingMiles: roundMiles(
          generatedDay.totalMiles - existingDay.distanceMiles
        ),
        generatedDrivingMinusExistingMiles: roundMiles(
          generatedDay.drivingMiles - existingDay.distanceMiles
        ),
        generatedTrailerMiles: roundMiles(generatedDay.trailerMiles),
      },
      segmentComparison,
    }
  })
  const generatedOnlyDays = Array.from(generatedDays.keys())
    .filter((day) => !raceRoute.some((existingDay) => existingDay.day === day))
    .sort((a, b) => a - b)

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      routeDataPath: path.relative(projectRoot, routeDataPath),
      raceRoutePath: path.relative(projectRoot, raceRoutePath),
    },
    totals: {
      generatedTotalRouteMiles: routeData.stats.totalRouteMiles,
      generatedDrivingMiles: routeData.stats.totalDrivingMiles,
      generatedTrailerMiles: routeData.stats.totalTrailerMiles,
      existingAppTotalMiles: existingTotalMiles,
      generatedTotalMinusExistingMiles: roundMiles(
        routeData.stats.totalRouteMiles - existingTotalMiles
      ),
      generatedDrivingMinusExistingMiles: roundMiles(
        routeData.stats.totalDrivingMiles - existingTotalMiles
      ),
    },
    perDayComparison,
    generatedOnlyDays,
    existingOnlyDays: raceRoute
      .filter((day) => !generatedDays.has(day.day))
      .map((day) => day.day),
    routeGaps: routeData.validation.warnings.filter((warning) =>
      /\bGap of\b/i.test(warning)
    ),
    kmlValidationWarnings: routeData.validation.warnings,
    notes: [
      'Existing raceRoute.ts uses hand-authored strategy/terrain segments.',
      'Generated routeData.json uses SCC KML driving/trailer line segments.',
      'Exact per-segment name matches are expected to be sparse unless raceRoute.ts is renamed to KML segment names.',
      'For strategy mileage, generated driving miles are the closest KML-derived match to existing app day distance because trailer miles do not count as official driven race mileage.',
    ],
  }
}

function groupGeneratedSegmentsByDay(segments) {
  const days = new Map()

  for (const segment of segments) {
    const day = days.get(segment.day) ?? emptyGeneratedDay(segment.day)

    day.totalMiles += segment.segmentMiles
    if (segment.segmentType === 'driving') {
      day.drivingMiles += segment.segmentMiles
    } else if (segment.segmentType === 'trailer') {
      day.trailerMiles += segment.segmentMiles
    }
    day.segments.push(segment)
    days.set(segment.day, day)
  }

  return days
}

function emptyGeneratedDay(day) {
  return {
    day,
    totalMiles: 0,
    drivingMiles: 0,
    trailerMiles: 0,
    segments: [],
  }
}

function compareSegmentsByName({ day, generatedSegments, existingSegments }) {
  const generatedByName = new Map(
    generatedSegments.map((segment) => [normalizeName(segment.segmentName), segment])
  )
  const existingByName = new Map(
    existingSegments.map((segment) => [normalizeName(segment.title), segment])
  )
  const matchedNames = Array.from(generatedByName.keys()).filter((name) =>
    existingByName.has(name)
  )

  return {
    nameMatchedSegments: matchedNames.map((name) => {
      const generatedSegment = generatedByName.get(name)
      const existingSegment = existingByName.get(name)
      const existingMiles = existingSegment.mileEnd - existingSegment.mileStart

      return {
        day,
        segmentName: generatedSegment.segmentName,
        generatedMiles: generatedSegment.segmentMiles,
        existingMiles: roundMiles(existingMiles),
        differenceMiles: roundMiles(generatedSegment.segmentMiles - existingMiles),
      }
    }),
    generatedSegmentsMissingFromExisting: generatedSegments
      .filter((segment) => !existingByName.has(normalizeName(segment.segmentName)))
      .map((segment) => ({
        day,
        segmentId: segment.segmentId,
        segmentName: segment.segmentName,
        segmentType: segment.segmentType,
        segmentMiles: segment.segmentMiles,
      })),
    existingSegmentsMissingFromGenerated: existingSegments
      .filter((segment) => !generatedByName.has(normalizeName(segment.title)))
      .map((segment) => ({
        day,
        segmentName: segment.title,
        segmentType: segment.type,
        segmentMiles: roundMiles(segment.mileEnd - segment.mileStart),
      })),
    ordinalComparison: generatedSegments.map((generatedSegment, index) => {
      const existingSegment = existingSegments[index]

      return {
        day,
        generatedSegmentName: generatedSegment.segmentName,
        generatedSegmentType: generatedSegment.segmentType,
        generatedMiles: generatedSegment.segmentMiles,
        existingSegmentName: existingSegment?.title,
        existingSegmentType: existingSegment?.type,
        existingMiles: existingSegment
          ? roundMiles(existingSegment.mileEnd - existingSegment.mileStart)
          : undefined,
        differenceMiles: existingSegment
          ? roundMiles(
              generatedSegment.segmentMiles -
                (existingSegment.mileEnd - existingSegment.mileStart)
            )
          : undefined,
        matchBasis: existingSegment ? 'day-order-only' : 'missing-existing-segment',
      }
    }),
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

function printValidationReport(report) {
  const lines = [
    'Route mileage validation report',
    `Generated total route miles: ${report.totals.generatedTotalRouteMiles}`,
    `Generated driving miles: ${report.totals.generatedDrivingMiles}`,
    `Generated trailer miles: ${report.totals.generatedTrailerMiles}`,
    `Existing app total miles: ${report.totals.existingAppTotalMiles}`,
    `Generated driving minus existing: ${report.totals.generatedDrivingMinusExistingMiles}`,
    'Per-day driving mileage differences:',
  ]

  report.perDayComparison.forEach((day) => {
    lines.push(
      `- Day ${day.day}: generated driving ${day.generated.drivingMiles} mi vs app ${day.existing.distanceMiles} mi (${day.differences.generatedDrivingMinusExistingMiles} mi)`
    )
  })

  if (report.routeGaps.length > 0) {
    lines.push('Route gaps:')
    report.routeGaps.forEach((gap) => lines.push(`- ${gap}`))
  }

  return lines.join('\n')
}

function normalizeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function roundMiles(value) {
  return Number(value.toFixed(4))
}
