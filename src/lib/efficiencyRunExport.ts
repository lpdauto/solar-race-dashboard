import type { EfficiencyTestRun, TestTelemetrySample } from '@/types/efficiencyTest'
import { csvCell, downloadTextFile, fileSafeName, fileTimestamp } from '@/lib/testModeFormat'

const sampleColumns: Array<keyof TestTelemetrySample> = [
  'timestamp',
  'gpsLat',
  'gpsLng',
  'gpsLatitude',
  'gpsLongitude',
  'gpsSpeedMps',
  'gpsSpeedMph',
  'gpsHeading',
  'gpsAltitudeMeters',
  'gpsAltitudeFeet',
  'gpsAccuracyMeters',
  'gpsClientTimestamp',
  'gpsServerTimestamp',
  'gpsAgeMs',
  'gpsStatus',
  'gpsProviderName',
  'gpsSource',
  'speedMph',
  'distanceMiles',
  'batterySocPercent',
  'batteryVoltage',
  'batteryCurrent',
  'batteryPowerWatts',
  'whPerMile',
  'motorTempC',
  'controllerTempC',
  'controllerSpeedMph',
  'motorRpm',
  'throttlePercent',
  'throttleVoltage',
  'phaseA',
  'phaseC',
  'modulation',
  'gear',
  'controllerSerial',
  'controllerFaultCode',
  'controllerState',
  'bleConnected',
  'packetRateHz',
  'solarPowerWatts',
  'mpptPowerWatts',
  'bmsConnected',
  'bmsAddress',
  'bmsVoltage',
  'bmsCurrent',
  'bmsPowerWatts',
  'bmsSocPercent',
  'avgCellVoltage',
  'cellMinVoltage',
  'cellMaxVoltage',
  'cellDeltaMv',
  'batteryTemp1C',
  'batteryTemp2C',
  'mosTempC',
]

/** Exports the run's raw per-sample telemetry (unconditional, every field). */
export function downloadRunCsv(run: EfficiencyTestRun) {
  const header = sampleColumns.join(',')
  const rows = run.samples.map((sample) =>
    sampleColumns.map((column) => csvCell(sample[column])).join(',')
  )

  downloadTextFile({
    filename: `${fileSafeName(run.name)}_${fileTimestamp(run.startedAt)}.csv`,
    mimeType: 'text/csv;charset=utf-8',
    content: [header, ...rows].join('\n'),
  })
}

/** Exports the full run object (summary + chart points + raw samples). */
export function downloadRunJson(run: EfficiencyTestRun) {
  downloadTextFile({
    filename: `${fileSafeName(run.name)}_${fileTimestamp(run.startedAt)}.json`,
    mimeType: 'application/json;charset=utf-8',
    content: JSON.stringify(run, null, 2),
  })
}
