import {
  normalizeTelemetry,
  type NormalizedTelemetry,
  type TelemetryData,
  type TelemetryInput,
} from '@/types/telemetry'

export type Esp32TelemetryPacket = {
  timestamp?: number
  speedMph?: number
  gpsLat?: number
  gpsLng?: number
  gpsElevationFt?: number
  packVoltage?: number
  packCurrent?: number
  packSoc?: number
  soc?: number
  packTempC?: number
  motorTempC?: number
  motorTemp?: number
  controllerTempC?: number
  controllerTemp?: number
  motorRpm?: number
  rpm?: number
  throttlePercent?: number
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
    source: 'esp32',
    speedMph: finiteNumber(packet.speedMph),
    gpsLat: finiteNumber(packet.gpsLat),
    gpsLng: finiteNumber(packet.gpsLng),
    gpsElevationFt: finiteNumber(packet.gpsElevationFt),
    batteryVoltage: finiteNumber(packet.packVoltage),
    batteryCurrent: finiteNumber(packet.packCurrent),
    batterySocPercent: clampSoc(packet.packSoc ?? packet.soc),
    batteryTempC: finiteNumber(packet.packTempC),
    motorTempC: finiteNumber(packet.motorTempC ?? packet.motorTemp),
    controllerTempC: finiteNumber(packet.controllerTempC ?? packet.controllerTemp),
    motorRpm: finiteNumber(packet.motorRpm ?? packet.rpm),
    throttlePercent: clampSoc(packet.throttlePercent),
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

function clampSoc(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return Math.min(100, Math.max(0, value))
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
