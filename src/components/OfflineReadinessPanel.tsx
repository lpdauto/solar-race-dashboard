'use client'

import { useEffect, useState } from 'react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

const cacheName = 'solar-race-dashboard-v1'
const requiredCachedUrls = [
  '/',
  '/manifest.webmanifest',
  '/day/1',
  '/day/2',
  '/day/3',
  '/day/4',
  '/day/5',
]

type CacheCheck = {
  checked: boolean
  active: boolean
  missingUrls: string[]
  message: string
}

export default function OfflineReadinessPanel() {
  const isOnline = useOnlineStatus()
  const [serviceWorkerSupported, setServiceWorkerSupported] = useState(false)
  const [serviceWorkerRegistered, setServiceWorkerRegistered] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const [cacheCheck, setCacheCheck] = useState<CacheCheck>({
    checked: false,
    active: false,
    missingUrls: [],
    message: 'Cache has not been checked yet.',
  })

  useEffect(() => {
    setServiceWorkerSupported('serviceWorker' in navigator)
    setStandalone(window.matchMedia('(display-mode: standalone)').matches)

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(() => setServiceWorkerRegistered(true))
        .catch(() => setServiceWorkerRegistered(false))
    }
  }, [])

  async function testOfflineReadiness() {
    if (!('caches' in window)) {
      setCacheCheck({
        checked: true,
        active: false,
        missingUrls: requiredCachedUrls,
        message: 'Cache Storage is not available in this browser.',
      })
      return
    }

    const cache = await caches.open(cacheName)
    const missingUrls: string[] = []

    for (const url of requiredCachedUrls) {
      const response = await cache.match(url)

      if (!response) {
        missingUrls.push(url)
      }
    }

    setCacheCheck({
      checked: true,
      active: missingUrls.length === 0,
      missingUrls,
      message:
        missingUrls.length === 0
          ? 'Required race pages are cached for offline use.'
          : 'Some race pages are not cached yet. Open them once online, then test again.',
    })
  }

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/60 p-4 shadow-xl shadow-black/20">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-bold text-white">Offline Readiness</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Confirm this tablet is ready before race departure.
          </p>
        </div>
        <button
          type="button"
          onClick={testOfflineReadiness}
          className="h-10 rounded-md bg-teal-300 px-3 text-sm font-bold text-slate-950 transition hover:bg-teal-200"
        >
          Test offline readiness
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ChecklistItem label="App loaded" ready />
        <ChecklistItem
          label="Service worker supported"
          ready={serviceWorkerSupported}
        />
        <ChecklistItem
          label="Offline cache active/registered"
          ready={serviceWorkerRegistered || cacheCheck.active}
        />
        <ChecklistItem
          label="Online/offline status"
          ready
          detail={isOnline ? 'Online' : 'Offline'}
        />
        <ChecklistItem
          label="Installed as app"
          ready={standalone}
          detail={standalone ? 'Yes' : 'No'}
        />
      </div>

      {cacheCheck.checked ? (
        <div
          className={`mt-4 rounded-md border p-3 text-sm leading-6 ${
            cacheCheck.active
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
              : 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100'
          }`}
        >
          {cacheCheck.message}
          {cacheCheck.missingUrls.length > 0 ? (
            <span className="mt-1 block">
              Missing: {cacheCheck.missingUrls.join(', ')}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function ChecklistItem({
  label,
  ready,
  detail,
}: {
  label: string
  ready: boolean
  detail?: string
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p
        className={`mt-2 text-lg font-bold ${
          ready ? 'text-emerald-200' : 'text-yellow-100'
        }`}
      >
        {detail ?? (ready ? 'Ready' : 'Check')}
      </p>
    </div>
  )
}
