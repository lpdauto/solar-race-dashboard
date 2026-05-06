'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      console.info('Service workers are not supported in this browser.')
      return
    }

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        )
        .then(() => caches.delete('solar-race-dashboard-v1'))
        .then(() => {
          console.info('Solar Race service worker disabled for local development.')
        })
        .catch((error) => {
          console.error('Could not disable local service worker:', error)
        })
      return
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.info('Solar Race service worker registered:', registration.scope)
      })
      .catch((error) => {
        console.error('Solar Race service worker registration failed:', error)
      })
  }, [])

  return null
}
