// Baseline efficiency test-run types (Test Mode "live Wh/mi" feature).
// Kept separate from src/types/telemetry.ts because these describe a
// derived/accumulated run, not a raw telemetry packet.

/**
 * One raw telemetry sample logged unconditionally (regardless of speed)
 * while a run is active. This is the full field set previously captured by
 * the old standalone Test Mode recorder -- kept as-is so CSV/JSON export
 * doesn't lose any fidelity now that recording lives inside the run.
 */
export type TestTelemetrySample = {
  timestamp: number
  gpsLat?: number | null
  gpsLng?: number | null
  gpsLatitude?: number | null
  gpsLongitude?: number | null
  gpsSpeedMps?: number | null
  gpsSpeedMph?: number | null
  gpsHeading?: number | null
  gpsAltitudeMeters?: number | null
  gpsAltitudeFeet?: number | null
  gpsAccuracyMeters?: number | null
  gpsClientTimestamp?: number | null
  gpsServerTimestamp?: number | null
  gpsAgeMs?: number | null
  gpsStatus?: string | null
  gpsProviderName?: string | null
  gpsSource?: string | null
  speedMph?: number | null
  distanceMiles?: number | null
  batterySocPercent?: number | null
  batteryVoltage?: number | null
  batteryCurrent?: number | null
  batteryPowerWatts?: number | null
  whPerMile?: number | null
  motorTempC?: number | null
  controllerTempC?: number | null
  controllerSpeedMph?: number | null
  motorRpm?: number | null
  throttlePercent?: number | null
  throttleVoltage?: number | null
  phaseA?: number | null
  phaseC?: number | null
  modulation?: number | null
  gear?: number | null
  controllerSerial?: string | null
  controllerFaultCode?: number | null
  controllerState?: string | null
  bleConnected?: boolean | null
  packetRateHz?: number | null
  solarPowerWatts?: number | null
  mpptPowerWatts?: number | null
  bmsConnected?: boolean | null
  bmsAddress?: string | null
  bmsVoltage?: number | null
  bmsCurrent?: number | null
  bmsPowerWatts?: number | null
  bmsSocPercent?: number | null
  avgCellVoltage?: number | null
  cellMinVoltage?: number | null
  cellMaxVoltage?: number | null
  cellDeltaMv?: number | null
  batteryTemp1C?: number | null
  batteryTemp2C?: number | null
  mosTempC?: number | null
}

export type TestRunChartPoint = {
  timestamp: number
  elapsedSeconds: number
  distanceMiles: number
  speedMph: number
  powerW: number
  rollingWhPerMile: number | null
  runAverageWhPerMile: number | null
}

export type EfficiencyTestRun = {
  id: string
  name: string
  targetSpeedMph: number
  targetDistanceMiles: number
  startedAt: string
  endedAt?: string
  elapsedSeconds: number
  actualDistanceMiles: number
  /** Primary baseline energy figure: discharge-only (regen excluded). */
  totalEnergyWh: number
  /** Signed net energy (regen included as negative). Stored for reference. */
  netEnergyWh: number
  averageSpeedMph: number
  averagePowerW: number
  averageWhPerMile: number
  startingMotorTempC?: number
  endingMotorTempC?: number
  startingControllerTempC?: number
  endingControllerTempC?: number
  chartPoints: TestRunChartPoint[]
  /** Every raw telemetry sample logged during the run, unconditionally. */
  samples: TestTelemetrySample[]
}

export type EfficiencyRunStatus = 'idle' | 'running' | 'completed'
