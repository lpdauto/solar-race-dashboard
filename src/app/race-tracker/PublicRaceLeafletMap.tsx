'use client'

import L from 'leaflet'
import Image from 'next/image'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { useEffect, useMemo, useState } from 'react'
import {
  publicRaceCheckpoints,
  type PublicRaceCheckpoint,
} from '@/data/publicRaceCheckpoints'
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
const finishPoint = publicSccRoute[publicSccRoute.length - 1]

const nextStopIcon = createTextIcon('N', 'bg-yellow-300 text-black')
const rx2Icon = createTextIcon('RX2', 'bg-sky-300 text-black', 'h-9 w-9 text-[10px]')

export default function PublicRaceLeafletMap({
  raceStatus,
}: PublicRaceLeafletMapProps) {
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null)
  const completedPercent = raceStatus.routeProgressPct
  const { completed } = useMemo(
    () => splitRouteByCompletion(routeCoordinates, completedPercent),
    [completedPercent]
  )
  const nextStop = nextStopForProgress(publicSccRoute, completedPercent) ?? finishPoint
  const selectedCheckpointIndex = publicRaceCheckpoints.findIndex(
    (checkpoint) => checkpoint.id === selectedCheckpointId
  )
  const selectedCheckpoint =
    selectedCheckpointIndex >= 0
      ? publicRaceCheckpoints[selectedCheckpointIndex]
      : null
  const currentPosition: LatLngTuple = [raceStatus.lat, raceStatus.lng]
  const showCurrentPosition = shouldShowCurrentPosition(raceStatus)
  const bounds = useMemo(
    () =>
      L.latLngBounds(
        showCurrentPosition
          ? [...routeCoordinates, currentPosition]
          : routeCoordinates
      ),
    [raceStatus.lat, raceStatus.lng, showCurrentPosition]
  )
  return (
    <div className="relative h-[300px] w-full min-w-0 max-w-full overflow-hidden min-[420px]:h-[320px] sm:h-[420px] md:h-[560px]">
      <MapContainer
        bounds={bounds}
        className="h-full w-full max-w-full"
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
        {publicRaceCheckpoints.map((checkpoint, index) => (
          <Marker
            key={checkpoint.id}
            eventHandlers={{
              click: () => setSelectedCheckpointId(checkpoint.id),
            }}
            icon={createCheckpointIcon({
              index: index + 1,
              selected: checkpoint.id === selectedCheckpointId,
            })}
            position={[checkpoint.lat, checkpoint.lng]}
            title={checkpoint.name}
          />
        ))}
        {showCurrentPosition ? (
          <Marker icon={rx2Icon} position={currentPosition}>
            <Popup>
              <div className="grid gap-1 text-sm">
                <strong>Current RX2 Position</strong>
                <span>
                  {raceStatus.lat.toFixed(6)}, {raceStatus.lng.toFixed(6)}
                </span>
                <span>
                  GPS:{' '}
                  {raceStatus.routeConfidence === 'live'
                    ? 'live'
                    : raceStatus.routeConfidence}
                </span>
              </div>
            </Popup>
          </Marker>
        ) : null}
        <Marker icon={nextStopIcon} position={[nextStop.lat, nextStop.lng]}>
          <Popup>Next Stop: {nextStop.label}</Popup>
        </Marker>
      </MapContainer>
      {selectedCheckpoint ? (
        <CheckpointDrawer
          checkpoint={selectedCheckpoint}
          hasPrevious={selectedCheckpointIndex > 0}
          hasNext={selectedCheckpointIndex < publicRaceCheckpoints.length - 1}
          onClose={() => setSelectedCheckpointId(null)}
          onPrevious={() =>
            setSelectedCheckpointId(
              publicRaceCheckpoints[selectedCheckpointIndex - 1]?.id ??
                selectedCheckpoint.id
            )
          }
          onNext={() =>
            setSelectedCheckpointId(
              publicRaceCheckpoints[selectedCheckpointIndex + 1]?.id ??
                selectedCheckpoint.id
            )
          }
        />
      ) : null}
    </div>
  )
}

function shouldShowCurrentPosition(raceStatus: PublicRaceStatus) {
  return (
    Number.isFinite(raceStatus.lat) &&
    Number.isFinite(raceStatus.lng) &&
    raceStatus.routeConfidence !== 'unavailable'
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

function createCheckpointIcon({
  index,
  selected,
}: {
  index: number
  selected: boolean
}) {
  return L.divIcon({
    className: '',
    html: `<div class="${
      selected
        ? 'h-9 w-9 border-[#ff3ea5] bg-white text-[#111111] shadow-[0_0_0_6px_rgba(255,62,165,0.30)]'
        : 'h-7 w-7 border-white bg-[#111111] text-white shadow-[0_0_0_4px_rgba(0,0,0,0.25)]'
    } grid place-items-center rounded-full border-2 text-[11px] font-black">${index}</div>`,
    iconAnchor: selected ? [18, 18] : [14, 14],
    popupAnchor: [0, -16],
  })
}

function CheckpointDrawer({
  checkpoint,
  hasPrevious,
  hasNext,
  onClose,
  onPrevious,
  onNext,
}: {
  checkpoint: PublicRaceCheckpoint
  hasPrevious: boolean
  hasNext: boolean
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <aside className="absolute inset-x-0 bottom-0 z-[1000] max-h-[82%] max-w-full overflow-y-auto rounded-t-lg border border-white/10 bg-[#101010] shadow-2xl shadow-black/50 md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:w-[360px] md:rounded-lg">
      <div className="relative aspect-[16/9] w-full min-w-0 max-w-full overflow-hidden rounded-t-lg bg-black/40">
        {checkpoint.image.src ? (
          <Image
            src={checkpoint.image.src}
            alt={checkpoint.image.alt}
            fill
            sizes="(min-width: 768px) 360px, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">
            Checkpoint photo coming soon
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/70 text-lg font-black text-white"
          aria-label="Close checkpoint details"
        >
          x
        </button>
      </div>

      <div className="min-w-0 space-y-4 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-md border border-[#ff3ea5]/35 bg-[#ff3ea5]/10 px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#ff8fcb]">
              Day {checkpoint.day}
            </span>
            <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-200">
              {checkpoint.type}
            </span>
          </div>
          <h2 className="mt-3 break-words text-2xl font-black text-white">
            {checkpoint.name}
          </h2>
          <p className="mt-1 break-words text-sm font-bold text-slate-400">
            {checkpoint.city}
          </p>
        </div>

        <p className="break-words text-sm leading-6 text-slate-200">
          {checkpoint.shortDescription}
        </p>

        <section className="rounded-md border border-white/10 bg-black/25 p-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#ff8fcb]">
            Why This Stop Matters
          </p>
          <p className="mt-2 break-words text-sm leading-6 text-slate-200">
            {checkpoint.whyItMatters}
          </p>
        </section>

        <p className="text-sm font-black text-emerald-200">
          Team update coming once RX2 arrives.
        </p>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
          <p className="text-xs leading-5 text-slate-500">
            Photo credit:{' '}
            {checkpoint.image.sourceUrl && checkpoint.image.sourceUrl !== '#' ? (
              <a
                href={checkpoint.image.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-slate-300 underline decoration-slate-500 underline-offset-4"
              >
                {checkpoint.image.credit}
              </a>
            ) : (
              <span className="font-bold text-slate-300">
                {checkpoint.image.credit}
              </span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onPrevious}
              disabled={!hasPrevious}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              className="rounded-md border border-[#ff3ea5]/30 bg-[#ff3ea5]/10 px-3 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
