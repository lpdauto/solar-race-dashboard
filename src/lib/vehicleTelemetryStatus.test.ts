import { describe, expect, it } from 'vitest'
import {
  classifyVehicleNodeStatusFromAgeMs,
  summarizeVehicleTelemetryStatus,
} from '@/lib/vehicleTelemetryStatus'

describe('vehicle telemetry status classification', () => {
  it('marks a recent vehicle packet online and telemetry fresh', () => {
    const summary = summarizeVehicleTelemetryStatus({
      packetAgeSeconds: 2,
      packetRateHz: 4.2,
    })

    expect(summary.vehicleNodeStatus).toBe('online')
    expect(summary.telemetryFresh).toBe(true)
    expect(summary.packetRateHz).toBe(4.2)
    expect(summary.telemetryStatus).toBe('connected')
    expect(summary.connectionStatus).toBe('connected')
  })

  it('marks a 30 second old vehicle packet stale and telemetry not fresh', () => {
    const summary = summarizeVehicleTelemetryStatus({
      packetAgeSeconds: 30,
      packetRateHz: 1.5,
    })

    expect(summary.vehicleNodeStatus).toBe('stale')
    expect(summary.telemetryFresh).toBe(false)
    expect(summary.packetRateHz).toBe(1.5)
    expect(summary.telemetryStatus).toBe('warning')
    expect(summary.connectionStatus).toBe('disconnected')
  })

  it('marks a five minute old vehicle packet offline and forces packet rate to zero', () => {
    const summary = summarizeVehicleTelemetryStatus({
      packetAgeSeconds: 300,
      packetRateHz: 2.5,
    })

    expect(summary.vehicleNodeStatus).toBe('offline')
    expect(summary.telemetryFresh).toBe(false)
    expect(summary.packetRateHz).toBe(0)
    expect(summary.telemetryStatus).toBe('disconnected')
    expect(summary.connectionStatus).toBe('disconnected')
  })

  it('marks missing vehicle packets offline', () => {
    const summary = summarizeVehicleTelemetryStatus({
      packetAgeSeconds: null,
    })

    expect(summary.vehicleNodeStatus).toBe('offline')
    expect(summary.telemetryFresh).toBe(false)
    expect(summary.packetAgeMs).toBeNull()
    expect(summary.packetRateHz).toBe(0)
  })

  it('uses 10 second and 60 second thresholds exactly', () => {
    expect(classifyVehicleNodeStatusFromAgeMs(9_999)).toBe('online')
    expect(classifyVehicleNodeStatusFromAgeMs(10_000)).toBe('stale')
    expect(classifyVehicleNodeStatusFromAgeMs(59_999)).toBe('stale')
    expect(classifyVehicleNodeStatusFromAgeMs(60_000)).toBe('offline')
  })
})
