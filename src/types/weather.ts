export type WeatherSource = 'open-meteo' | 'nws' | 'mock' | 'cache'

export type WeatherRisk = 'low' | 'medium' | 'high' | 'severe'

export type WeatherPointForecast = {
  routePointMile: number
  lat: number
  lng: number
  label?: string
  fetchedAt: string
  forecastTime: string
  temperatureF: number
  windSpeedMph: number
  windGustMph?: number
  windDirectionDeg: number
  cloudCoverPercent: number
  precipitationProbabilityPercent?: number
  shortwaveRadiationWm2?: number
  source: WeatherSource
}

export type WindComponent = {
  apparentType: 'headwind' | 'tailwind' | 'crosswind' | 'mixed'
  headwindMph: number
  tailwindMph: number
  crosswindMph: number
  angleDifferenceDeg: number
  strategyImpact: WeatherRisk
}

export type WeatherStrategySummary = {
  averageHeadwindMph: number
  maxHeadwindMph: number
  maxCrosswindMph: number
  averageCloudCoverPercent: number
  averageSolarRadiationWm2: number
  weatherRisk: WeatherRisk
  recommendedSpeedAdjustmentMph: number
  notes: string[]
}

export type WeatherCacheRecord = {
  dayNumber: number
  cachedAt: string
  forecasts: WeatherPointForecast[]
}
