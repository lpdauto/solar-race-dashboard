import {
  normalizeTelemetry,
  type NormalizedTelemetry,
  type NormalizedTelemetrySource,
  type TelemetryData,
  type TelemetryInput,
} from '@/types/telemetry'

export type Esp32TelemetryPacket = {
  timestamp?: number
  source?: string
  speedMph?: number
  lat?: number
  latitude?: number
  gpsLat?: number
  lng?: number
  lon?: number
  longitude?: number
  gpsLng?: number
  gpsElevationFt?: number
  gpsAltitudeFt?: number
  altitudeFt?: number
  elevationFt?: number
  gpsAltitudeM?: number
  gpsAccuracyM?: number
  accuracyMeters?: number
  gpsSpeedMph?: number
  gpsHeading?: number
  heading?: number
  courseDeg?: number
  gpsCourseDeg?: number
  gpsSatellites?: number
  satellites?: number
  gpsFix?: boolean
  gpsValid?: boolean
  gpsLocationValid?: boolean
  locationValid?: boolean
  hasGpsFix?: boolean
  gpsAgeMs?: number
  lastGpsAgeMs?: number
  gpsLastUpdateAgeMs?: number
  packVoltage?: number
  batteryVoltage?: number
  packCurrent?: number
  batteryCurrent?: number
  packSoc?: number
  soc?: number
  batterySocPercent?: number
  packTempC?: number
  batteryTempC?: number
  motorTempC?: number
  motorTemp?: number
  controllerTempC?: number
  controllerTemp?: number
  motorRpm?: number
  rpm?: number
  throttlePercent?: number
  throttleVoltage?: number
  packPowerWatts?: number
  batteryPowerWatts?: number
  phaseA?: number
  phaseC?: number
  modulation?: number
  gear?: number
  controllerSerial?: string
  bleConnected?: boolean
  telemetryFresh?: boolean
  connectionStatus?: string
  packetRateHz?: number
  lastPacketAgeMs?: number
  lastCloudStatus?: number
  firmwareVersion?: string
  firmware?: string
  version?: string
  uptimeMs?: number
  uptimeMillis?: number
  uptimeSeconds?: number
  uptime?: number
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
  regenWatts?: number
  netPowerWatts?: number
  energyConsumedWh?: number
  energyRecoveredWh?: number
  batteryEnergyWh?: number
  controllerSpeedMph?: number
  controllerFaultCode?: number
  controllerState?: string
  bmsConnected?: boolean
  bmsAddress?: string
  bmsVoltage?: number
  bmsCurrent?: number
  bmsPowerWatts?: number
  bmsSocPercent?: number
  avgCellVoltage?: number
  cellMinVoltage?: number
  cellMaxVoltage?: number
  cellDeltaMv?: number
  batteryTemp1C?: number
  batteryTemp2C?: number
  mosTempC?: number
}

export const mockEsp32TelemetryPacket: Esp32TelemetryPacket = {
  timestamp: 1770000000000,
  speedMph: 24.8,
  gpsLat: 31.7621,
  gpsLng: -95.6308,
  gpsElevationFt: 482,
  packVoltage: 78.4,
  packCurrent: 42.5,
  packSoc: 76,
  packTempC: 32.6,
  motorTempC: 58.4,
  controllerTempC: 54.1,
  motorRpm: 3720,
  throttlePercent: 38,
  mpptVoltage: 91.5,
  mpptCurrent: 18.7,
  mpptPowerWatts: 1711,
  mpptPvVoltage: 91.5,
  mpptPvCurrent: 18.7,
  mpptPvPowerWatts: 1711,
  mpptBatteryVoltage: 78.4,
  mpptChargeCurrent: 20.6,
  mpptChargePowerWatts: 1615,
  mpptDailyEnergyWh: 2710,
  mpptStatus: 'charging',
  regenWatts: 0,
}

