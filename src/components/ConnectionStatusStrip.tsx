'use client'

import { useEffect, useState } from 'react'

type StatusTone = 'loading' | 'green' | 'yellow' | 'red' | 'gray'

type ConnectionItem = {
  name: string
  status: string
  helper: string
  tone: StatusTone
}

const weatherCachePrefix = 'solar-race-weather-day-'

const toneStyles: Record<StatusTone, string> = {
  loading: 'bg-slate-400 shadow-slate-400/30',
  green: 'bg-emerald-400 shadow-emerald-400/40',
  yellow: 'bg-yellow-300 shadow-yellow-300/40',
  red: 'bg-red-500 shadow-red-500/40',
  gray: 'bg-slate-500 shadow-slate-500/30',
}

const initialItems: ConnectionItem[] = [
  {
    name: 'Internet',
    status: 'Checking',
    helper: 'Status will load after mount',
    tone: 'loading',
  },
  {
    name: 'GPS',
    status: 'Checking',
    helper: 'Passive homepage check only',
    tone: 'loading',
  },
  {
    name: 'ESP32 Telemetry',
    status: 'Checking',
    helper: 'Simulator and hardware readiness',
    tone: 'loading',
  },
  {
    name: 'Wi-Fi / Local Network',
    status: 'Checking',
    helper: 'Travel-router readiness',
    tone: 'loading',
  },
  {
    name: 'Weather Cache',
    status: 'Checking',
    helper: 'Looking for saved forecasts',
    tone: 'loading',
  },
]

export default function ConnectionStatusStrip() {
  const [mounted, setMounted] = useState(false)
  const [items, setItems] = useState<ConnectionItem[]>(initialItems)

  useEffect(() => {
    setMounted(true)

    function updateStatus() {
      const online = navigator.onLine
      const hasGeolocation = 'geolocation' in navigator
      const cachedDayCount = countCachedWeatherDays()

      setItems([
        {
          name: 'Internet',
          status: online ? 'Online' : 'Offline',
          helper: online ? 'Live APIs available' : 'Offline mode active',
          tone: online ? 'green' : 'red',
        },
        {
          name: 'GPS',
          status: hasGeolocation ? 'Permission needed' : 'Unsupported',
          helper: hasGeolocation
            ? 'Ready when enabled on a day page'
            : 'Secure browser GPS unavailable',
          tone: hasGeolocation ? 'yellow' : 'red',
        },
        {
          name: 'ESP32 Telemetry',
          status: 'Simulator ready',
          helper: 'Hardware bridge not connected yet',
          tone: 'yellow',
        },
        {
          name: 'Wi-Fi / Local Network',
          status: online ? 'Network reachable' : 'Local mode possible',
          helper: getNetworkHelperText(online),
          tone: online ? 'green' : 'yellow',
        },
        {
          name: 'Weather Cache',
          status:
            cachedDayCount === 5
              ? 'Cached'
              : cachedDayCount > 0
                ? 'Partial cache'
                : 'Missing',
          helper:
            cachedDayCount === 5
              ? 'All race days stored locally'
              : cachedDayCount > 0
                ? `${cachedDayCount}/5 race days cached`
                : 'Use Weather Cache preload',
          tone:
            cachedDayCount === 5
              ? 'green'
              : cachedDayCount > 0
                ? 'yellow'
                : 'gray',
        },
      ])
    }

    updateStatus()
    window.addEventListener('online', updateStatus)
    window.addEventListener('offline', updateStatus)
    window.addEventListener('storage', updateStatus)

    return () => {
      window.removeEventListener('online', updateStatus)
      window.removeEventListener('offline', updateStatus)
      window.removeEventListener('storage', updateStatus)
    }
  }, [])

  return (
    <section
      className="grid max-w-full gap-2 rounded-lg border border-[#ff3ea5]/25 bg-black/35 p-2 shadow-xl shadow-black/20 backdrop-blur sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
      aria-label="Connection status"
    >
      {items.map((item) => (
        <article
          key={item.name}
          className="min-w-0 rounded-md border border-white/10 bg-white/[0.055] px-2.5 py-2"
        >
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full shadow-[0_0_12px_currentColor] ${
                mounted ? toneStyles[item.tone] : toneStyles.loading
              }`}
              aria-hidden="true"
            />
            <h2 className="truncate text-xs font-black text-white">
              {item.name}
            </h2>
          </div>
          <p className="mt-1 text-xs font-black text-[#ff8fcb]">
            {mounted ? item.status : 'Checking'}
          </p>
          <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-slate-300">
            {mounted ? item.helper : 'Status will load after mount'}
          </p>
        </article>
      ))}
    </section>
  )
}

function countCachedWeatherDays() {
  let cachedDayCount = 0

  for (let dayNumber = 1; dayNumber <= 5; dayNumber += 1) {
    const cached = window.localStorage.getItem(`${weatherCachePrefix}${dayNumber}`)

    if (cached) cachedDayCount += 1
  }

  return cachedDayCount
}

function getNetworkHelperText(online: boolean) {
  const navigatorWithConnection = navigator as Navigator & {
    connection?: {
      effectiveType?: string
    }
  }
  const effectiveType = navigatorWithConnection.connection?.effectiveType

  if (effectiveType) {
    return `Connection type: ${effectiveType}`
  }

  return online
    ? 'Network available'
    : 'Offline; local Wi-Fi may still work'
}
