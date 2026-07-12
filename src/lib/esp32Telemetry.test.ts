import { describe, expect, it } from 'vitest'
import { parseEsp32TelemetryPacket } from '@/lib/esp32Telemetry'

describe('parseEsp32TelemetryPacket', () => {
  it('maps FarDriver cloud vehicle payload fields into dashboard telemetry', () => {
    const telemetry = parseEsp32TelemetryPacket({
      timestamp: 304688,
      source: 'esp32-fardriver-ble',
      speedMph: 0,
      packVoltage: 83.6,
      packCurrent: 0,
      packSoc: 88,
      packPowerWatts: 0,
      motorTempC: 26,
      controllerTempC: 28,
      motorRpm: 0,
      rpm: 0,
      throttlePercent: 0,
      throttleVoltage: 0.75,
      phaseA: 0,
      phaseC: 0,
      modulation: 0,
      gear: 0,
      controllerSerial: 'JSWXTJ25032076967688',
      bleConnected: true,
      telemetryFresh: true,
      connectionStatus: 'connected',
      packetRateHz: 34,
      lastPacketAgeMs: 56,
      lastCloudStatus: 200,
      firmwareVersion: 'rx2-1.4.0',
      uptimeSeconds: 42,
    })

    expect(telemetry.source).toBe('esp32')
    expect(telemetry.speedMph).toBe(0)
    expect(telemetry.batteryVoltage).toBe(83.6)
    expect(telemetry.batteryCurrent).toBe(0)
    expect(telemetry.batterySocPercent).toBe(88)
    expect(telemetry.batteryPowerWatts).toBe(0)
    expect(telemetry.motorTempC).toBe(26)
    expect(telemetry.controllerTempC).toBe(28)
    expect(telemetry.motorRpm).toBe(0)
    expect(telemetry.throttlePercent).toBe(0)
    expect(telemetry.throttleVoltage).toBe(0.75)
    expect(telemetry.packetRateHz).toBe(34)
    expect(telemetry.lastCloudStatus).toBe(200)
    expect(telemetry.telemetryFresh).toBe(true)
    expect(telemetry.cloudConnectionStatus).toBe('connected')
    expect(telemetry.firmwareVersion).toBe('rx2-1.4.0')
    expect(telemetry.uptimeMs).toBe(42_000)
  })

  it('maps ESP32 GPS aliases into normalized telemetry', () => {
    const telemetry = parseEsp32TelemetryPacket({
      timestamp: 28481,
      source: 'esp32-fardriver-ble-tft',
      gpsValid: true,
      gpsLocationValid: true,
      gpsLat: 34.096984,
      gpsLng: -118.053008,
      gpsSpeedMph: 12.4,
      gpsAltitudeM: 62.9,
      gpsCourseDeg: 187.2,
      gpsSatellites: 16,
      gpsLastUpdateAgeMs: 276,
      packVoltage: 84.5,
      packCurrent: 0,
      packSoc: 90,
    })

    expect(telemetry.gpsFix).toBe(true)
    expect(telemetry.gpsValid).toBe(true)
    expect(telemetry.gpsLocationValid).toBe(true)
    expect(telemetry.gpsLat).toBe(34.096984)
    expect(telemetry.gpsLng).toBe(-118.053008)
    expect(telemetry.speedMph).toBe(12.4)
    expect(telemetry.gpsSpeed).toBe(12.4)
    expect(telemetry.gpsElevationFt).toBeCloseTo(206.36, 2)
    expect(telemetry.gpsHeading).toBe(187.2)
    expect(telemetry.gpsSatellites).toBe(16)
    expect(telemetry.gpsAgeMs).toBe(276)
    expect(telemetry.gpsLastUpdateAgeMs).toBe(276)
  })

  it('accepts alternate latitude longitude and fix field names', () => {
    const telemetry = parseEsp32TelemetryPacket({
      latitude: 31.7621,
      lon: -95.6308,
      hasGpsFix: true,
      altitudeFt: 482,
      satellites: 9,
      heading: 92,
      lastGpsAgeMs: 1500,
    })

    expect(telemetry.gpsFix).toBe(true)
    expect(telemetry.gpsLat).toBe(31.7621)
    expect(telemetry.gpsLng).toBe(-95.6308)
    expect(telemetry.gpsElevationFt).toBe(482)
    expect(telemetry.gpsSatellites).toBe(9)
    expect(telemetry.gpsHeading).toBe(92)
    expect(telemetry.gpsAgeMs).toBe(1500)
  })
})
