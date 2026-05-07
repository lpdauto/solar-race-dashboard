'use client'

type TelemetryGaugeProps = {
  label: string
  value: number | null | undefined
  unit: string
  min: number
  max: number
  warningThreshold?: number
  dangerThreshold?: number
  precision?: number
}

export default function TelemetryGauge({
  label,
  value,
  unit,
  min,
  max,
  warningThreshold,
  dangerThreshold,
  precision = 0,
}: TelemetryGaugeProps) {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : null
  const percent =
    safeValue === null
      ? 0
      : Math.min(100, Math.max(0, ((safeValue - min) / (max - min)) * 100))
  const statusColor = gaugeColor(safeValue, warningThreshold, dangerThreshold)

  return (
    <article className="rounded-lg border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <div className="mt-3 flex items-end gap-2">
        <p className="text-3xl font-black text-white">
          {safeValue === null ? '--' : safeValue.toFixed(precision)}
        </p>
        <p className="pb-1 text-sm font-semibold text-slate-400">{unit}</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${statusColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </article>
  )
}

function gaugeColor(
  value: number | null,
  warningThreshold?: number,
  dangerThreshold?: number
) {
  if (value === null) return 'bg-slate-600'
  if (dangerThreshold !== undefined && value >= dangerThreshold) return 'bg-red-400'
  if (warningThreshold !== undefined && value >= warningThreshold) return 'bg-yellow-300'
  return 'bg-[#ff3ea5]'
}


