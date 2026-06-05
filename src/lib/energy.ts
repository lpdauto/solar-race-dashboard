import type { RiskLevel } from '@/data/raceRoute'
import type { AppProfile } from '@/lib/aiRaceEngineer'
import type { ElevationStats } from '@/lib/elevation'
import { rx2Config } from '@/lib/race/rx2Config'

export type CarSetup = {
  vehicleWeightLbs: number
  driverCrewWeightLbs: number
  batteryKwh: number
  nominalVoltage: number
  cruiseSpeedMph: number
  cd: number
  frontalAreaM2: number
  rollingResistanceCoefficient: number
  drivetrainEfficiency: number
  regenEfficiency: number
  solarWatts: number
  solarDrivingHours: number
  spareBatterySocPercent: number
  appProfile: AppProfile
}

export type EnergySimulationResult = {
  flatRoadWh: number
  climbWh: number
  regenWh: number
  solarWh: number
  netWh: number
  netKwh: number
  batteryPercentUsed: number
  estimatedWhPerMile: number
  predictedFinishSocPercent: number
  riskLevel: RiskLevel
}

const AIR_DENSITY_KG_PER_M3 = 1.18
const LBS_TO_KG = 0.45359237
const FEET_TO_METERS = 0.3048
const MPH_TO_METERS_PER_SECOND = 0.44704
const SOLAR_PRACTICAL_FACTOR = 0.65

// RX2 vehicle configuration source
export const defaultCarSetup: CarSetup = {
  vehicleWeightLbs: rx2Config.baseVehicleWeightLbs,
  driverCrewWeightLbs: rx2Config.requiredPassengerWeightLbs,
  batteryKwh: rx2Config.mainBatteryUsableWh / 1000,
  nominalVoltage: rx2Config.mainBatteryNominalVoltage,
  cruiseSpeedMph: rx2Config.defaultTargetSpeedMph,
  cd: rx2Config.estimatedCd,
  frontalAreaM2: rx2Config.estimatedFrontalAreaM2,
  rollingResistanceCoefficient: rx2Config.estimatedRollingResistance,
  drivetrainEfficiency: 0.82,
  regenEfficiency: 0.35,
  solarWatts: rx2Config.expectedSolarStationWatts,
  solarDrivingHours: 5,
  spareBatterySocPercent: 100,
  appProfile: 'team',
}

export const carSetupStorageKey = 'solar-race-car-setup'
export const carSetupChangedEventName = 'solar-race-car-setup-changed'

export function simulateDayEnergy({
  distanceMiles,
  elevationStats,
  carSetup,
}: {
  distanceMiles: number
  elevationStats: ElevationStats
  carSetup: CarSetup
}): EnergySimulationResult {
  const massKg =
    (carSetup.vehicleWeightLbs + carSetup.driverCrewWeightLbs) * LBS_TO_KG
  const velocityMetersPerSecond =
    carSetup.cruiseSpeedMph * MPH_TO_METERS_PER_SECOND
  const rollingForceNewtons =
    massKg * 9.81 * carSetup.rollingResistanceCoefficient
  const dragForceNewtons =
    0.5 *
    AIR_DENSITY_KG_PER_M3 *
    carSetup.cd *
    carSetup.frontalAreaM2 *
    velocityMetersPerSecond ** 2
  const flatRoadPowerWatts =
    ((rollingForceNewtons + dragForceNewtons) * velocityMetersPerSecond) /
    carSetup.drivetrainEfficiency
  const flatRoadWhPerMile = flatRoadPowerWatts / carSetup.cruiseSpeedMph
  const flatRoadWh = flatRoadWhPerMile * distanceMiles
  const climbWh =
    (massKg *
      9.81 *
      elevationStats.totalGain *
      FEET_TO_METERS) /
    carSetup.drivetrainEfficiency /
    3600
  const regenWh =
    (massKg *
      9.81 *
      elevationStats.totalLoss *
      FEET_TO_METERS *
      carSetup.regenEfficiency) /
    3600
  const solarWh =
    carSetup.solarWatts *
    carSetup.solarDrivingHours *
    SOLAR_PRACTICAL_FACTOR
  const grossWh = flatRoadWh + climbWh
  const netWh = Math.max(0, grossWh - regenWh - solarWh)
  const netKwh = netWh / 1000
  const batteryWh = carSetup.batteryKwh * 1000
  const batteryPercentUsed = batteryWh > 0 ? (netWh / batteryWh) * 100 : 100
  const predictedFinishSocPercent = Math.max(0, 100 - batteryPercentUsed)

  return {
    flatRoadWh,
    climbWh,
    regenWh,
    solarWh,
    netWh,
    netKwh,
    batteryPercentUsed,
    estimatedWhPerMile: distanceMiles > 0 ? netWh / distanceMiles : 0,
    predictedFinishSocPercent,
    riskLevel: classifyEnergyRisk(predictedFinishSocPercent),
  }
}

