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
  })
})
