export type Rx2VehicleConfig = {
  vehicleName: string
  division: string
  mainBatteryNominalVoltage: number
  mainBatteryAh: number
  mainBatteryUsableWh: number
  reserveSocPercent: number
  finalDayTargetReserveSocPercent: number
  absoluteMinimumSocPercent: number
  solarStationMaxWatts: number
  expectedSolarStationWatts: number
  motor: string
  controller: string
  tireDiameterIn: number
  drivetrainReduction: number
  baseVehicleWeightLbs: number
  requiredPassengerWeightLbs: number
  estimatedRaceWeightLbs: number
  estimatedCd: number
  estimatedFrontalAreaM2: number
  estimatedRollingResistance: number
  defaultRaceWhPerMile: number
  defaultTargetSpeedMph: number
  restStopDefaultMinutes: number
  lunchStopDefaultMinutes: number
  checkpointDefaultMinutes: number
  defaultTrailerSpeedMph: number
  minimumRaceSpeedMph: number
  maxRecommendedSpeedMph: number
}

// RX2 vehicle configuration source
export const rx2Config: Rx2VehicleConfig = {
  vehicleName: 'RX2',
  division: 'Electric-Solar Powered Car',
  mainBatteryNominalVoltage: 76.8,
  mainBatteryAh: 65,
  mainBatteryUsableWh: 4992,
  reserveSocPercent: 20,
  finalDayTargetReserveSocPercent: 8,
  absoluteMinimumSocPercent: 5,
  solarStationMaxWatts: 2500,
  expectedSolarStationWatts: 2160,
  motor: 'QSJ138D-90',
  controller: 'FarDriver ND72680',
  tireDiameterIn: 14,
  drivetrainReduction: 6.27,
  baseVehicleWeightLbs: 660,
  requiredPassengerWeightLbs: 320,
  estimatedRaceWeightLbs: 980,
  estimatedCd: 0.35,
  estimatedFrontalAreaM2: 1.2,
  estimatedRollingResistance: 0.012,
  defaultRaceWhPerMile: 40,
  defaultTargetSpeedMph: 35,
  restStopDefaultMinutes: 15,
  lunchStopDefaultMinutes: 30,
  checkpointDefaultMinutes: 10,
  defaultTrailerSpeedMph: 45,
  minimumRaceSpeedMph: 25,
  maxRecommendedSpeedMph: 40,
}