export function classifyEnergyRisk(predictedFinishSocPercent: number): RiskLevel {
  if (predictedFinishSocPercent > 50) return 'low'
  if (predictedFinishSocPercent >= 30) return 'medium'
  if (predictedFinishSocPercent >= 15) return 'high'
  return 'severe'
}

export function readStoredCarSetup(): CarSetup {
  if (typeof window === 'undefined') {
    return defaultCarSetup
  }

  try {
    const stored = window.localStorage.getItem(carSetupStorageKey)

    if (!stored) {
      return defaultCarSetup
    }

    return normalizeCarSetup(JSON.parse(stored) as Partial<CarSetup>)
  } catch {
    return defaultCarSetup
  }
}

export function writeStoredCarSetup(carSetup: CarSetup) {
  window.localStorage.setItem(
    carSetupStorageKey,
    JSON.stringify(normalizeCarSetup(carSetup))
  )
  window.dispatchEvent(new CustomEvent(carSetupChangedEventName))
}

export function normalizeCarSetup(value: Partial<CarSetup>): CarSetup {
  return {
    vehicleWeightLbs: positiveNumber(value.vehicleWeightLbs, defaultCarSetup.vehicleWeightLbs),
    driverCrewWeightLbs: positiveNumber(value.driverCrewWeightLbs, defaultCarSetup.driverCrewWeightLbs),
    batteryKwh: positiveNumber(value.batteryKwh, defaultCarSetup.batteryKwh),
    nominalVoltage: positiveNumber(value.nominalVoltage, defaultCarSetup.nominalVoltage),
    cruiseSpeedMph: positiveNumber(value.cruiseSpeedMph, defaultCarSetup.cruiseSpeedMph),
    cd: positiveNumber(value.cd, defaultCarSetup.cd),
    frontalAreaM2: positiveNumber(value.frontalAreaM2, defaultCarSetup.frontalAreaM2),
    rollingResistanceCoefficient: positiveNumber(value.rollingResistanceCoefficient, defaultCarSetup.rollingResistanceCoefficient),
    drivetrainEfficiency: boundedEfficiency(value.drivetrainEfficiency, defaultCarSetup.drivetrainEfficiency),
    regenEfficiency: boundedEfficiency(value.regenEfficiency, defaultCarSetup.regenEfficiency),
    solarWatts: positiveNumber(value.solarWatts, defaultCarSetup.solarWatts),
    solarDrivingHours: positiveNumber(value.solarDrivingHours, defaultCarSetup.solarDrivingHours),
    spareBatterySocPercent: socPercent(value.spareBatterySocPercent, defaultCarSetup.spareBatterySocPercent),
    appProfile: appProfile(value.appProfile),
  }
}

function positiveNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

function boundedEfficiency(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(1, Math.max(0.01, value))
}

function socPercent(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(100, Math.max(0, value))
}

function appProfile(value: unknown): AppProfile {
  return value === 'owner' ? 'owner' : defaultCarSetup.appProfile
}
