import type { Metadata, Viewport } from 'next'
import AppNavigation from '@/components/AppNavigation'
import OfflineStatusBanner from '@/components/OfflineStatusBanner'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import { Suspense } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Solar Race Strategy Dashboard',
  description: 'Race navigation and energy strategy planner for the 2026 Cross-Texas Solar Car Challenge route.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Solar Race',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#080808',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        <OfflineStatusBanner />
        <Suspense fallback={null}>
          <AppNavigation />
        </Suspense>
        {children}
      </body>
    </html>
  )
}

