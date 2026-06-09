export type NormalizedTelemetrySource = 'simulator' | 'esp32' | 'manual'

export type TelemetryData = {
  timestamp: number
  source: NormalizedTelemetrySource
  odometerMiles?: number
  distanceMiles?: number
  speedMph: number
  batteryVoltage: number
  batteryCurrent: number
  batterySocPercent: number
  batterySocPercentValid?: boolean
  gpsLat?: number
  gpsLng?: number
  gpsElevationFt?: number
  batteryPowerWatts?: number
  batteryTempC?: number
  motorTempC?: number
  controllerTempC?: number
  motorRpm?: number
  throttlePercent?: number
  motorPowerWatts?: number
  mpptVoltage?: number
  mpptCurrent?: number
  mpptPowerWatts?: number
  mpptPvVoltage?: number
  mpptPvCurrent?: number
  mpptPvPowerWatts?: number
  mpptBatteryVoltage?: number
  mpptChargeCurrent?: number
  mpptChargePowerWatts?: number
  mpptDailyEnergyWh?: number
  mpptStatus?: string
  mpptFault?: string
  mpptChargeState?: string
  regenWatts?: number
  whPerMile?: number
  solarPowerWatts?: number
  solarCurrent?: number
  solarVoltage?: number
  wheelRpm?: number
  efficiencyWhPerMile?: number
  gpsSpeed?: number
  gpsHeading?: number
  gpsAccuracy?: number
}

export type NormalizedTelemetry = TelemetryData

export type TelemetryInput = Partial<TelemetryData> & {
  timestamp?: number
  source?: NormalizedTelemetrySource
}

export function normalizeTelemetry(input: TelemetryInput): TelemetryData {
  const mpptVoltage = input.mpptVoltage ?? input.solarVoltage
  const mpptCurrent = input.mpptCurrent ?? input.solarCurrent
  const mpptPvVoltage = input.mpptPvVoltage ?? mpptVoltage
  const mpptPvCurrent = input.mpptPvCurrent ?? mpptCurrent
  const mpptPowerWatts =
    input.mpptPowerWatts ??
    input.mpptPvPowerWatts ??
    input.solarPowerWatts ??
    multiplyIfNumbers(mpptPvVoltage, mpptPvCurrent)
  const mpptPvPowerWatts =
    input.mpptPvPowerWatts ?? mpptPowerWatts
  const mpptChargePowerWatts =
    input.mpptChargePowerWatts ??
    multiplyIfNumbers(input.mpptBatteryVoltage, input.mpptChargeCurrent)
  const batteryPowerWatts =
    input.batteryPowerWatts ??
    multiplyIfNumbers(input.batteryVoltage, input.batteryCurrent)
  const whPerMile = input.whPerMile ?? input.efficiencyWhPerMile
  const batterySocPercentValid =
    typeof input.batterySocPercent === 'number' &&
    Number.isFinite(input.batterySocPercent)

  // Future ESP32 packet parsing should map raw sensor keys into this normal shape.
  return {
    timestamp: input.timestamp ?? Date.now(),
    source: input.source ?? 'manual',
    odometerMiles: input.odometerMiles,
    distanceMiles: input.distanceMiles,
    speedMph: finiteNumber(input.speedMph, 0),
    gpsLat: input.gpsLat,
    gpsLng: input.gpsLng,
    gpsElevationFt: input.gpsElevationFt,
    batteryVoltage: finiteNumber(input.batteryVoltage, 0),
    batteryCurrent: finiteNumber(input.batteryCurrent, 0),
    batterySocPercent: clampPercent(input.batterySocPercent ?? 0),
    batterySocPercentValid,
    batteryPowerWatts,
    batteryTempC: input.batteryTempC,
    motorTempC: input.motorTempC,
    controllerTempC: input.controllerTempC,
    motorRpm: input.motorRpm,
    throttlePercent:
      input.throttlePercent === undefined
        ? undefined
        : clampPercent(input.throttlePercent),
    motorPowerWatts: input.motorPowerWatts,
    mpptVoltage,
    mpptCurrent,
    mpptPowerWatts,
    mpptPvVoltage,
    mpptPvCurrent,
    mpptPvPowerWatts,
    mpptBatteryVoltage: input.mpptBatteryVoltage,
    mpptChargeCurrent: input.mpptChargeCurrent,
    mpptChargePowerWatts,
    mpptDailyEnergyWh: input.mpptDailyEnergyWh,
    mpptStatus: input.mpptStatus,
    mpptFault: input.mpptFault,
    mpptChargeState: input.mpptChargeState,
    regenWatts: input.regenWatts,
    whPerMile,
    solarPowerWatts: input.solarPowerWatts ?? mpptChargePowerWatts ?? mpptPowerWatts,
    solarCurrent: input.solarCurrent ?? mpptCurrent,
    solarVoltage: input.solarVoltage ?? mpptVoltage,
    wheelRpm: input.wheelRpm,
    efficiencyWhPerMile: input.efficiencyWhPerMile ?? whPerMile,
    gpsSpeed: input.gpsSpeed,
    gpsHeading: input.gpsHeading,
    gpsAccuracy: input.gpsAccuracy,
  }
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function multiplyIfNumbers(a: unknown, b: unknown) {
  return typeof a === 'number' &&
    Number.isFinite(a) &&
    typeof b === 'number' &&
    Number.isFinite(b)
    ? a * b
    : undefined
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0

  return Math.min(100, Math.max(0, value))
}

export type TelemetryConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'warning'
  | 'simulated'
  | 'error'

export const telemetryNodeOptions = [
  'vehicle',
  'mppt',
  'spare-battery',
] as const

export type KnownTelemetryNode = (typeof telemetryNodeOptions)[number]
export type TelemetryNodeId = KnownTelemetryNode | (string & {})

export type TelemetryFreshness = 'idle' | 'healthy' | 'warning' | 'stale'

export type TelemetryEffectiveStatusSource =
  | 'health'
  | 'latest'
  | 'simulator'
  | 'fallback'

export type TelemetryPacketStats = {
  packetsReceived: number
  packetsPerMinute: number
  averageUpdateIntervalSeconds: number | null
  packetLossEstimatePercent: number | null
}

export type CloudTelemetryHealth = {
  ok: boolean
  redis: 'connected' | 'error' | 'not_configured'
  latestVehiclePacketAgeSeconds: number | null
  latestVehicleUpdatedAt: string | null
  latestVehicleNode: TelemetryNodeId | null
  nodes?: Array<{
    node: TelemetryNodeId
    updated_at: string | null
    ageSeconds: number | null
  }>
  error?: string
}

export type TelemetrySource =
  | 'simulator'
  | 'mock-esp32'
  | 'esp32'
  | 'cloud'
  | 'manual'
  | 'websocket'
  | 'serial'
  | 'ble'
  | 'canbus'