export function parseEsp32TelemetryPacket(
  packet: Esp32TelemetryPacket
): NormalizedTelemetry {
  // Future ESP32 transport should pass decoded JSON packets into this mapper.
  return normalizeTelemetry({
    timestamp: finiteNumber(packet.timestamp),
    source: normalizePacketSource(packet.source),
    speedMph: finiteNumber(packet.gpsSpeedMph ?? packet.speedMph),
    gpsLat: finiteLatitude(packet.gpsLat ?? packet.lat ?? packet.latitude),
    gpsLng: finiteLongitude(
      packet.gpsLng ?? packet.lng ?? packet.lon ?? packet.longitude
    ),
    gpsElevationFt: gpsElevationFeet(packet),
    gpsFix: gpsFixValue(packet),
    gpsValid: booleanValue(packet.gpsValid),
    gpsLocationValid: booleanValue(packet.gpsLocationValid ?? packet.locationValid),
    gpsAgeMs: finiteNumber(
      packet.gpsAgeMs ?? packet.lastGpsAgeMs ?? packet.gpsLastUpdateAgeMs
    ),
    gpsLastUpdateAgeMs: finiteNumber(
      packet.gpsLastUpdateAgeMs ?? packet.gpsAgeMs ?? packet.lastGpsAgeMs
    ),
    gpsSatellites: finiteNumber(packet.gpsSatellites ?? packet.satellites),
    gpsSpeed: finiteNumber(packet.gpsSpeedMph ?? packet.speedMph),
    gpsHeading: finiteNumber(
      packet.gpsHeading ??
        packet.heading ??
        packet.courseDeg ??
        packet.gpsCourseDeg
    ),
    gpsAccuracy: finiteNumber(packet.gpsAccuracyM ?? packet.accuracyMeters),
    batteryVoltage: finiteNumber(packet.packVoltage ?? packet.batteryVoltage),
    batteryCurrent: finiteNumber(packet.packCurrent ?? packet.batteryCurrent),
    batterySocPercent: clampSoc(
      packet.packSoc ?? packet.soc ?? packet.batterySocPercent
    ),
    batteryTempC: finiteNumber(packet.packTempC ?? packet.batteryTempC),
    batteryPowerWatts: finiteNumber(
      packet.packPowerWatts ?? packet.batteryPowerWatts
    ),
    motorTempC: finiteNumber(packet.motorTempC ?? packet.motorTemp),
    controllerTempC: finiteNumber(packet.controllerTempC ?? packet.controllerTemp),
    motorRpm: finiteNumber(packet.motorRpm ?? packet.rpm),
    throttlePercent: clampSoc(packet.throttlePercent),
    throttleVoltage: finiteNumber(packet.throttleVoltage),
    phaseA: finiteNumber(packet.phaseA),
    phaseC: finiteNumber(packet.phaseC),
    modulation: finiteNumber(packet.modulation),
    gear: finiteNumber(packet.gear),
    controllerSerial: stringValue(packet.controllerSerial),
    bleConnected: booleanValue(packet.bleConnected),
    telemetryFresh: booleanValue(packet.telemetryFresh),
    cloudConnectionStatus: stringValue(packet.connectionStatus),
    packetRateHz: finiteNumber(packet.packetRateHz),
    lastPacketAgeMs: finiteNumber(packet.lastPacketAgeMs),
    lastCloudStatus: finiteNumber(packet.lastCloudStatus),
    firmwareVersion: stringValue(
      packet.firmwareVersion ?? packet.firmware ?? packet.version
    ),
    uptimeMs: uptimeMilliseconds(packet),
    mpptVoltage: finiteNumber(packet.mpptVoltage),
    mpptCurrent: finiteNumber(packet.mpptCurrent),
    mpptPowerWatts: finiteNumber(packet.mpptPowerWatts),
    mpptPvVoltage: finiteNumber(packet.mpptPvVoltage ?? packet.mpptVoltage),
    mpptPvCurrent: finiteNumber(packet.mpptPvCurrent ?? packet.mpptCurrent),
    mpptPvPowerWatts: finiteNumber(packet.mpptPvPowerWatts ?? packet.mpptPowerWatts),
    mpptBatteryVoltage: finiteNumber(packet.mpptBatteryVoltage),
    mpptChargeCurrent: finiteNumber(packet.mpptChargeCurrent),
    mpptChargePowerWatts: finiteNumber(packet.mpptChargePowerWatts),
    mpptDailyEnergyWh: finiteNumber(packet.mpptDailyEnergyWh),
    mpptStatus: stringValue(packet.mpptStatus),
    mpptFault: stringValue(packet.mpptFault),
    regenWatts: finiteNumber(packet.regenWatts),
    netPowerWatts: finiteNumber(packet.netPowerWatts),
    energyConsumedWh: finiteNumber(packet.energyConsumedWh),
    energyRecoveredWh: finiteNumber(packet.energyRecoveredWh),
    batteryEnergyWh: finiteNumber(packet.batteryEnergyWh),
    controllerSpeedMph: finiteNumber(packet.controllerSpeedMph),
    controllerFaultCode: finiteNumber(packet.controllerFaultCode),
    controllerState: stringValue(packet.controllerState),
    bmsConnected: booleanValue(packet.bmsConnected),
    bmsAddress: stringValue(packet.bmsAddress),
    bmsVoltage: finiteNumber(packet.bmsVoltage),
    bmsCurrent: finiteNumber(packet.bmsCurrent),
    bmsPowerWatts: finiteNumber(packet.bmsPowerWatts),
    bmsSocPercent: finiteNumber(packet.bmsSocPercent),
    avgCellVoltage: finiteNumber(packet.avgCellVoltage),
    cellMinVoltage: finiteNumber(packet.cellMinVoltage),
    cellMaxVoltage: finiteNumber(packet.cellMaxVoltage),
    cellDeltaMv: finiteNumber(packet.cellDeltaMv),
    batteryTemp1C: finiteNumber(packet.batteryTemp1C),
    batteryTemp2C: finiteNumber(packet.batteryTemp2C),
    mosTempC: finiteNumber(packet.mosTempC),
  } satisfies TelemetryInput)
}

