'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      console.info('Service workers are not supported in this browser.')
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
