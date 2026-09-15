/** @jsxImportSource @opentui/solid */
import { createSignal } from "solid-js"
import { findApiKey, getUsage, type GoUsage } from "./usage"
import { renderBar } from "./bar"

const PLUGIN_ID = "opencode-usage-bar"
const POLL_MS = 60_000

const [usage, setUsage] = createSignal<GoUsage | null>(null)
const [failed, setFailed] = createSignal(false)
let apiKey: string | null = null
let polling = false

async function poll(): Promise<void> {
  if (!apiKey || polling) return
  polling = true
  try {
    const data = await getUsage(apiKey)
    setUsage(data)
    setFailed(false)
  } catch {
    setFailed(true)
  } finally {
    polling = false
  }
}

function BarText(api: any) {
  const rolling = usage()?.rolling
  if (failed() && !rolling) {
    return <text fg={api.theme.current.warning}>5h (unavailable)</text>
  }
  if (!rolling) return null
  return <text fg={api.theme.current.text}>{renderBar(rolling.label, rolling.percentUsed, rolling.resetsAtMs)}</text>
}

const tui = async (api: any) => {
  apiKey = await findApiKey()
  if (!apiKey) return

  const timer = setInterval(poll, POLL_MS)
  api.lifecycle.onDispose(() => clearInterval(timer))
  poll()

  api.slots.register({
    order: 100,
    slots: {
      session_prompt_right() {
        return BarText(api)
      },
    },
  })
}

export default {
  id: PLUGIN_ID,
  tui,
}
