import type { Metadata, Viewport } from 'next'
import OfflineStatusBanner from '@/components/OfflineStatusBanner'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
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
        {children}
      </body>
    </html>
  )
}

