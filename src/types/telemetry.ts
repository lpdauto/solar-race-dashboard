export type TelemetryData = {
  timestamp: number
  speedMph: number
  batteryVoltage: number
  batteryCurrent: number
  batteryPowerWatts: number
  batterySocPercent: number
  motorTempC: number
  controllerTempC: number
  batteryTempC: number
  solarPowerWatts: number
  solarCurrent: number
  solarVoltage: number
  motorRpm: number
  wheelRpm: number
  efficiencyWhPerMile: number
  regenWatts: number
  gpsLat?: number
  gpsLng?: number
  gpsSpeed?: number
  gpsHeading?: number
  gpsAccuracy?: number
}

export type TelemetryConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'simulated'
  | 'error'

export type TelemetrySource =
  | 'simulator'
  | 'websocket'
  | 'serial'
  | 'ble'
  | 'canbus'
