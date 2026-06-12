import { describe, expect, it } from 'vitest'
import {
  calculateMpptInputWatts,
  calculateNetPowerWatts,
  deriveContinuousEnergyTelemetry,
  initialContinuousEnergyState,
} from '@/lib/continuousEnergy'
import type { TelemetryData } from '@/types/telemetry'

const baseTelemetry: TelemetryData = {
  timestamp: 1_000,
  source: 'manual',
  speedMph: 35,
  batteryVoltage: 80,
  batteryCurrent: 15,
  batterySocPercent: 50,
}

describe('continuous MPPT-aware energy model', () => {
  it('prioritizes MPPT charge power over MPPT panel power and legacy solar power', () => {
    expect(
      calculateMpptInputWatts({
        ...baseTelemetry,
        mpptChargePowerWatts: 600,
        mpptPowerWatts: 900,
        solarPowerWatts: 1100,
      })
    ).toBe(600)

    expect(
      calculateMpptInputWatts({
        ...baseTelemetry,
        mpptPowerWatts: 900,
        solarPowerWatts: 1100,
      })
    ).toBe(900)

    expect(
      calculateMpptInputWatts({
        ...baseTelemetry,
        solarPowerWatts: 1100,
      })
    ).toBe(1100)
  })

  it('calculates negative net power while driving and decreases battery energy over time', () => {
    const first = deriveContinuousEnergyTelemetry({
      telemetry: {
        ...baseTelemetry,
        batteryPowerWatts: 1200,
        mpptChargePowerWatts: 600,
      },
      previousState: initialContinuousEnergyState,
      timestampMs: 1_000,
      batteryCapacityWh: 5000,
    })
    const second = deriveContinuousEnergyTelemetry({
      telemetry: {
        ...baseTelemetry,
        timestamp: 3601_000,
        batteryPowerWatts: 1200,
        mpptChargePowerWatts: 600,
      },
      previousState: first.state,
      timestampMs: 3601_000,
      batteryCapacityWh: 5000,
    })

    expect(calculateNetPowerWatts(second.telemetry)).toBe(-600)
    expect(second.telemetry.netPowerWatts).toBe(-600)
    expect(second.telemetry.energyConsumedWh).toBeCloseTo(600, 6)
    expect(second.telemetry.energyRecoveredWh).toBeCloseTo(0, 6)
    expect(second.telemetry.batteryEnergyWh).toBeCloseTo(1900, 6)
  })

  it('calculates positive net power while stopped and increases battery energy over time', () => {
    const first = deriveContinuousEnergyTelemetry({
      telemetry: {
        ...baseTelemetry,
        speedMph: 0,
        batteryPowerWatts: 0,
        mpptChargePowerWatts: 1200,
      },
      previousState: initialContinuousEnergyState,
      timestampMs: 1_000,
      batteryCapacityWh: 5000,
    })
    const second = deriveContinuousEnergyTelemetry({
      telemetry: {
        ...baseTelemetry,
        timestamp: 3601_000,
        speedMph: 0,
        batteryPowerWatts: 0,
        mpptChargePowerWatts: 1200,
      },
      previousState: first.state,
      timestampMs: 3601_000,
      batteryCapacityWh: 5000,
    })

    expect(second.telemetry.netPowerWatts).toBe(1200)
    expect(second.telemetry.energyConsumedWh).toBeCloseTo(0, 6)
    expect(second.telemetry.energyRecoveredWh).toBeCloseTo(1200, 6)
    expect(second.telemetry.batteryEnergyWh).toBeCloseTo(3700, 6)
  })

  it('does not integrate duplicate or older packet timestamps', () => {
    const first = deriveContinuousEnergyTelemetry({
      telemetry: {
        ...baseTelemetry,
        batteryPowerWatts: 1200,
        mpptChargePowerWatts: 600,
      },
      previousState: initialContinuousEnergyState,
      timestampMs: 10_000,
      batteryCapacityWh: 5000,
    })
    const duplicate = deriveContinuousEnergyTelemetry({
      telemetry: {
        ...baseTelemetry,
        batteryPowerWatts: 1200,
        mpptChargePowerWatts: 600,
      },
      previousState: first.state,
      timestampMs: 10_000,
      batteryCapacityWh: 5000,
    })

    expect(duplicate.telemetry.energyConsumedWh).toBe(0)
    expect(duplicate.telemetry.batteryEnergyWh).toBe(2500)
  })
})
