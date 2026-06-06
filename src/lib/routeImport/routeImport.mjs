import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const earthRadiusMiles = 3958.7613

export async function generateRouteDataFromKmlFile({
  inputPath,
  outputPath,
} = {}) {
  if (!inputPath) {
    throw new Error('inputPath is required')
  }

  const kmlText = await readFile(inputPath, 'utf8')
  const routeData = parseSccKml(kmlText, {
    sourceFile: path.basename(inputPath),
  })

  if (outputPath) {
    await writeFile(outputPath, `${JSON.stringify(routeData, null, 2)}\n`, 'utf8')
  }

  return routeData
}

export function parseSccKml(kmlText, { sourceFile = 'unknown.kml' } = {}) {
  const folders = extractBlocks(kmlText, 'Folder')
  const routePoints = []
  const segments = []
  const checkpoints = []
  const warnings = []
  let cumulativeMiles = 0

  for (const folderXml of folders) {
    const folderName = readTag(folderXml, 'name')
    const dayMatch = folderName.match(/^Day\s+(\d+)(?:\s+Stops)?$/i)

    if (!dayMatch) continue

    const day = Number(dayMatch[1])
    const isStopsFolder = /\bStops$/i.test(folderName)
    const placemarks = extractBlocks(folderXml, 'Placemark')

    for (const placemarkXml of placemarks) {
      const placemarkName = readTag(placemarkXml, 'name')
      const description = readTag(placemarkXml, 'description')

      if (isStopsFolder) {
        const coordinates = parseCoordinateText(readTag(placemarkXml, 'coordinates'))

        if (coordinates.length === 0) {
          warnings.push(`Stop "${placemarkName}" on day ${day} has no coordinates.`)
          continue
        }

        checkpoints.push({
          checkpointId: slugify(`day-${day}-${placemarkName}-${checkpoints.length + 1}`),
          checkpointName: placemarkName,
          description: description || undefined,
          day,
          latitude: roundCoordinate(coordinates[0].latitude),
          longitude: roundCoordinate(coordinates[0].longitude),
        })
        continue
      }

      const segmentKind = detectSegmentType(placemarkName)

      if (!segmentKind) continue

      const coordinates = parseCoordinateText(readTag(placemarkXml, 'coordinates'))
      const segmentId = slugify(`day-${day}-${placemarkName}`)

      if (coordinates.length < 2) {
        warnings.push(
          `Segment "${placemarkName}" on day ${day} has fewer than 2 route points.`
        )
      }

      const previousPoint = routePoints[routePoints.length - 1]
      const firstCoordinate = coordinates[0]

      if (previousPoint && firstCoordinate) {
        const gapMiles = distanceMiles(previousPoint, firstCoordinate)

        if (gapMiles > 0.25) {
          warnings.push(
            `Gap of ${roundMiles(gapMiles)} mi before ${placemarkName} on day ${day}.`
          )
        }
      }

      const segmentStartIndex = routePoints.length
      const cumulativeStartMiles = cumulativeMiles
      let segmentMiles = 0
      let previousCoordinate = null

      coordinates.forEach((coordinate, coordinateIndex) => {
        if (previousCoordinate) {
          const legMiles = distanceMiles(previousCoordinate, coordinate)
          segmentMiles += legMiles
          cumulativeMiles += legMiles
        }

        routePoints.push({
          segmentId,
          segmentName: placemarkName,
          segmentType: segmentKind,
          day,
          pointIndex: routePoints.length,
          segmentPointIndex: coordinateIndex,
          latitude: roundCoordinate(coordinate.latitude),
          longitude: roundCoordinate(coordinate.longitude),
          cumulativeMiles: roundMiles(cumulativeMiles),
          segmentMiles: roundMiles(segmentMiles),
        })

        previousCoordinate = coordinate
      })

      segments.push({
        segmentId,
        segmentName: placemarkName,
        segmentType: segmentKind,
        day,
        pointStartIndex: segmentStartIndex,
        pointEndIndex: routePoints.length - 1,
        pointCount: coordinates.length,
        cumulativeStartMiles: roundMiles(cumulativeStartMiles),
        cumulativeEndMiles: roundMiles(cumulativeMiles),
        segmentMiles: roundMiles(segmentMiles),
      })
    }
  }

  const drivingSegments = segments.filter((segment) => segment.segmentType === 'driving')
  const trailerSegments = segments.filter((segment) => segment.segmentType === 'trailer')
  const stats = {
    totalRouteMiles: roundMiles(cumulativeMiles),
    totalDrivingMiles: roundMiles(
      drivingSegments.reduce((total, segment) => total + segment.segmentMiles, 0)
    ),
    totalTrailerMiles: roundMiles(
      trailerSegments.reduce((total, segment) => total + segment.segmentMiles, 0)
    ),
    drivingSegmentCount: drivingSegments.length,
    trailerSegmentCount: trailerSegments.length,
    checkpointCount: checkpoints.length,
    routePointCount: routePoints.length,
  }

  return {
    source: {
      name: readTag(kmlText, 'name') || '2026 Solar Car Challenge',
      sourceFile,
      generatedAt: new Date().toISOString(),
      elevationIncluded: false,
      weatherIncluded: false,
    },
    stats,
    segments,
    checkpoints,
    routePoints,
    validation: {
      warningCount: warnings.length,
      warnings,
    },
  }
}

