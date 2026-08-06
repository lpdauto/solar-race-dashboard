export function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#ff3ea5]/25 bg-black/35 p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff8fcb]">
        {label}
      </p>
      <p className="mt-1 break-words text-lg font-black text-white">{value}</p>
    </div>
  )
}
