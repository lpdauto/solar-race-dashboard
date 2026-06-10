export type PublicRoutePoint = {
  label: string
  lat: number
  lng: number
}

export type LatLngTuple = [number, number]

export const publicSccRoute: PublicRoutePoint[] = [
  { label: 'Northwest ISD District Office', lat: 33.03047, lng: -97.320738 },
  { label: 'Godley High School and Middle School', lat: 32.456855, lng: -97.546999 },
  { label: 'Hill County Courthouse', lat: 32.011275, lng: -97.130728 },
  { label: 'Palestine High School', lat: 31.738999, lng: -95.604293 },
  { label: 'Leon ISD Junior & Senior High School', lat: 31.318984, lng: -96.209238 },
  { label: 'City of Hearne', lat: 30.880714, lng: -96.597013 },
  { label: 'Tractor Supply Taylor', lat: 30.599521, lng: -97.414964 },
  { label: 'River Horse Academy', lat: 30.546616, lng: -97.542336 },
  { label: 'Dell Diamond', lat: 30.527732, lng: -97.630839 },
  { label: 'H-E-B Burnet', lat: 30.758764, lng: -98.222676 },
  { label: 'Burnet Municipal Airport', lat: 30.739966, lng: -98.237114 },
  { label: 'Blanco County Courthouse', lat: 30.278134, lng: -98.411459 },
  { label: 'Science Mill', lat: 30.276445, lng: -98.412199 },
  { label: 'Marktplatz Park Area', lat: 30.276277, lng: -98.872635 },
  { label: 'Main Street & Adams', lat: 30.274869, lng: -98.871822 },
  { label: 'Mason County Courthouse', lat: 30.74829, lng: -99.231933 },
  { label: 'Walmart San Angelo', lat: 31.487883, lng: -100.460775 },
  { label: 'Arden Road Exit', lat: 31.447617, lng: -100.486418 },
  { label: 'US 67 & Duncan Ave', lat: 31.263105, lng: -100.811671 },
  { label: 'Sunoco Big Lake', lat: 31.192112, lng: -101.466821 },
  { label: 'US 385 & US 67', lat: 31.131541, lng: -102.222329 },
  { label: 'Fort Stockton Convention Center', lat: 30.902088, lng: -102.902886 },
]

export const publicSccCourseCoordinates: LatLngTuple[] = [
  [33.030476, -97.320795],
  [32.983679, -97.304827],
  [32.854865, -97.313229],
  [32.764387, -97.318777],
  [32.73102, -97.363819],
  [32.715118, -97.392878],
  [32.671186, -97.408962],
  [32.609543, -97.412726],
  [32.569516, -97.446812],
  [32.520479, -97.526308],
  [32.448976, -97.533561],
  [32.421994, -97.470335],
  [32.365951, -97.394392],
  [32.345239, -97.386162],
  [32.289743, -97.348674],
  [32.26187, -97.288677],
  [32.189895, -97.25826],
  [32.094385, -97.191937],
  [32.010748, -97.13015],
  [31.970266, -97.001689],
  [31.855249, -96.803168],
  [31.911721, -96.704583],
  [31.997472, -96.611523],
  [32.046918, -96.505114],
  [31.964615, -96.420767],
  [31.869499, -96.335019],
  [31.73043, -96.181879],
  [31.696328, -96.072216],
  [31.651114, -95.774644],
  [31.723171, -95.687939],
  [31.733141, -95.6233],
  [31.738415, -95.603668],
  [31.737195, -95.635445],
  [31.707926, -95.713977],
  [31.623129, -95.821538],
  [31.497117, -96.008066],
  [31.378394, -96.132417],
  [31.241413, -96.257862],
  [31.012792, -96.506005],
  [30.881066, -96.594895],
  [30.785421, -96.720932],
  [30.68386, -96.934264],
  [30.649779, -97.014003],
  [30.630533, -97.101855],
  [30.60507, -97.238953],
  [30.574454, -97.391134],
  [30.587512, -97.411661],
  [30.5694, -97.437201],
  [30.542846, -97.548143],
  [30.523974, -97.635113],
  [30.517518, -97.686305],
  [30.630951, -97.691104],
  [30.631282, -97.748192],
  [30.637748, -97.829493],
  [30.663144, -97.901462],
  [30.675961, -97.939911],
  [30.714539, -98.007375],
  [30.743628, -98.054567],
  [30.750156, -98.143391],
  [30.75815, -98.212158],
  [30.739398, -98.2353],
  [30.607541, -98.267206],
  [30.571205, -98.276182],
  [30.476518, -98.321874],
  [30.364292, -98.376441],
  [30.283415, -98.410284],
  [30.263112, -98.47113],
  [30.242387, -98.571867],
  [30.222694, -98.717056],
  [30.245394, -98.845839],
  [30.277011, -98.873421],
  [30.350244, -98.920207],
  [30.500895, -99.011509],
  [30.686311, -99.144311],
  [30.776458, -99.250473],
  [31.0101, -99.27398],
  [31.135483, -99.341013],
  [31.222986, -99.616896],
  [31.21801, -99.961917],
  [31.36991, -100.224627],
  [31.390258, -100.430016],
  [31.455951, -100.440482],
  [31.482069, -100.4657],
  [31.414178, -100.540329],
  [31.26551, -100.81595],
  [31.172099, -101.036233],
  [31.190882, -101.439831],
  [31.22803, -101.928164],
  [31.13599, -102.224314],
  [30.959432, -102.580202],
  [30.893942, -102.888939],
  [30.902262, -102.903082],
]

