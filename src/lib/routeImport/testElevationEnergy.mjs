import routeElevation from '../../data/routeElevation.json' with { type: 'json' }

const feetToMeters = 0.3048
const lbsToKg = 0.45359237
const gravityMetersPerSecondSquared = 9.81
const vehicleWeightLbs = 980
const drivetrainEfficiency = 0.8
const regenEfficiency = 0.2
const maxUsefulDescentRecoveryPercent = 0.3
const maxRecoveryWhPerMile = 35

const sampleWindows = [
  { label: 'Day 2 mid-route driving', startMile: 270, endMile: 315 },
  { label: 'Day 3 Hill Country driving', startMile: 388.5, endMile: 424.4 },
  { label: 'Day 4 long driving window', startMile: 489, endMile: 560 },
]

for (const sample of sampleWindows) {
  const window = getElevationWindow(sample.startMile, sample.endMile)
  const estimate = estimateElevationEnergyWh({
    ...window,
    vehicleWeightLbs,
    drivetrainEfficiency,
    regenEfficiency,
    distanceMiles: window.distanceMiles,
  })

  console.log(sample.label)
  console.log({
    miles: window.distanceMiles,
    gainFt: window.elevationGainFt,
    lossFt: window.elevationLossFt,
    maxSmoothedGradePercent: window.maxSmoothedGradePercent,
    averageSmoothedGradePercent: window.averageSmoothedGradePercent,
    climbEnergyWh: estimate.climbEnergyWh,
    descentRecoveryWh: estimate.descentRecoveryWh,
    netElevationEnergyWh: estimate.netElevationEnergyWh,
    warnings: window.dataQualityWarnings,
  })
}

function getElevationWindow(startMile, endMile) {
  const points = routeElevation.points.filter(
    (point) =>
      point.cumulativeMiles >= startMile &&
      point.cumulativeMiles <= endMile &&
      point.segmentType !== 'trailer'
  )
  const smoothedGrades = points
    .map((point) => point.smoothedGradePercent)
    .filter((grade) => typeof grade === 'number')
    .map(Math.abs)
  const elevationGainFt = round(
    points.reduce((total, point) => total + cleanElevationChange(point.elevationGainFt), 0)
  )
  const elevationLossFt = round(
    points.reduce((total, point) => total + cleanElevationChange(point.elevationLossFt), 0)
  )
  const maxSmoothedGradePercent =
    smoothedGrades.length > 0 ? round(Math.max(...smoothedGrades), 3) : null
  const averageSmoothedGradePercent =
    smoothedGrades.length > 0
      ? round(smoothedGrades.reduce((total, grade) => total + grade, 0) / smoothedGrades.length, 3)
      : null
  const warnings = []

  if (maxSmoothedGradePercent !== null && maxSmoothedGradePercent > 12) {
    warnings.push('Smoothed grade exceeds 12%; cap grade influence in strategy.')
  }

  return {
    elevationGainFt,
    elevationLossFt,
    maxSmoothedGradePercent,
    averageSmoothedGradePercent,
    distanceMiles: round(endMile - startMile, 4),
    dataQualityWarnings: warnings,
  }
}

function estimateElevationEnergyWh({
  elevationGainFt,
  elevationLossFt,
  vehicleWeightLbs,
  drivetrainEfficiency,
  regenEfficiency,
  distanceMiles,
}) {
  const massKg = vehicleWeightLbs * lbsToKg
  const climbEnergyWh =
    potentialEnergyWh(massKg, elevationGainFt) / drivetrainEfficiency
  const rawDescentRecoveryWh =
    potentialEnergyWh(massKg, elevationLossFt) * regenEfficiency
  const descentRecoveryWh = Math.min(
    rawDescentRecoveryWh,
    climbEnergyWh * maxUsefulDescentRecoveryPercent,
    distanceMiles * maxRecoveryWhPerMile
  )

  return {
    climbEnergyWh: round(climbEnergyWh),
    descentRecoveryWh: round(descentRecoveryWh),
    netElevationEnergyWh: round(Math.max(0, climbEnergyWh - descentRecoveryWh)),
  }
}

function potentialEnergyWh(massKg, elevationFt) {
  return (massKg * gravityMetersPerSecondSquared * elevationFt * feetToMeters) / 3600
}

function cleanElevationChange(value) {
  return Math.abs(value) < 3 ? 0 : Math.max(0, value)
}

function round(value, digits = 1) {
  return Number(value.toFixed(digits))
}
