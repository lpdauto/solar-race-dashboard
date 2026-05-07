'use client'

import { useEffect, useState } from 'react'

type ExpandablePanelProps = {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}

export default function ExpandablePanel({
  open,
  title,
  subtitle,
  onClose,
  children,
}: ExpandablePanelProps) {
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pinned) {
        onClose()
      }
    }

    if (open) {
      window.addEventListener('keydown', handleKeyDown)
    }

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open, pinned])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 p-0 backdrop-blur-md sm:p-4">
      <div className="mx-auto flex h-full max-w-[1100px] flex-col overflow-hidden rounded-none border border-white/10 bg-slate-950 shadow-2xl shadow-black/40 sm:rounded-lg">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-slate-950/95 p-4">
          <div>
            <h2 className="text-xl font-bold text-white">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-sm leading-6 text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setPinned(!pinned)}
              className={`h-10 rounded-md border px-3 text-sm font-bold transition ${
                pinned
                  ? 'border-[#ff3ea5]/40 bg-[#ff3ea5]/10 text-[#ff8fcb]'
                  : 'border-white/10 bg-white/5 text-slate-100 hover:border-[#ff3ea5]/40'
              }`}
            >
              {pinned ? 'Pinned' : 'Pin open'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-red-300/40 hover:bg-red-300/10"
            >
              Close
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}


