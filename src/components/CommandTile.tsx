'use client'

import type { WeatherRisk } from '@/types/weather'

export type CommandTileRisk = WeatherRisk | 'neutral'

type CommandTileProps = {
  id: string
  title: string
  mainValue: string
  mainUnit?: string
  supportingItems: Array<{
    label: string
    value: string
  }>
  statusLabel: string
  riskLevel: CommandTileRisk
  actionText: string
  isActive: boolean
  onClick: (id: string) => void
}

const riskStyles: Record<CommandTileRisk, string> = {
  low: 'border-t-emerald-400',
  medium: 'border-t-yellow-300',
  high: 'border-t-orange-400',
  severe: 'border-t-red-400',
  neutral: 'border-t-slate-500',
}

const badgeStyles: Record<CommandTileRisk, string> = {
  low: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100',
  high: 'border-orange-400/40 bg-orange-400/10 text-orange-100',
  severe: 'border-red-400/40 bg-red-400/10 text-[#ff8fcb]',
  neutral: 'border-slate-300/30 bg-slate-300/10 text-slate-200',
}

export default function CommandTile({
  id,
  title,
  mainValue,
  mainUnit,
  supportingItems,
  statusLabel,
  riskLevel,
  actionText,
  isActive,
  onClick,
}: CommandTileProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={`min-h-48 rounded-lg border border-t-4 border-white/10 bg-white/[0.045] p-4 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-[#ff3ea5]/40 hover:bg-white/[0.07] ${riskStyles[riskLevel]} ${
        isActive ? 'ring-2 ring-[#ff3ea5]/50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-bold text-white">{title}</h3>
        <span
          className={`rounded border px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${badgeStyles[riskLevel]}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 flex items-end gap-2">
        <p className="text-4xl font-black text-white">{mainValue}</p>
        {mainUnit ? (
          <p className="pb-1 text-sm font-semibold text-slate-400">
            {mainUnit}
          </p>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-2">
        {supportingItems.slice(0, 3).map((item) => (
          <div
            key={`${item.label}-${item.value}`}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <dt className="text-slate-400">{item.label}</dt>
            <dd className="font-semibold text-slate-100">{item.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-300">
        {actionText}
      </p>
    </button>
  )
}


