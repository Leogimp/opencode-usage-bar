import type { GoWindow } from "./usage"

export function formatPercent(percentUsed: number): string {
  return `${percentUsed.toFixed(1)}%`
}

export function formatReset(resetsAtMs: number | null, now: number = Date.now()): string {
  if (resetsAtMs === null) return ""
  let seconds = Math.max(0, Math.round((resetsAtMs - now) / 1000))
  const days = Math.floor(seconds / 86400)
  seconds %= 86400
  const hours = Math.floor(seconds / 3600)
  seconds %= 3600
  const minutes = Math.floor(seconds / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function renderBar(
  label: string,
  percentUsed: number,
  resetsAtMs: number | null,
  width: number = 20,
  now: number = Date.now(),
): string {
  const clamped = Math.max(0, Math.min(100, percentUsed))
  const filled = Math.round((clamped / 100) * width)
  const bar = "\u2593".repeat(filled) + "\u2591".repeat(width - filled)
  const reset = formatReset(resetsAtMs, now)
  const tail = reset ? ` (resets ${reset})` : ""
  return `${label} ${bar} ${formatPercent(clamped)}${tail}`
}

export function renderWindowBar(win: GoWindow, width: number = 20, now: number = Date.now()): string {
  return renderBar(win.label, win.percentUsed, win.resetsAtMs, width, now)
}

export function renderCompactBar(label: string, percentUsed: number, width: number = 8): string {
  const clamped = Math.max(0, Math.min(100, percentUsed))
  const filled = Math.round((clamped / 100) * width)
  const bar = "\u2593".repeat(filled) + "\u2591".repeat(width - filled)
  return `${label} ${bar} ${formatPercent(clamped)}`
}
