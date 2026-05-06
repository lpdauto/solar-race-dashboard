import type { RoutePoint } from '@/data/raceRoute'
import type {
  WeatherCacheRecord,
  WeatherPointForecast,
  WeatherRisk,
  WeatherStrategySummary,
  WindComponent,
} from '@/types/weather'

type OpenMeteoHourlyData = {
  time?: string[]
  temperature_2m?: number[]
  wind_speed_10m?: number[]
  wind_direction_10m?: number[]
  wind_gusts_10m?: number[]
  cloud_cover?: number[]
  precipitation_probability?: number[]
  shortwave_radiation?: number[]
}

type OpenMeteoForecastResponse = {
  hourly?: OpenMeteoHourlyData
}

const weatherCachePrefix = 'solar-race-weather-day-'
const openMeteoHourlyVariables = [
  'temperature_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'precipitation_probability',
  'shortwave_radiation',
]

export function buildOpenMeteoForecastUrl(lat: number, lng: number) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: openMeteoHourlyVariables.join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
    forecast_days: '5',
  })

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`
}

export async function fetchOpenMeteoForecast(lat: number, lng: number) {
  const response = await fetch(buildOpenMeteoForecastUrl(lat, lng))

  if (!response.ok) {
    throw new Error(`Open-Meteo returned ${response.status}`)
  }

  const data = (await response.json()) as OpenMeteoForecastResponse

  if (!data.hourly?.time?.length) {
    throw new Error('Open-Meteo returned no hourly forecast data')
  }

  return data.hourly
}

export async function fetchWeatherForRoutePoints(routePoints: RoutePoint[]) {
  const sampledPoints = sampleRoutePoints(routePoints)
  const targetDate = new Date()
  const settled = await Promise.allSettled(
    sampledPoints.map(async (point) => {
      const hourly = await fetchOpenMeteoForecast(point.lat, point.lng)
      const index = getClosestHourlyForecast(hourly, targetDate)

      return hourlyToForecast(point, hourly, index, 'open-meteo')
    })
  )

  return settled
    .filter(
      (
        result
      ): result is PromiseFulfilledResult<WeatherPointForecast> =>
        result.status === 'fulfilled'
    )
    .map((result) => result.value)
}

export function getClosestHourlyForecast(
  hourlyData: OpenMeteoHourlyData,
  targetDate: Date
) {
  const times = hourlyData.time ?? []
  let bestIndex = 0
  let bestDelta = Number.POSITIVE_INFINITY

  times.forEach((time, index) => {
    const delta = Math.abs(new Date(time).getTime() - targetDate.getTime())

    if (delta < bestDelta) {
      bestDelta = delta
      bestIndex = index
    }
  })

  return bestIndex
}

export function calculateBearingDeg(pointA: RoutePoint, pointB: RoutePoint) {
  const lat1 = toRadians(pointA.lat)
  const lat2 = toRadians(pointB.lat)
  const deltaLng = toRadians(pointB.lng - pointA.lng)
  const y = Math.sin(deltaLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)

  return normalizeDegrees(toDegrees(Math.atan2(y, x)))
}

export function calculateWindComponent(
  routeBearingDeg: number,
  windFromDeg: number,
  windSpeedMph: number
): WindComponent {
  const windToDeg = normalizeDegrees(windFromDeg + 180)
  const angleDifferenceDeg = smallestAngleDifference(routeBearingDeg, windToDeg)
  const alongRouteMph = windSpeedMph * Math.cos(toRadians(angleDifferenceDeg))
  const crosswindMph = Math.abs(
    windSpeedMph * Math.sin(toRadians(angleDifferenceDeg))
  )
  const tailwindMph = Math.max(0, alongRouteMph)
  const headwindMph = Math.max(0, -alongRouteMph)
  const apparentType = classifyApparentWindType(
    headwindMph,
    tailwindMph,
    crosswindMph
  )

  return {
    apparentType,
    headwindMph,
    tailwindMph,
    crosswindMph,
    angleDifferenceDeg,
    strategyImpact: classifyWindRisk({
      apparentType,
      headwindMph,
      tailwindMph,
      crosswindMph,
      angleDifferenceDeg,
      strategyImpact: 'low',
    }),
  }
}

export function classifyWindRisk(component: WindComponent): WeatherRisk {
  if (component.headwindMph >= 18 || component.crosswindMph >= 22) {
    return 'severe'
  }

  if (component.headwindMph >= 12 || component.crosswindMph >= 16) {
    return 'high'
  }

  if (component.headwindMph >= 7 || component.crosswindMph >= 10) {
    return 'medium'
  }

  return 'low'
}

export function calculateWeatherStrategy(
  routePoints: RoutePoint[],
  forecasts: WeatherPointForecast[]
): WeatherStrategySummary {
  if (forecasts.length === 0) {
    return {
      averageHeadwindMph: 0,
      maxHeadwindMph: 0,
      maxCrosswindMph: 0,
      averageCloudCoverPercent: 0,
      averageSolarRadiationWm2: 0,
      weatherRisk: 'low',
      recommendedSpeedAdjustmentMph: 0,
      notes: ['No weather data available. Use route fallback strategy.'],
    }
  }

  const components = forecasts.map((forecast) => {
    const bearing = bearingForForecast(routePoints, forecast)

    return calculateWindComponent(
      bearing,
      forecast.windDirectionDeg,
      forecast.windSpeedMph
    )
  })
  const averageHeadwindMph = average(
    components.map((component) => component.headwindMph)
  )
  const maxHeadwindMph = Math.max(
    ...components.map((component) => component.headwindMph)
  )
  const maxCrosswindMph = Math.max(
    ...components.map((component) => component.crosswindMph)
  )
  const averageCloudCoverPercent = average(
    forecasts.map((forecast) => forecast.cloudCoverPercent)
  )
  const averageSolarRadiationWm2 = average(
    forecasts.map((forecast) => forecast.shortwaveRadiationWm2 ?? 0)
  )
  const maxRisk = maxWeatherRisk([
    ...components.map((component) => component.strategyImpact),
    averageCloudCoverPercent > 75 ? 'high' : averageCloudCoverPercent > 55 ? 'medium' : 'low',
    Math.max(...forecasts.map((forecast) => forecast.temperatureF)) > 98
      ? 'high'
      : 'low',
  ])
  const notes = buildWeatherNotes({
    maxHeadwindMph,
    maxCrosswindMph,
    averageCloudCoverPercent,
    averageSolarRadiationWm2,
    maxTemperatureF: Math.max(...forecasts.map((forecast) => forecast.temperatureF)),
  })

  return {
    averageHeadwindMph,
    maxHeadwindMph,
    maxCrosswindMph,
    averageCloudCoverPercent,
    averageSolarRadiationWm2,
    weatherRisk: maxRisk,
    recommendedSpeedAdjustmentMph: speedAdjustmentForRisk(maxRisk, maxHeadwindMph),
    notes,
  }
}

export function cacheWeatherForDay(
  dayNumber: number,
  forecasts: WeatherPointForecast[]
) {
  const record: WeatherCacheRecord = {
    dayNumber,
    cachedAt: new Date().toISOString(),
    forecasts,
  }

  window.localStorage.setItem(cacheKeyForDay(dayNumber), JSON.stringify(record))
}

export function loadCachedWeatherForDay(dayNumber: number) {
  try {
    const stored = window.localStorage.getItem(cacheKeyForDay(dayNumber))

    if (!stored) {
      return null
    }

    return JSON.parse(stored) as WeatherCacheRecord
  } catch {
    return null
  }
}

export function clearCachedWeatherForDay(dayNumber: number) {
  window.localStorage.removeItem(cacheKeyForDay(dayNumber))
}

export function getWeatherCacheAge(fetchedAt: string) {
  return Date.now() - new Date(fetchedAt).getTime()
}

export function getWeatherCacheAgeText(fetchedAt: string) {
  const ageMs = getWeatherCacheAge(fetchedAt)
  const minutes = Math.max(0, Math.round(ageMs / 60000))

  if (minutes < 60) {
    return `${minutes} min old`
  }

  const hours = Math.round(minutes / 60)

  if (hours < 48) {
    return `${hours} hr old`
  }

  return `${Math.round(hours / 24)} days old`
}

export function createMockWeatherForRoute(
  dayNumber: number,
  routePoints: RoutePoint[]
): WeatherPointForecast[] {
  const sampledPoints = sampleRoutePoints(routePoints)
  const now = new Date().toISOString()

  return sampledPoints.map((point, index) => {
    const westTexasBoost = dayNumber >= 4 ? 8 : 0
    const windSpeedMph = 8 + dayNumber * 1.8 + index * 0.9
    const cloudCoverPercent = dayNumber === 3 ? 38 : dayNumber === 5 ? 18 : 28

    return {
      routePointMile: point.mile,
      lat: point.lat,
      lng: point.lng,
      label: point.label,
      fetchedAt: now,
      forecastTime: now,
      temperatureF: 88 + westTexasBoost + index,
      windSpeedMph,
      windGustMph: windSpeedMph + 8,
      windDirectionDeg: dayNumber >= 4 ? 230 : 175,
      cloudCoverPercent,
      precipitationProbabilityPercent: dayNumber === 2 ? 18 : 5,
      shortwaveRadiationWm2: Math.max(350, 850 - cloudCoverPercent * 6),
      source: 'mock',
    }
  })
}

export function markForecastsAsCache(
  forecasts: WeatherPointForecast[]
): WeatherPointForecast[] {
  return forecasts.map((forecast) => ({
    ...forecast,
    source: 'cache',
  }))
}

function sampleRoutePoints(routePoints: RoutePoint[]) {
  if (routePoints.length <= 8) {
    return routePoints
  }

  const selected: RoutePoint[] = []
  const totalMiles = routePoints[routePoints.length - 1]?.mile ?? 0
  const mileInterval = Math.max(20, totalMiles / 7)

  for (let targetMile = 0; targetMile <= totalMiles; targetMile += mileInterval) {
    const nearest = routePoints.reduce((best, point) =>
      Math.abs(point.mile - targetMile) < Math.abs(best.mile - targetMile)
        ? point
        : best
    )

    if (!selected.some((point) => point.mile === nearest.mile)) {
      selected.push(nearest)
    }
  }

  const lastPoint = routePoints[routePoints.length - 1]

  if (lastPoint && !selected.some((point) => point.mile === lastPoint.mile)) {
    selected.push(lastPoint)
  }

  return selected.slice(0, 8).sort((a, b) => a.mile - b.mile)
}

function hourlyToForecast(
  point: RoutePoint,
  hourly: OpenMeteoHourlyData,
  index: number,
  source: 'open-meteo'
): WeatherPointForecast {
  return {
    routePointMile: point.mile,
    lat: point.lat,
    lng: point.lng,
    label: point.label,
    fetchedAt: new Date().toISOString(),
    forecastTime: hourly.time?.[index] ?? new Date().toISOString(),
    temperatureF: hourly.temperature_2m?.[index] ?? 85,
    windSpeedMph: hourly.wind_speed_10m?.[index] ?? 0,
    windGustMph: hourly.wind_gusts_10m?.[index],
    windDirectionDeg: hourly.wind_direction_10m?.[index] ?? 0,
    cloudCoverPercent: hourly.cloud_cover?.[index] ?? 0,
    precipitationProbabilityPercent: hourly.precipitation_probability?.[index],
    shortwaveRadiationWm2: hourly.shortwave_radiation?.[index],
    source,
  }
}

function bearingForForecast(
  routePoints: RoutePoint[],
  forecast: WeatherPointForecast
) {
  const pointIndex = routePoints.findIndex(
    (point) => point.mile === forecast.routePointMile
  )
  const start = routePoints[Math.max(0, pointIndex)]
  const end =
    routePoints[Math.min(routePoints.length - 1, Math.max(0, pointIndex + 1))] ??
    routePoints[pointIndex - 1]

  if (!start || !end || start === end) {
    return 90
  }

  return calculateBearingDeg(start, end)
}

function buildWeatherNotes({
  maxHeadwindMph,
  maxCrosswindMph,
  averageCloudCoverPercent,
  averageSolarRadiationWm2,
  maxTemperatureF,
}: {
  maxHeadwindMph: number
  maxCrosswindMph: number
  averageCloudCoverPercent: number
  averageSolarRadiationWm2: number
  maxTemperatureF: number
}) {
  const notes: string[] = []

  if (maxHeadwindMph >= 12) {
    notes.push('Headwind may raise Wh/mile. Reduce target speed if live efficiency drifts high.')
  }

  if (maxCrosswindMph >= 16) {
    notes.push('Crosswind may affect stability. Avoid aggressive steering corrections.')
  }

  if (averageCloudCoverPercent >= 55) {
    notes.push('Cloud cover may reduce solar recovery. Protect battery reserve.')
  }

  if (averageSolarRadiationWm2 >= 700) {
    notes.push('Strong solar radiation supports recovery if array exposure is clean.')
  }

  if (maxTemperatureF >= 98) {
    notes.push('High temperature risk. Watch controller and motor temperatures.')
  }

  if (notes.length === 0) {
    notes.push('Weather looks manageable. Maintain disciplined aero-efficient pacing.')
  }

  return notes
}

function cacheKeyForDay(dayNumber: number) {
  return `${weatherCachePrefix}${dayNumber}`
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function classifyApparentWindType(
  headwindMph: number,
  tailwindMph: number,
  crosswindMph: number
) {
  if (headwindMph > crosswindMph && headwindMph > tailwindMph) return 'headwind'
  if (tailwindMph > crosswindMph && tailwindMph > headwindMph) return 'tailwind'
  if (crosswindMph > 8) return 'crosswind'
  return 'mixed'
}

function maxWeatherRisk(risks: WeatherRisk[]): WeatherRisk {
  return risks.sort((a, b) => riskRank(b) - riskRank(a))[0] ?? 'low'
}

function speedAdjustmentForRisk(risk: WeatherRisk, maxHeadwindMph: number) {
  if (risk === 'severe') return -5
  if (risk === 'high') return -3
  if (risk === 'medium' || maxHeadwindMph >= 7) return -1
  return 0
}

function riskRank(risk: WeatherRisk) {
  if (risk === 'severe') return 4
  if (risk === 'high') return 3
  if (risk === 'medium') return 2
  return 1
}

function smallestAngleDifference(a: number, b: number) {
  const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b))
  return diff > 180 ? 360 - diff : diff
}

function normalizeDegrees(degrees: number) {
  return ((degrees % 360) + 360) % 360
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI
}
