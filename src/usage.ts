import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

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

type SqliteHandle = {
  query(sql: string, params: unknown[]): Record<string, unknown> | undefined
  close(): void
}

type BunDatabase = {
  prepare(sql: string): { get(...params: unknown[]): unknown }
  close(): void
}

async function openDatabase(path: string): Promise<SqliteHandle | null> {
  const dynImport = (name: string) => import(/* runtime-resolved */ name)
  // Host is Bun-compiled (opencode binary): bun:sqlite is always available there.
  if (globalThis.Bun) {
    try {
      const { Database } = (await dynImport("bun:sqlite")) as unknown as {
        Database: new (path: string, options: { readonly: true }) => BunDatabase
      }
      const db = new Database(path, { readonly: true })
      return {
        query: (sql, params) => db.prepare(sql).get(...params) as Record<string, unknown> | undefined,
        close: () => db.close(),
      }
    } catch {
      // fall through to node:sqlite
    }
  }
  try {
    const { DatabaseSync } = (await dynImport("node:sqlite")) as unknown as {
      DatabaseSync: new (path: string, options: { readOnly: true }) => BunDatabase
    }
    const db = new DatabaseSync(path, { readOnly: true })
    return {
      query: (sql, params) => db.prepare(sql).get(...params) as Record<string, unknown> | undefined,
      close: () => db.close(),
    }
  } catch {
    return null
  }
}

function opencodeDbPath(): string | null {
  const dataHome = process.env.XDG_DATA_HOME?.trim() || null
  const base = dataHome ? dataHome : join(homedir(), ".local", "share")
  return join(base, "opencode", "opencode.db")
}

/**
 * OpenCode V2 keeps provider credentials in its sqlite store with an `active`
 * flag - when several accounts are connected for one integration (e.g. two
 * OpenCode Go subscriptions), the ACTIVE credential's key is what every model
 * request uses. `auth.json` is only mirrored for backwards compatibility and
 * often retains the first key ever saved, so it must not decide "which account
 * is in use" when a credential store is present.
 */
async function findActiveCredentialKey(): Promise<string | null> {
  const dbPath = opencodeDbPath()
  if (!dbPath || !existsSync(dbPath)) return null
  const handle = await openDatabase(dbPath)
  if (!handle) return null
  try {
    const row = handle.query(
      "SELECT value FROM credential WHERE integration_id = ? AND active = 1 LIMIT 1",
      ["opencode-go"],
    )
    const raw = row?.["value"]
    if (typeof raw !== "string") return null
    const parsed = JSON.parse(raw) as { type?: string; key?: string }
    if (parsed?.type !== "key" || typeof parsed.key !== "string" || !parsed.key.trim()) return null
    return parsed.key.trim()
  } catch {
    return null
  } finally {
    try {
      handle.close()
    } catch {}
  }
}

function findAuthJsonKey(): string | null {
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

/** Resolution order: explicit env override > active credential store entry > legacy auth.json. */
export async function findApiKey(): Promise<string | null> {
  const env = process.env.OPENCODE_GO_API_KEY
  if (typeof env === "string" && env.trim()) return env.trim()
  const active = await findActiveCredentialKey()
  if (active) return active
  return findAuthJsonKey()
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

let cache: { key: string; at: number; data: GoUsage } | null = null
let inFlight: { key: string; promise: Promise<GoUsage> } | null = null

export async function getUsage(apiKey: string, force = false): Promise<GoUsage> {
  if (!force && cache && cache.key === apiKey && Date.now() - cache.at < CACHE_TTL_MS) return cache.data
  if (!force && inFlight && inFlight.key === apiKey) return inFlight.promise
  const promise = fetchGoUsage(apiKey)
    .then((data) => {
      cache = { key: apiKey, at: Date.now(), data }
      return data
    })
    .finally(() => {
      if (inFlight?.key === apiKey) inFlight = null
    })
  inFlight = { key: apiKey, promise }
  return promise
}
