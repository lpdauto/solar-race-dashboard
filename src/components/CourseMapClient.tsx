'use client'

import { Fragment, useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import type { RaceDay, RiskLevel, RoutePoint } from '@/data/raceRoute'
import {
  classifyRouteSegmentSeverity,
  findSegmentForMile,
  getCurrentDayBounds,
  getDayBounds,
  getSeverityColor,
  type MapSeverity,
} from '@/lib/mapSeverity'

type CourseMapProps = {
  days: RaceDay[]
  currentDayNumber?: number
  currentMile?: number
  currentLocation?: {
    lat: number
    lng: number
  }
  heightClass?: string
  showAllDays?: boolean
}

type RouteLine = {
  key: string
  day: RaceDay
  pointA: RoutePoint
  pointB: RoutePoint
  severity: MapSeverity
  isCurrentDay: boolean
  isCurrentSegment: boolean
}

const texasCenter: [number, number] = [31.35, -99.25]

export default function CourseMapClient({
  days,
  currentDayNumber,
  currentMile,
  currentLocation,
  heightClass = 'h-[360px] md:h-[500px]',
  showAllDays = true,
}: CourseMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const visibleDays = useMemo(
    () =>
      showAllDays
        ? days
        : days.filter((day) => day.day === currentDayNumber),
    [currentDayNumber, days, showAllDays]
  )
  const currentDay =
    days.find((day) => day.day === currentDayNumber) ?? visibleDays[0]
  const bounds = useMemo(() => getDayBounds(visibleDays), [visibleDays])
  const currentDayBounds = useMemo(
    () => (currentDay ? getCurrentDayBounds(currentDay) : bounds),
    [bounds, currentDay]
  )
  const routeLines = useMemo(
    () =>
      visibleDays.flatMap((day) =>
        day.routePoints.slice(0, -1).map((point, index) => {
          const pointB = day.routePoints[index + 1]
          const severity = classifyRouteSegmentSeverity(
            point,
            pointB,
            day.segments,
            day.riskLevel
          )
          const isCurrentDay = day.day === currentDayNumber
          const isCurrentSegment =
            isCurrentDay &&
            currentMile !== undefined &&
            currentMile >= point.mile &&
            currentMile <= pointB.mile

          return {
            key: `${day.day}-${point.mile}-${pointB.mile}`,
            day,
            pointA: point,
            pointB,
            severity,
            isCurrentDay,
            isCurrentSegment,
          }
        })
      ),
    [currentDayNumber, currentMile, visibleDays]
  )
  const currentSegment =
    currentDay && currentMile !== undefined
      ? findSegmentForMile(currentDay, currentMile)
      : null
  const distanceRemaining =
    currentDay && currentMile !== undefined
      ? Math.max(0, currentDay.distanceMiles - currentMile)
      : null

  function fitFullRoute() {
    if (!mapRef.current || bounds.length === 0) return
    mapRef.current.fitBounds(bounds, { padding: [28, 28] })
  }

  function fitCurrentDay() {
    if (!mapRef.current || currentDayBounds.length === 0) return
    mapRef.current.fitBounds(currentDayBounds, { padding: [32, 32] })
  }

  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-[#151515] shadow-2xl shadow-black/30">
      <div className={`relative ${heightClass}`}>
        <MapContainer
          center={texasCenter}
          zoom={6}
          className="h-full w-full"
          scrollWheelZoom
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds bounds={bounds} />

          {routeLines.map((line) => (
            <Polyline
              key={line.key}
              positions={[
                [line.pointA.lat, line.pointA.lng],
                [line.pointB.lat, line.pointB.lng],
              ]}
              pathOptions={{
                color: getSeverityColor(line.severity),
                opacity: line.isCurrentDay ? 0.98 : 0.48,
                weight: line.isCurrentSegment ? 9 : line.isCurrentDay ? 7 : 4,
              }}
            >
              <Popup>
                <MapPopupLine line={line} />
              </Popup>
            </Polyline>
          ))}

          {visibleDays.map((day, index) => {
            const startPoint = day.routePoints[0]
            const finishPoint = day.routePoints[day.routePoints.length - 1]
            const isOverallStart = index === 0

            return (
              <Fragment key={`markers-${day.day}`}>
                <Marker
                  position={[startPoint.lat, startPoint.lng]}
                  icon={createMarkerIcon(isOverallStart ? 'start' : 'day-start')}
                >
                  <Popup>
                    <MarkerPopup
                      title={isOverallStart ? 'Overall Race Start' : `Day ${day.day} Start`}
                      day={day}
                      point={startPoint}
                    />
                  </Popup>
                </Marker>
                <Marker
                  position={[finishPoint.lat, finishPoint.lng]}
                  icon={createMarkerIcon(day.day === 5 ? 'finish' : 'day-finish')}
                >
                  <Popup>
                    <MarkerPopup
                      title={`Day ${day.day} Finish`}
                      day={day}
                      point={finishPoint}
                    />
                  </Popup>
                </Marker>
              </Fragment>
            )
          })}

          {currentLocation ? (
            <Marker
              position={[currentLocation.lat, currentLocation.lng]}
              icon={createMarkerIcon('current')}
            >
              <Popup>
                <div className="grid gap-1 text-sm">
                  <strong>Current Vehicle</strong>
                  <span>
                    {currentLocation.lat.toFixed(5)}, {currentLocation.lng.toFixed(5)}
                  </span>
                </div>
              </Popup>
            </Marker>
          ) : null}
        </MapContainer>

        <div className="pointer-events-none absolute left-3 top-3 z-[500] grid max-w-[18rem] gap-2">
          <div className="pointer-events-auto rounded-lg border border-white/10 bg-black/80 p-3 shadow-xl backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff8fcb]">
              Course Map
            </p>
            <dl className="mt-2 grid gap-1 text-xs text-[#cfcfcf]">
              <MapMetric label="Current day" value={currentDayNumber ? `Day ${currentDayNumber}` : 'Full route'} />
              <MapMetric label="Current mile" value={currentMile !== undefined ? currentMile.toFixed(1) : '--'} />
              <MapMetric label="Remaining" value={distanceRemaining !== null ? `${distanceRemaining.toFixed(1)} mi` : '--'} />
              <MapMetric label="Segment severity" value={currentSegment?.risk ?? currentDay?.riskLevel ?? '--'} />
            </dl>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={fitFullRoute}
                className="rounded-md border border-[#ff3ea5]/30 bg-[#ff3ea5]/15 px-2 py-2 text-xs font-bold text-[#ff8fcb] transition hover:bg-[#ff3ea5]/25"
              >
                Fit full
              </button>
              <button
                type="button"
                onClick={fitCurrentDay}
                className="rounded-md border border-white/10 bg-white/10 px-2 py-2 text-xs font-bold text-white transition hover:border-[#ff3ea5]/30"
              >
                Fit day
              </button>
            </div>
          </div>

          <div className="pointer-events-auto rounded-lg border border-white/10 bg-black/80 p-3 shadow-xl backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white">
              Legend
            </p>
            <div className="mt-2 grid gap-1.5 text-xs font-semibold text-[#cfcfcf]">
              <LegendItem color="#22c55e" label="Low elevation severity" />
              <LegendItem color="#facc15" label="Moderate" />
              <LegendItem color="#fb923c" label="High" />
              <LegendItem color="#ef4444" label="Severe" />
              <LegendItem color="#38bdf8" label="Current vehicle" />
            </div>
          </div>
        </div>
      </div>

      <p className="border-t border-white/10 bg-black/30 px-4 py-3 text-xs leading-5 text-[#a8a8a8]">
        Map tiles require internet unless previously cached. Route, GPS, and strategy data still work offline.
      </p>
    </section>
  )
}

function FitBounds({ bounds }: { bounds: Array<[number, number]> }) {
  const map = useMap()

  useEffect(() => {
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [28, 28] })
    }
  }, [bounds, map])

  return null
}

