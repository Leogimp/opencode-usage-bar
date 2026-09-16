/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { findApiKey, getUsage, loadHiddenPref, saveHiddenPref, type GoUsage } from "./usage"
import { renderBar, renderCompactBar } from "./bar"
import { UsageOverlay } from "./dialog"

const PLUGIN_ID = "opencode-usage-bar"
const POLL_MS = 60_000

const [usage, setUsage] = createSignal<GoUsage | null>(null)
const [failed, setFailed] = createSignal(false)
const [overlayOpen, setOverlayOpen] = createSignal(false)
const [barHidden, setBarHidden] = createSignal(loadHiddenPref())
let apiKey: string | null = null
let polling = false
let savedFocus: any = null

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

type Options = {
  left_reserve?: number
  sidebar_width?: number
  padding?: number
}

const SIDEBAR_WIDE_MIN = 120

function openUsage(api: any): void {
  savedFocus = api.renderer.currentFocusedRenderable ?? null
  savedFocus?.blur?.()
  setOverlayOpen(true)
}

function closeUsage(): void {
  setOverlayOpen(false)
  setTimeout(() => {
    if (savedFocus && !savedFocus.isDestroyed) savedFocus.focus()
    savedFocus = null
  }, 1)
}

function Sidebar(props: { api: any; opts: Options }) {
  const dims = useTerminalDimensions()
  const line = createMemo<string | null>(() => {
    if (barHidden()) return null
    const rolling = usage()?.rolling
    const termWidth = dims().width
    const opts = props.opts
    const sidebarWidth = opts.sidebar_width ?? 42
    const sidebarMode = (props.api.tuiConfig?.sidebar ?? "auto") as string | boolean
    const sidebarVisible =
      sidebarWidth > 0 && (sidebarMode === true || (sidebarMode !== false && termWidth > SIDEBAR_WIDE_MIN))
    const padding = opts.padding ?? 6
    const avail = termWidth - (sidebarVisible ? sidebarWidth : 0) - 4 - padding
    const free = avail - (opts.left_reserve ?? 44)
    if (!rolling) {
      if (!failed()) return null
      const fallback = "5h (unavailable)"
      return fallback.length <= free ? fallback : null
    }
    const full = renderBar(rolling.label, rolling.percentUsed, rolling.resetsAtMs)
    if (full.length <= free) return full
    const compact = renderCompactBar(rolling.label, rolling.percentUsed)
    if (compact.length <= free) return compact
    return null
  })
  return (
    <Show when={line()}>
      {(text) => <text fg={props.api.theme.current.text}>{text()}</text>}
    </Show>
  )
}

const tui = async (api: any, options?: Options) => {
  apiKey = await findApiKey()
  if (!apiKey) return

  const timer = setInterval(poll, POLL_MS)
  api.lifecycle.onDispose(() => clearInterval(timer))
  poll()

  api.keymap.intercept("key", (ctx: any) => {
    if (!overlayOpen()) return
    if (ctx.event?.name === "escape") {
      ctx.consume({ preventDefault: true, stopPropagation: true })
      closeUsage()
    }
  }, { priority: 1 })

  api.slots.register({
    order: 100,
    slots: {
      session_prompt_right() {
        return <Sidebar api={api} opts={options ?? {}} />
      },
      app() {
        return (
          <UsageOverlay
            api={api}
            apiKey={apiKey!}
            open={overlayOpen}
            onClose={closeUsage}
            hidden={barHidden}
            onToggle={() => {
              const next = !barHidden()
              setBarHidden(next)
              saveHiddenPref(next)
            }}
          />
        )
      },
    },
  })

  api.command?.register(() => [
    {
      title: "Usage limits",
      description: "OpenCode Go - 5h / weekly / monthly usage",
      value: "usage-bar.usage",
      category: "Plugin",
      slash: { name: "limit" },
      onSelect() {
        openUsage(api)
      },
    },
  ])
}

export default {
  id: PLUGIN_ID,
  tui,
}