export function publicRouteCoordinates(points = publicSccRoute): LatLngTuple[] {
  return points.map((point) => [point.lat, point.lng])
}

export function calculateCompletedRoutePercentage({
  milesCompleted,
  totalMiles,
}: {
  milesCompleted: number
  totalMiles: number
}) {
  if (!Number.isFinite(milesCompleted) || !Number.isFinite(totalMiles) || totalMiles <= 0) {
    return 0
  }

  return Math.min(100, Math.max(0, (milesCompleted / totalMiles) * 100))
}

export function splitRouteByCompletion(
  route: LatLngTuple[],
  completedPercent: number
) {
  if (route.length < 2) {
    return { completed: route, remaining: route }
  }

  const clampedPercent = Math.min(100, Math.max(0, completedPercent))
  const targetDistance =
    routeDistance(route) * (clampedPercent / 100)
  let traveledDistance = 0
  const completed: LatLngTuple[] = [route[0]]

  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1]
    const current = route[index]
    const segmentDistance = distanceBetween(previous, current)

    if (traveledDistance + segmentDistance < targetDistance) {
      completed.push(current)
      traveledDistance += segmentDistance
      continue
    }

    const segmentProgress =
      segmentDistance > 0
        ? (targetDistance - traveledDistance) / segmentDistance
        : 0
    const splitPoint = interpolatePoint(previous, current, segmentProgress)

    completed.push(splitPoint)

    return {
      completed,
      remaining: [splitPoint, ...route.slice(index)],
    }
  }

  return {
    completed: route,
    remaining: [route[route.length - 1]],
  }
}

export function nextStopForProgress(
  points: PublicRoutePoint[],
  completedPercent: number,
  course: LatLngTuple[] = publicSccCourseCoordinates
) {
  if (points.length === 0) return null

  const splitPoint = splitRouteByCompletion(course, completedPercent).completed.at(-1)

  if (!splitPoint) return points[0]

  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  points.forEach((point, index) => {
    const distance = distanceBetween(splitPoint, [point.lat, point.lng])
    if (distance < nearestDistance) {
      nearestIndex = index
      nearestDistance = distance
    }
  })

  return points[Math.min(points.length - 1, nearestIndex + 1)]
}

function routeDistance(route: LatLngTuple[]) {
  return route.reduce((sum, point, index) => {
    if (index === 0) return sum

    return sum + distanceBetween(route[index - 1], point)
  }, 0)
}

function distanceBetween(left: LatLngTuple, right: LatLngTuple) {
  const latDistance = right[0] - left[0]
  const lngDistance = right[1] - left[1]

  return Math.sqrt(latDistance * latDistance + lngDistance * lngDistance)
}

function interpolatePoint(
  start: LatLngTuple,
  end: LatLngTuple,
  progress: number
): LatLngTuple {
  const clampedProgress = Math.min(1, Math.max(0, progress))

  return [
    start[0] + (end[0] - start[0]) * clampedProgress,
    start[1] + (end[1] - start[1]) * clampedProgress,
  ]
}
