'use client'

import L from 'leaflet'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { useEffect, useMemo } from 'react'
import type { PublicRaceStatus } from '@/lib/publicRaceStatus'
import {
  nextStopForProgress,
  publicSccCourseCoordinates,
  publicSccRoute,
  splitRouteByCompletion,
  type LatLngTuple,
} from '@/lib/publicRaceRoute'

type PublicRaceLeafletMapProps = {
  raceStatus: PublicRaceStatus
}

const routeCoordinates = publicSccCourseCoordinates
const startPoint = publicSccRoute[0]
const finishPoint = publicSccRoute[publicSccRoute.length - 1]

const startIcon = createTextIcon('S', 'bg-emerald-400 text-black')
const finishIcon = createTextIcon('F', 'bg-red-400 text-black')
const nextStopIcon = createTextIcon('N', 'bg-yellow-300 text-black')
const rx2Icon = createTextIcon('RX2', 'bg-sky-300 text-black', 'h-9 w-9 text-[10px]')
const stopIcon = createDotIcon()

export default function PublicRaceLeafletMap({
  raceStatus,
}: PublicRaceLeafletMapProps) {
  const completedPercent = raceStatus.routeProgressPct
  const { completed } = useMemo(
    () => splitRouteByCompletion(routeCoordinates, completedPercent),
    [completedPercent]
  )
  const nextStop = nextStopForProgress(publicSccRoute, completedPercent) ?? finishPoint
  const stopMarkers = publicSccRoute.filter(
    (point) =>
      point.label !== startPoint.label &&
      point.label !== finishPoint.label &&
      point.label !== nextStop.label
  )
  const currentPosition: LatLngTuple = [raceStatus.lat, raceStatus.lng]
  const bounds = useMemo(
    () => L.latLngBounds([...routeCoordinates, currentPosition]),
    [currentPosition]
  )

  return (
    <div className="h-[360px] w-full md:h-[520px]">
      <MapContainer
        bounds={bounds}
        className="h-full w-full"
        maxZoom={13}
        minZoom={5}
        scrollWheelZoom={false}
      >
        <MapBounds bounds={bounds} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline
          pathOptions={{
            color: '#64748b',
            opacity: 0.65,
            weight: 6,
          }}
          positions={routeCoordinates}
        />
        <Polyline
          pathOptions={{
            color: '#ff3ea5',
            opacity: 0.95,
            weight: 7,
          }}
          positions={completed}
        />
        <Marker icon={startIcon} position={[startPoint.lat, startPoint.lng]}>
          <Popup>Start</Popup>
        </Marker>
        {stopMarkers.map((point) => (
          <Marker
            key={point.label}
            icon={stopIcon}
            position={[point.lat, point.lng]}
          >
            <Popup>{point.label}</Popup>
          </Marker>
        ))}
        <Marker icon={rx2Icon} position={currentPosition}>
          <Popup>Current RX2 Position</Popup>
        </Marker>
        <Marker icon={nextStopIcon} position={[nextStop.lat, nextStop.lng]}>
          <Popup>Next Stop: {nextStop.label}</Popup>
        </Marker>
        <Marker icon={finishIcon} position={[finishPoint.lat, finishPoint.lng]}>
          <Popup>Finish</Popup>
        </Marker>
      </MapContainer>
    </div>
  )
}

function MapBounds({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap()

  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] })
  }, [bounds, map])

  return null
}

function createTextIcon(
  label: string,
  colorClass: string,
  sizeClass = 'h-8 w-8 text-xs'
) {
  return L.divIcon({
    className: '',
    html: `<div class="${sizeClass} ${colorClass} grid place-items-center rounded-full border-2 border-white font-black shadow-[0_0_0_5px_rgba(0,0,0,0.25)]">${label}</div>`,
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  })
}

function createDotIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="h-4 w-4 rounded-full border-2 border-white bg-[#ff3ea5] shadow-[0_0_0_4px_rgba(0,0,0,0.25)]"></div>',
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  })
}
