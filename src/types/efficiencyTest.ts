// Baseline efficiency test-run types (Test Mode "live Wh/mi" feature).
// Kept separate from src/types/telemetry.ts because these describe a
// derived/accumulated run, not a raw telemetry packet.

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
}

export type EfficiencyRunStatus = 'idle' | 'running' | 'completed'
