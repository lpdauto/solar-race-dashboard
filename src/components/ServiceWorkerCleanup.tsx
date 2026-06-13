'use client'

import { useEffect } from 'react'

const oldCachePrefixes = ['solar-race-dashboard-']

export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      )
      .catch((error) => {
        console.error('Could not unregister old service workers:', error)
      })

    if ('caches' in window) {
      caches
        .keys()
        .then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter((cacheName) =>
                oldCachePrefixes.some((prefix) => cacheName.startsWith(prefix))
              )
              .map((cacheName) => caches.delete(cacheName))
          )
        )
        .catch((error) => {
          console.error('Could not clear old app caches:', error)
        })
    }
  }, [])

  return null
}
