import type { RouteSegment } from '@/data/raceRoute'
import type { TelemetryData } from '@/types/telemetry'

export type TelemetrySimulatorInput = {
  currentMile?: number
  currentSegment?: RouteSegment | null
  previousTelemetry?: TelemetryData | null
}

const initialSoc = 82

export function generateTelemetryFrame({
  currentMile = 0,
  currentSegment,
  previousTelemetry,
}: TelemetrySimulatorInput): TelemetryData {
  const segmentType = currentSegment?.type ?? 'flat'
  const risk = currentSegment?.risk ?? 'low'
  const wave = Math.sin(Date.now() / 8000 + currentMile / 8)
  const jitter = Math.sin(Date.now() / 1300) * 0.5
  const baseVoltage =
    previousTelemetry?.batteryVoltage ??
    80.5
  const batterySocPercent = Math.max(
    0,
    (previousTelemetry?.batterySocPercent ?? initialSoc) -
      socDrainForSegment(segmentType, risk)
  )
  const speedMph = clamp(
    speedForSegment(segmentType, risk) + wave * 2.4 + jitter,
    20,
    38
  )
  const batteryVoltage = clamp(
    baseVoltage - (initialSoc - batterySocPercent) * 0.045 + wave * 0.35,
    72,
    84
  )
  const batteryCurrent = currentForSegment(segmentType, risk, wave)
  const batteryPowerWatts = batteryVoltage * batteryCurrent
  const solarPowerWatts = clamp(1250 + Math.sin(Date.now() / 15000) * 650, 400, 2000)
  const solarVoltage = 92 + wave * 4
  const solarCurrent = solarPowerWatts / solarVoltage
  const controllerTempC = smoothTemp(
    previousTelemetry?.controllerTempC ?? 42,
    tempTargetForSegment(segmentType, risk, 'controller')
  )
  const motorTempC = smoothTemp(
    previousTelemetry?.motorTempC ?? 40,
    tempTargetForSegment(segmentType, risk, 'motor')
  )
  const batteryTempC = smoothTemp(previousTelemetry?.batteryTempC ?? 31, 34)
  const regenWatts =
    segmentType === 'descent'
      ? clamp(450 + Math.abs(wave) * 950, 350, 1800)
      : batteryCurrent < 0
        ? Math.abs(batteryPowerWatts)
        : 0
  const efficiencyWhPerMile = clamp(
    efficiencyForSegment(segmentType, risk) + Math.max(0, wave) * 14,
    35,
    190
  )
  const wheelRpm = speedMph * 17.2
  const motorRpm = wheelRpm * 4.8

  return {
    timestamp: Date.now(),
    speedMph,
    batteryVoltage,
    batteryCurrent,
    batteryPowerWatts,
    batterySocPercent,
    motorTempC,
    controllerTempC,
    batteryTempC,
    solarPowerWatts,
    solarCurrent,
    solarVoltage,
    motorRpm,
    wheelRpm,
    efficiencyWhPerMile,
    regenWatts,
  }
}

function speedForSegment(segmentType: string, risk: string) {
  if (segmentType === 'climb') return risk === 'severe' ? 22 : 25
  if (segmentType === 'descent') return 31
  if (segmentType === 'town' || segmentType === 'caution') return 24
  return 30
}

function currentForSegment(segmentType: string, risk: string, wave: number) {
  if (segmentType === 'climb') {
    const highBase = risk === 'severe' ? 88 : risk === 'high' ? 72 : 54
    return clamp(highBase + Math.max(0, wave) * 24, 40, 120)
  }

  if (segmentType === 'descent') {
    return clamp(-8 - Math.max(0, wave) * 12, -28, 8)
  }

  if (segmentType === 'town' || segmentType === 'caution') {
    return clamp(26 + Math.max(0, wave) * 18, 15, 55)
  }

  return clamp(25 + wave * 11, 15, 40)
}

function tempTargetForSegment(
  segmentType: string,
  risk: string,
  component: 'controller' | 'motor'
) {
  const severeBonus = risk === 'severe' ? 14 : risk === 'high' ? 8 : 0
  const componentBonus = component === 'motor' ? 7 : 0

  if (segmentType === 'climb') return 66 + severeBonus + componentBonus
  if (segmentType === 'descent') return 43 + componentBonus
  if (segmentType === 'town' || segmentType === 'caution') return 52 + componentBonus
  return 46 + componentBonus
}

function efficiencyForSegment(segmentType: string, risk: string) {
  if (segmentType === 'climb') return risk === 'severe' ? 158 : risk === 'high' ? 138 : 118
  if (segmentType === 'descent') return 48
  if (segmentType === 'town' || segmentType === 'caution') return 112
  return 78
}

function socDrainForSegment(segmentType: string, risk: string) {
  if (segmentType === 'descent') return 0.015
  if (segmentType === 'climb') return risk === 'severe' ? 0.12 : 0.08
  if (segmentType === 'town' || segmentType === 'caution') return 0.045
  return 0.035
}

function smoothTemp(current: number, target: number) {
  return current + (target - current) * 0.08
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
