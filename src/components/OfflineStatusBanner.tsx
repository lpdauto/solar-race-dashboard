'use client'

import { useEffect, useState } from 'react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { usePathname } from 'next/navigation'

export default function OfflineStatusBanner() {
  const [mounted, setMounted] = useState(false)
  const isOnline = useOnlineStatus()
  const pathname = usePathname()
  const showLogout = pathname !== '/login'

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || isOnline === null) {
    return (
      <div
        aria-hidden="true"
        data-offline-status-placeholder="true"
        className="hidden"
        suppressHydrationWarning
      />
    )
  }

  return (
    <div
      className={`border-b px-4 py-2 text-sm font-semibold ${
        isOnline
          ? 'border-teal-300/20 bg-teal-300/10 text-teal-100'
          : 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100'
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <span>
          {isOnline
            ? 'Race dashboard is available offline after first load.'
            : 'Offline mode active. GPS and saved route strategy still work.'}
        </span>
        {showLogout ? (
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="h-8 rounded-md border border-white/10 bg-black/20 px-3 text-xs font-bold text-slate-100 transition hover:border-red-300/40 hover:bg-red-300/10"
            >
              Logout
            </button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