function MapPopupLine({ line }: { line: RouteLine }) {
  const midpoint = (line.pointA.mile + line.pointB.mile) / 2
  const segment = findSegmentForMile(line.day, midpoint)

  return (
    <div className="grid gap-1 text-sm">
      <strong>Day {line.day.day}</strong>
      <span>
        Mile {line.pointA.mile.toFixed(1)} to {line.pointB.mile.toFixed(1)}
      </span>
      <span>Severity: {line.severity}</span>
      <span>
        {line.pointA.label ?? 'Route point'} to {line.pointB.label ?? 'route point'}
      </span>
      {segment ? <span>{segment.notes}</span> : null}
    </div>
  )
}

function MarkerPopup({
  title,
  day,
  point,
}: {
  title: string
  day: RaceDay
  point: RoutePoint
}) {
  return (
    <div className="grid gap-1 text-sm">
      <strong>{title}</strong>
      <span>
        Day {day.day}: {day.start} to {day.end}
      </span>
      <span>Mile {point.mile.toFixed(1)}</span>
      {point.label ? <span>{point.label}</span> : null}
      {point.note ? <span>{point.note}</span> : null}
    </div>
  )
}

function MapMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#a8a8a8]">{label}</dt>
      <dd className="font-black text-white">{value}</dd>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-6 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  )
}

function createMarkerIcon(
  type: 'start' | 'finish' | 'current' | 'day-start' | 'day-finish'
) {
  const className = `course-map-marker course-map-marker-${type}`
  const label =
    type === 'current'
      ? ''
      : type === 'start'
        ? 'S'
        : type === 'finish'
          ? 'F'
          : type === 'day-start'
            ? 'D'
            : 'E'

  return L.divIcon({
    className: '',
    html: `<div class="${className}">${label}</div>`,
    iconSize: type === 'current' ? [26, 26] : [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })
}
