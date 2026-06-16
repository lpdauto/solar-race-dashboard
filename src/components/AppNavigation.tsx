'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

type NavSection =
  | 'overview'
  | 'day-1'
  | 'day-2'
  | 'day-3'
  | 'day-4'
  | 'day-5'

const navItems: Array<{
  section: NavSection
  label: string
  href: string
}> = [
  { section: 'overview', label: 'Overview', href: '/' },
  { section: 'day-1', label: 'Day 1', href: '/day/1/race-captain' },
  { section: 'day-2', label: 'Day 2', href: '/day/2/race-captain' },
  { section: 'day-3', label: 'Day 3', href: '/day/3/race-captain' },
  { section: 'day-4', label: 'Day 4', href: '/day/4/race-captain' },
  { section: 'day-5', label: 'Day 5', href: '/day/5/race-captain' },
]

export default function AppNavigation() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  if (pathname === '/race-tracker' || pathname.startsWith('/race-tracker/')) {
    return null
  }

  const activeSection = sectionFromRoute(pathname)
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
              href={item.href}
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
              href={item.href}
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

function sectionFromRoute(pathname: string): NavSection {
  if (pathname === '/') return 'overview'

  const day = dayFromPath(pathname)

  return pathname.startsWith('/day/') ? (`day-${day}` as NavSection) : 'overview'
}

function dayFromPath(pathname: string) {
  const match = pathname.match(/^\/day\/(\d+)/)

  if (!match) return 1

  const day = Number(match[1])

  return Number.isFinite(day) ? Math.min(5, Math.max(1, day)) : 1
}
