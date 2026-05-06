'use client'

import { useOnlineStatus } from '@/hooks/useOnlineStatus'

export default function OfflineStatusBanner() {
  const isOnline = useOnlineStatus()

  return (
    <div
      className={`border-b px-4 py-2 text-center text-sm font-semibold ${
        isOnline
          ? 'border-teal-300/20 bg-teal-300/10 text-teal-100'
          : 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100'
      }`}
    >
      {isOnline
        ? 'Race dashboard is available offline after first load.'
        : 'Offline mode active. GPS and saved route strategy still work.'}
    </div>
  )
}
