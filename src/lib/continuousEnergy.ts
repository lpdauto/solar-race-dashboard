import { rx2Config } from '@/lib/race/rx2Config'
import type { TelemetryData } from '@/types/telemetry'

export type ContinuousEnergyState = {
  lastTimestampMs?: number
  batteryEnergyWh?: number
  energyConsumedWh: number
  energyRecoveredWh: number
}

export const initialContinuousEnergyState: ContinuousEnergyState = {
  energyConsumedWh: 0,
  energyRecoveredWh: 0,
}

export function calculateMpptInputWatts(telemetry: TelemetryData) {
  return firstFiniteNumber(
    telemetry.mpptChargePowerWatts,
    telemetry.mpptPowerWatts,
    telemetry.solarPowerWatts
  ) ?? 0
}

export function calculateVehiclePowerConsumptionWatts(telemetry: TelemetryData) {
  const vehiclePowerWatts =
    firstFiniteNumber(
      telemetry.batteryPowerWatts,
      multiplyIfNumbers(telemetry.batteryVoltage, telemetry.batteryCurrent),
      telemetry.motorPowerWatts
    ) ?? 0

  return Math.max(0, vehiclePowerWatts)
}

export function calculateNetPowerWatts(telemetry: TelemetryData) {
  return (
    calculateMpptInputWatts(telemetry) -
    calculateVehiclePowerConsumptionWatts(telemetry)
  )
}

export function deriveContinuousEnergyTelemetry({
  telemetry,
  previousState,
  timestampMs = telemetry.timestamp,
  batteryCapacityWh = rx2Config.mainBatteryUsableWh,
}: {
  telemetry: TelemetryData
  previousState: ContinuousEnergyState
  timestampMs?: number
  batteryCapacityWh?: number
}) {
  const netPowerWatts = calculateNetPowerWatts(telemetry)
  const safeTimestampMs = Number.isFinite(timestampMs) ? timestampMs : telemetry.timestamp
  const deltaSeconds =
    previousState.lastTimestampMs === undefined
      ? 0
      : Math.max(0, (safeTimestampMs - previousState.lastTimestampMs) / 1000)
  const deltaWh = netPowerWatts * deltaSeconds / 3600
  const previousBatteryEnergyWh =
    previousState.batteryEnergyWh ??
    clamp(
      batteryCapacityWh * telemetry.batterySocPercent / 100,
      0,
      batteryCapacityWh
    )
  const batteryEnergyWh = clamp(
    previousBatteryEnergyWh + deltaWh,
    0,
    batteryCapacityWh
  )
  const energyConsumedWh =
    previousState.energyConsumedWh + Math.max(0, -deltaWh)
  const energyRecoveredWh =
    previousState.energyRecoveredWh + Math.max(0, deltaWh)
  const nextState: ContinuousEnergyState = {
    lastTimestampMs: safeTimestampMs,
    batteryEnergyWh,
    energyConsumedWh,
    energyRecoveredWh,
  }

  return {
    telemetry: {
      ...telemetry,
      netPowerWatts,
      energyConsumedWh,
      energyRecoveredWh,
      batteryEnergyWh,
    },
    state: nextState,
    deltaWh,
  }
}

function firstFiniteNumber(...values: Array<number | undefined>) {
  return values.find((value) => typeof value === 'number' && Number.isFinite(value))
}

function multiplyIfNumbers(left: unknown, right: unknown) {
  return typeof left === 'number' &&
    Number.isFinite(left) &&
    typeof right === 'number' &&
    Number.isFinite(right)
    ? left * right
    : undefined
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min

  return Math.min(max, Math.max(min, value))
}
