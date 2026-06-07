'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'

type NavSection =
  | 'overview'
  | 'race-day'
  | 'mission-control'
  | 'telemetry'
  | 'setup'
  | 'reports'

const navItems: Array<{
  section: NavSection
  label: string
  href: (day: number) => string
}> = [
  { section: 'overview', label: '🏠 Overview', href: () => '/' },
  { section: 'race-day', label: '🏁 Race Day', href: (day) => `/day/${day}?view=race-day` },
  {
    section: 'mission-control',
    label: '📊 Mission Control',
    href: (day) => `/day/${day}?view=mission-control&role=race-captain`,
  },
  {
    section: 'telemetry',
    label: '⚡ Telemetry',
    href: (day) => `/day/${day}?view=telemetry&node=vehicle`,
  },
  { section: 'setup', label: '⚙️ Setup', href: (day) => `/day/${day}?view=setup` },
  { section: 'reports', label: '📄 Reports', href: (day) => `/day/${day}?view=reports` },
]

export default function AppNavigation() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const currentDay = dayFromPath(pathname)
  const activeSection = sectionFromRoute(pathname, searchParams)
  const activeItem =
    navItems.find((item) => item.section === activeSection) ?? navItems[0]

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/95 text-slate-100 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-3 px-2 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="shrink-0 text-sm font-black uppercase tracking-[0.16em] text-[#ff8fcb]"
          onClick={() => setIsOpen(false)}
        >
          RX2 Mission Control
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.section}
              href={item.href(currentDay)}
              label={item.label}
              active={item.section === activeSection}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-white lg:hidden"
          aria-expanded={isOpen}
          aria-label="Toggle navigation menu"
        >
          <span>{activeItem.label}</span>
          <span className="text-[#ff8fcb]">{isOpen ? 'Close' : 'Menu'}</span>
        </button>
      </div>

      {isOpen ? (
        <div className="grid gap-1 border-t border-white/10 bg-slate-950 px-2 py-2 lg:hidden">
          {navItems.map((item) => (
            <Link
              key={item.section}
              href={item.href(currentDay)}
              onClick={() => setIsOpen(false)}
              className={`rounded-md px-3 py-2 text-sm font-bold transition ${
                item.section === activeSection
                  ? 'border border-[#ff3ea5]/35 bg-[#ff3ea5]/15 text-[#ff8fcb]'
                  : 'border border-transparent text-slate-200 hover:border-white/10 hover:bg-white/5'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </nav>
  )
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-bold transition ${
        active
          ? 'border border-[#ff3ea5]/35 bg-[#ff3ea5]/15 text-[#ff8fcb]'
          : 'border border-transparent text-slate-200 hover:border-white/10 hover:bg-white/5'
      }`}
    >
      {label}
    </Link>
  )
}

function dayFromPath(pathname: string) {
  const match = pathname.match(/^\/day\/(\d+)/)

  if (!match) return 1

  const day = Number(match[1])

  return Number.isFinite(day) ? Math.min(5, Math.max(1, day)) : 1
}

function sectionFromRoute(
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>
): NavSection {
  if (pathname === '/') return 'overview'

  const view = searchParams.get('view')

  if (
    view === 'race-day' ||
    view === 'mission-control' ||
    view === 'telemetry' ||
    view === 'setup' ||
    view === 'reports'
  ) {
    return view
  }

  return pathname.startsWith('/day/') ? 'mission-control' : 'overview'
}
