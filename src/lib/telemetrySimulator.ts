import type { RouteSegment } from '@/data/raceRoute'
import { rx2Config } from '@/lib/race/rx2Config'
import { normalizeTelemetry, type TelemetryData } from '@/types/telemetry'

export type TelemetrySimulatorInput = {
  currentMile?: number
  currentSegment?: RouteSegment | null
  previousTelemetry?: TelemetryData | null
}

const initialSoc = 100
const MPH_TO_WHEEL_RPM_FACTOR = 336

export function generateTelemetryFrame({
  currentMile = 0,
  currentSegment,
  previousTelemetry,
}: TelemetrySimulatorInput): TelemetryData {
  // RX2 vehicle configuration source
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
    rx2Config.minimumRaceSpeedMph,
    rx2Config.maxRecommendedSpeedMph
  )
  const batteryVoltage = clamp(
    baseVoltage - (initialSoc - batterySocPercent) * 0.045 + wave * 0.35,
    72,
    84
  )
  const batteryCurrent = currentForSegment(segmentType, risk, wave)
  const batteryPowerWatts = batteryVoltage * batteryCurrent
  const solarPowerWatts = clamp(
    rx2Config.expectedSolarStationWatts * 0.625 +
      Math.sin(Date.now() / 15000) * 650,
    400,
    rx2Config.expectedSolarStationWatts
  )
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
    efficiencyForSegment(segmentType, risk) + wave * 3.5,
    20,
    70
  )
  const wheelRpm =
    (speedMph * MPH_TO_WHEEL_RPM_FACTOR) / rx2Config.tireDiameterIn
  const motorRpm = wheelRpm * rx2Config.drivetrainReduction

  return normalizeTelemetry({
    timestamp: Date.now(),
    source: 'simulator',
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
    whPerMile: efficiencyWhPerMile,
    regenWatts,
    mpptVoltage: solarVoltage,
    mpptCurrent: solarCurrent,
    mpptPowerWatts: solarPowerWatts,
  })
}

function speedForSegment(segmentType: string, risk: string) {
  if (segmentType === 'climb') {
    return risk === 'severe'
      ? rx2Config.defaultTargetSpeedMph - 7
      : rx2Config.defaultTargetSpeedMph - 3
  }
  if (segmentType === 'descent') return rx2Config.defaultTargetSpeedMph + 3
  if (segmentType === 'town' || segmentType === 'caution') {
    return rx2Config.defaultTargetSpeedMph - 4
  }
  return rx2Config.defaultTargetSpeedMph
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
  if (segmentType === 'climb') return risk === 'severe' ? 66 : risk === 'high' ? 58 : 50
  if (segmentType === 'descent') return 24
  if (segmentType === 'town' || segmentType === 'caution') return 46
  return risk === 'high' ? 45 : risk === 'medium' ? 41 : 38
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
