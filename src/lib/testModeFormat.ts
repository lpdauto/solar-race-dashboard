// Shared formatting/export helpers for the Test Mode page and its
// components. Kept framework-agnostic (no React) so both server- and
// client-side code paths can import from here without pulling in JSX.

export function formatNumber(value: unknown, suffix: string, digits = 0) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(digits)}${suffix}`
    : '--'
}

/** mm:ss (minutes not zero-padded, e.g. "5:07"). */
export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** hh:mm:ss, all zero-padded. */
export function formatClockDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatDate(date: Date) {
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleDateString()
}

export function formatTime(date: Date) {
  return Number.isNaN(date.getTime())
    ? '--'
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function nullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function nullableBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

export function downloadTextFile({
  filename,
  mimeType,
  content,
}: {
  filename: string
  mimeType: string
  content: string
}) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function csvCell(value: unknown) {
  if (value === undefined || value === null) return ''
  const text = String(value)

  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function fileSafeName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '') || 'rx2test'
  )
}

export function fileTimestamp(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'unknown-time'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}_${hours}${minutes}`
}
