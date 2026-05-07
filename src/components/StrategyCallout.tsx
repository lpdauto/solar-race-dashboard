'use client'

import type { ReactNode } from 'react'

export type StrategyCalloutType =
  | 'climb'
  | 'descent'
  | 'caution'
  | 'stop'
  | 'energy'
  | 'wind'
  | 'town'

type StrategyCalloutProps = {
  type: StrategyCalloutType
  title?: string
  children: ReactNode
}

const calloutStyles: Record<
  StrategyCalloutType,
  {
    label: string
    icon: string
    className: string
  }
> = {
  climb: {
    label: 'Climb',
    icon: 'UP',
    className: 'border-orange-400/35 bg-orange-400/10 text-orange-100',
  },
  descent: {
    label: 'Descent',
    icon: 'DN',
    className: 'border-sky-300/35 bg-sky-300/10 text-sky-100',
  },
  caution: {
    label: 'Caution',
    icon: '!',
    className: 'border-yellow-300/35 bg-yellow-300/10 text-yellow-100',
  },
  stop: {
    label: 'Stop',
    icon: 'ST',
    className: 'border-slate-300/35 bg-slate-300/10 text-slate-100',
  },
  energy: {
    label: 'Energy',
    icon: 'Wh',
    className: 'border-[#ff3ea5]/35 bg-[#ff3ea5]/10 text-[#ff8fcb]',
  },
  wind: {
    label: 'Wind',
    icon: 'W',
    className: 'border-[#ff3ea5]/35 bg-[#ff3ea5]/10 text-[#ff8fcb]',
  },
  town: {
    label: 'Town',
    icon: 'T',
    className: 'border-violet-300/35 bg-violet-300/10 text-violet-100',
  },
}

export default function StrategyCallout({
  type,
  title,
  children,
}: StrategyCalloutProps) {
  const style = calloutStyles[type]

  return (
    <article className={`rounded-lg border p-4 ${style.className}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-current/30 bg-black/20 text-xs font-black">
          {style.icon}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-80">
            {style.label}
          </p>
          {title ? (
            <h3 className="mt-1 text-base font-bold text-white">{title}</h3>
          ) : null}
          <div className="mt-2 text-sm leading-6">{children}</div>
        </div>
      </div>
    </article>
  )
}


