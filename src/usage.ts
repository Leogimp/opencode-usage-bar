import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export type GoWindow = {
  label: string
  percentUsed: number
  resetsAtMs: number | null
}

export type GoUsage = {
  rolling: GoWindow | null
  weekly: GoWindow | null
  monthly: GoWindow | null
}

const USAGE_URL = "https://opencode.ai/zen/go/v1/usage"

export async function findApiKey(): Promise<string | null> {
  const env = process.env.OPENCODE_GO_API_KEY
  if (typeof env === "string" && env.trim()) return env.trim()
  try {
    const authPath = join(homedir(), ".local", "share", "opencode", "auth.json")
    if (!existsSync(authPath)) return null
    const auth = JSON.parse(readFileSync(authPath, "utf8"))
    const entry = auth?.["opencode-go"]
    if (typeof entry?.key === "string" && entry.key.trim()) return entry.key.trim()
  } catch {
    return null
  }
  return null
}

function firstNumber(value: unknown, keys: string[]): number | null {
  const obj = value as Record<string, unknown>
  for (const key of keys) {
    const v = obj?.[key]
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  }
  return null
}

function toMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e12 ? value : value * 1000
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function statePath(): string {
  return join(homedir(), ".config", "opencode", "usage-bar.json")
}

function normalizeWindow(label: string, raw: unknown): GoWindow | null {
  if (!raw || typeof raw !== "object") return null
  const percent = firstNumber(raw, ["percent", "usagePercent", "usage_percent", "usedPercent"])
  if (percent === null) return null
  const resetsAtMs = toMs((raw as Record<string, unknown>).resetsAt)
  return { label, percentUsed: percent, resetsAtMs }
}

export async function fetchGoUsage(apiKey: string): Promise<GoUsage> {
  const res = await fetch(USAGE_URL, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  })
  if (!res.ok) throw new Error(`usage request failed: HTTP ${res.status}`)
  const body = await res.json()
  const usage = (body as Record<string, unknown>)?.usage ?? body
  return {
    rolling: normalizeWindow("5h", (usage as Record<string, unknown>)?.rolling),
    weekly: normalizeWindow("weekly", (usage as Record<string, unknown>)?.weekly),
    monthly: normalizeWindow("monthly", (usage as Record<string, unknown>)?.monthly),
  }
}

const CACHE_TTL_MS = 60_000

export function loadHiddenPref(): boolean {
  try {
    const state = JSON.parse(readFileSync(statePath(), "utf8"))
    return state?.hideSessionBar === true
  } catch {
    return false
  }
}

export function saveHiddenPref(hidden: boolean): void {
  try {
    const path = statePath()
    let state: Record<string, unknown> = {}
    try {
      state = JSON.parse(readFileSync(path, "utf8")) ?? {}
    } catch {}
    state.hideSessionBar = hidden
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(state, null, 2))
  } catch {}
}

let cache: { at: number; data: GoUsage } | null = null
let inFlight: Promise<GoUsage> | null = null

export async function getUsage(apiKey: string, force = false): Promise<GoUsage> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data
  if (inFlight) return inFlight
  inFlight = fetchGoUsage(apiKey)
    .then((data) => {
      cache = { at: Date.now(), data }
      return data
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}
