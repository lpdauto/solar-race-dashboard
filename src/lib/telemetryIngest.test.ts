import { describe, expect, it } from 'vitest'
import { parseEsp32TelemetryPacket } from '@/lib/esp32Telemetry'
import { mergeTelemetryPayloadForIngest } from '@/lib/telemetryIngest'

const receivedAt = '2026-07-12T15:20:33.000Z'

describe('mergeTelemetryPayloadForIngest', () => {
  it('merges Android GPS into an existing ESP32 vehicle record', () => {
    const result = mergeTelemetryPayloadForIngest({
      existingPayload: {
        source: 'esp32',
        batteryVoltage: 78.4,
        packCurrent: 42.5,
        motorTempC: 58.4,
        rpm: 3720,
        vehicleUpdatedAt: '2026-07-12T15:20:30.000Z',
      },
      incomingPayload: {
        source: 'android-gps',
        deviceId: 'rx2-driver-android',
        latitude: 34.123456,
        longitude: -118.123456,
        speedMph: 27.4,
        heading: 182.5,
        altitudeMeters: 91.2,
        accuracyMeters: 3.8,
        gpsTimestamp: '2026-07-12T15:20:31.000Z',
        uploadedAt: '2026-07-12T15:20:32.000Z',
      },
      receivedAt,
    })

    expect(result.ok).toBe(true)
    expect(result.ok && result.payload).toMatchObject({
      batteryVoltage: 78.4,
      packCurrent: 42.5,
      motorTempC: 58.4,
      rpm: 3720,
      lat: 34.123456,
      lng: -118.123456,
      latitude: 34.123456,
      longitude: -118.123456,
      speed: 27.4,
      speedMph: 27.4,
      heading: 182.5,
      altitudeMeters: 91.2,
      accuracyMeters: 3.8,
      gpsTimestamp: '2026-07-12T15:20:31.000Z',
      uploadedAt: '2026-07-12T15:20:32.000Z',
      gpsUpdatedAt: receivedAt,
      gpsDeviceId: 'rx2-driver-android',
      gpsSource: 'android-gps',
    })
  })

  it('keeps existing vehicle fields intact when Android GPS arrives', () => {
    const result = mergeTelemetryPayloadForIngest({
      existingPayload: {
        batteryVoltage: 77.1,
        batteryCurrent: 21.2,
        packVoltage: 77.5,
        packCurrent: 20.8,
        soc: 72,
        motorTemp: 55,
        controllerTemp: 49,
        throttle: 31,
        bleConnected: false,
      },
      incomingPayload: {
        source: 'android-gps',
        lat: 31.7621,
        lng: -95.6308,
      },
      receivedAt,
    })

    expect(result.ok).toBe(true)
    expect(result.ok && result.payload).toMatchObject({
      batteryVoltage: 77.1,
      batteryCurrent: 21.2,
      packVoltage: 77.5,
      packCurrent: 20.8,
      soc: 72,
      motorTemp: 55,
      controllerTemp: 49,
      throttle: 31,
      bleConnected: false,
    })
  })

  it('preserves Android GPS fields when ESP32 sends no GPS fields', () => {
    const result = mergeTelemetryPayloadForIngest({
      existingPayload: {
        lat: 31.7621,
        lng: -95.6308,
        latitude: 31.7621,
        longitude: -95.6308,
        speedMph: 27.4,
        speed: 27.4,
        gpsUpdatedAt: '2026-07-12T15:20:32.000Z',
        gpsSource: 'android-gps',
        batteryVoltage: 70,
      },
      incomingPayload: {
        source: 'esp32',
        batteryVoltage: 78.4,
        batteryCurrent: 42.5,
        motorTempC: 58.4,
      },
      receivedAt,
    })

    expect(result.ok).toBe(true)
    expect(result.ok && result.payload).toMatchObject({
      source: 'esp32',
      batteryVoltage: 78.4,
      batteryCurrent: 42.5,
      motorTempC: 58.4,
      vehicleUpdatedAt: receivedAt,
      lat: 31.7621,
      lng: -95.6308,
      latitude: 31.7621,
      longitude: -95.6308,
      speedMph: 27.4,
      speed: 27.4,
      gpsUpdatedAt: '2026-07-12T15:20:32.000Z',
      gpsSource: 'android-gps',
    })
  })

  it('rejects invalid Android GPS coordinates', () => {
    const result = mergeTelemetryPayloadForIngest({
      existingPayload: {},
      incomingPayload: {
        source: 'android-gps',
        lat: 91,
        lng: -95.6308,
      },
      receivedAt,
    })

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      source: 'android-gps',
      response: {
        ok: false,
        source: 'android-gps',
      },
    })
  })

  it('does not erase valid GPS fields with null incoming values', () => {
    const result = mergeTelemetryPayloadForIngest({
      existingPayload: {
        lat: 31.7621,
        lng: -95.6308,
        latitude: 31.7621,
        longitude: -95.6308,
        speedMph: 27.4,
        speed: 27.4,
        heading: 182.5,
        accuracyMeters: 3.8,
      },
      incomingPayload: {
        source: 'android-gps',
        lat: 31.7622,
        lng: -95.6309,
        speedMph: null,
        speed: null,
        heading: null,
        accuracyMeters: null,
      },
      receivedAt,
    })

    expect(result.ok).toBe(true)
    expect(result.ok && result.payload).toMatchObject({
      lat: 31.7622,
      lng: -95.6309,
      latitude: 31.7622,
      longitude: -95.6309,
      speedMph: 27.4,
      speed: 27.4,
      heading: 182.5,
      accuracyMeters: 3.8,
    })
  })

  it('normalizes stored GPS names so existing telemetry parsing still works', () => {
    const result = mergeTelemetryPayloadForIngest({
      existingPayload: {},
      incomingPayload: {
        source: 'android-gps',
        lat: 31.7621,
        lng: -95.6308,
        speedMph: 27.4,
      },
      receivedAt,
    })

    expect(result.ok).toBe(true)
    const telemetry = parseEsp32TelemetryPacket(
      (result.ok && result.payload) as Parameters<typeof parseEsp32TelemetryPacket>[0]
    )
    expect(telemetry.gpsLat).toBe(31.7621)
    expect(telemetry.gpsLng).toBe(-95.6308)
    expect(telemetry.speedMph).toBe(27.4)
  })
})