export function printRouteValidationReport(routeData) {
  const lines = [
    'SCC KML route import report',
    `Source: ${routeData.source.sourceFile}`,
    `Route points: ${routeData.stats.routePointCount}`,
    `Total route miles: ${routeData.stats.totalRouteMiles}`,
    `Driving miles: ${routeData.stats.totalDrivingMiles}`,
    `Trailer miles: ${routeData.stats.totalTrailerMiles}`,
    `Driving segments: ${routeData.stats.drivingSegmentCount}`,
    `Trailer segments: ${routeData.stats.trailerSegmentCount}`,
    `Checkpoints/stops: ${routeData.stats.checkpointCount}`,
    `Validation warnings: ${routeData.validation.warningCount}`,
  ]

  if (routeData.validation.warnings.length > 0) {
    lines.push('Warnings:')
    routeData.validation.warnings.forEach((warning) => {
      lines.push(`- ${warning}`)
    })
  }

  return lines.join('\n')
}

function extractBlocks(xml, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi')
  return Array.from(xml.matchAll(pattern), (match) => match[1])
}

function readTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))

  return match ? decodeXmlText(match[1].trim()) : ''
}

function decodeXmlText(value) {
  return value
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .trim()
}

function parseCoordinateText(value) {
  return value
    .split(/\s+/)
    .map((coordinateText) => coordinateText.trim())
    .filter(Boolean)
    .flatMap((coordinateText) => {
      const [longitude, latitude] = coordinateText
        .split(',')
        .map((part) => Number(part))

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return []
      }

      return [{ latitude, longitude }]
    })
}

function detectSegmentType(name) {
  if (/^Driving Segment\b/i.test(name)) return 'driving'
  if (/^Trailer Segment\b/i.test(name)) return 'trailer'
  return null
}

function distanceMiles(a, b) {
  const lat1 = degreesToRadians(a.latitude)
  const lat2 = degreesToRadians(b.latitude)
  const deltaLat = degreesToRadians(b.latitude - a.latitude)
  const deltaLng = degreesToRadians(b.longitude - a.longitude)
  const sinLat = Math.sin(deltaLat / 2)
  const sinLng = Math.sin(deltaLng / 2)
  const haversine =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180)
}

function roundMiles(value) {
  return Number(value.toFixed(4))
}

function roundCoordinate(value) {
  return Number(value.toFixed(7))
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