export function simulatorTelemetryToEsp32Packet(
  telemetry: TelemetryData
): Esp32TelemetryPacket {
  return {
    timestamp: telemetry.timestamp,
    speedMph: telemetry.speedMph,
    gpsLat: telemetry.gpsLat,
    gpsLng: telemetry.gpsLng,
    gpsElevationFt: telemetry.gpsElevationFt,
    packVoltage: telemetry.batteryVoltage,
    packCurrent: telemetry.batteryCurrent,
    packSoc: telemetry.batterySocPercent,
    packTempC: telemetry.batteryTempC,
    motorTempC: telemetry.motorTempC,
    controllerTempC: telemetry.controllerTempC,
    motorRpm: telemetry.motorRpm,
    throttlePercent: telemetry.throttlePercent,
    mpptVoltage: telemetry.mpptVoltage ?? telemetry.solarVoltage,
    mpptCurrent: telemetry.mpptCurrent ?? telemetry.solarCurrent,
    mpptPowerWatts: telemetry.mpptPowerWatts ?? telemetry.solarPowerWatts,
    mpptPvVoltage: telemetry.mpptPvVoltage ?? telemetry.mpptVoltage ?? telemetry.solarVoltage,
    mpptPvCurrent: telemetry.mpptPvCurrent ?? telemetry.mpptCurrent ?? telemetry.solarCurrent,
    mpptPvPowerWatts: telemetry.mpptPvPowerWatts ?? telemetry.mpptPowerWatts ?? telemetry.solarPowerWatts,
    mpptBatteryVoltage: telemetry.mpptBatteryVoltage,
    mpptChargeCurrent: telemetry.mpptChargeCurrent,
    mpptChargePowerWatts: telemetry.mpptChargePowerWatts,
    mpptDailyEnergyWh: telemetry.mpptDailyEnergyWh,
    mpptStatus: telemetry.mpptStatus,
    mpptFault: telemetry.mpptFault,
    regenWatts: telemetry.regenWatts,
  }
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function finiteLatitude(value: unknown) {
  const number = finiteNumber(value)

  return number !== undefined && number >= -90 && number <= 90
    ? number
    : undefined
}

function finiteLongitude(value: unknown) {
  const number = finiteNumber(value)

  return number !== undefined && number >= -180 && number <= 180
    ? number
    : undefined
}

function gpsElevationFeet(packet: Esp32TelemetryPacket) {
  const feet = finiteNumber(
    packet.gpsElevationFt ??
      packet.gpsAltitudeFt ??
      packet.altitudeFt ??
      packet.elevationFt
  )

  if (feet !== undefined) return feet

  const meters = finiteNumber(packet.gpsAltitudeM)

  return meters !== undefined ? meters * 3.28084 : undefined
}

function gpsFixValue(packet: Esp32TelemetryPacket) {
  const explicitFix = booleanValue(
    packet.gpsFix ??
      packet.gpsValid ??
      packet.locationValid ??
      packet.gpsLocationValid ??
      packet.hasGpsFix
  )

  if (explicitFix !== undefined) return explicitFix

  return finiteLatitude(packet.gpsLat ?? packet.lat ?? packet.latitude) !==
    undefined &&
    finiteLongitude(packet.gpsLng ?? packet.lng ?? packet.lon ?? packet.longitude) !==
      undefined
    ? true
    : undefined
}

function clampSoc(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return Math.min(100, Math.max(0, value))
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function uptimeMilliseconds(packet: Esp32TelemetryPacket) {
  const uptimeMs = finiteNumber(packet.uptimeMs ?? packet.uptimeMillis)

  if (uptimeMs !== undefined) return uptimeMs

  const uptimeSeconds = finiteNumber(packet.uptimeSeconds)

  if (uptimeSeconds !== undefined) return uptimeSeconds * 1000

  return finiteNumber(packet.uptime)
}

function normalizePacketSource(_value: unknown): NormalizedTelemetrySource {
  return 'esp32'
}
