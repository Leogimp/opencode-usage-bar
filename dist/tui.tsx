/** @jsxImportSource @opentui/solid */
import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createMemo, createSignal, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { Plugin, usePlugin } from "@opencode/plugin/tui"
import type { Context, SlotMap } from "@opencode/plugin/tui/context"
import { findApiKey, getUsage, type GoUsage } from "./usage"
import { renderBar, renderCompactBar } from "./bar"
import { UsagePanel } from "./dialog"

const POLL_MS = 60_000
const SIDEBAR_WIDE_MIN = 120

type Options = {
  left_reserve?: number
  sidebar_width?: number
  padding?: number
}

function Sidebar(props: {
  opts: Options
  hidden: () => boolean
  usage: () => GoUsage | null
  failed: () => boolean
}) {
  const ctx = usePlugin()
  const dims = useTerminalDimensions()
  const line = createMemo<string | null>(() => {
    if (props.hidden()) return null
    const rolling = props.usage()?.rolling
    const termWidth = dims().width
    const opts = props.opts
    const sidebarWidth = opts.sidebar_width ?? 42
    // V2 has no way to read the host's session.sidebar setting; assume "auto"
    // and let users who keep the sidebar hidden set sidebar_width: 0.
    const sidebarVisible =
      sidebarWidth > 0 && termWidth > SIDEBAR_WIDE_MIN
    const padding = opts.padding ?? 6
    const avail = termWidth - (sidebarVisible ? sidebarWidth : 0) - 4 - padding
    const free = avail - (opts.left_reserve ?? 44)
    if (!rolling) {
      if (!props.failed()) return null
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
      {(text) => <text fg={ctx.theme.text.base}>{text()}</text>}
    </Show>
  )
}

/** One-time migration of the pre-V2 hide preference file into plugin storage. */
function migrateLegacyPref(update: (mutation: (draft: { hideSessionBar: boolean }) => void) => Promise<void>) {
  try {
    const path = join(homedir(), ".config", "opencode", "usage-bar.json")
    if (!existsSync(path)) return
    const state = JSON.parse(readFileSync(path, "utf8"))
    if (state?.hideSessionBar === true) void update((draft: { hideSessionBar: boolean }) => { draft.hideSessionBar = true })
    unlinkSync(path)
  } catch {}
}

export default Plugin.define({
  id: "opencode-usage-bar",
  async setup(ctx: Context) {
    const apiKey = await findApiKey()
    if (!apiKey) return

    const opts = (ctx.options ?? {}) as Options
    const [settings, updateSettings] = ctx.storage.store("settings", {
      initial: { hideSessionBar: false },
    })
    migrateLegacyPref(updateSettings)

    const [usage, setUsage] = createSignal<GoUsage | null>(null)
    const [failed, setFailed] = createSignal(false)
    let polling = false

    async function poll(): Promise<void> {
      if (polling) return
      polling = true
      try {
        const data = await getUsage(apiKey!)
        setUsage(data)
        setFailed(false)
      } catch {
        setFailed(true)
      } finally {
        polling = false
      }
    }

    const timer = setInterval(poll, POLL_MS)
    void poll()

    function openLimits() {
      ctx.ui.dialog.set({ size: "large", centered: true })
      ctx.ui.dialog.show(
        () => (
          <UsagePanel
            apiKey={apiKey!}
            hidden={() => settings.hideSessionBar}
            onToggle={() => {
              void updateSettings((draft) => {
                draft.hideSessionBar = !draft.hideSessionBar
              })
            }}
          />
        ),
      )
    }

    // Session prompt footer: the usage bar next to the prompt hints.
    ctx.ui.slot({
      append: "prompt.footer.status",
      render: (input: SlotMap["prompt.footer.status"]) => (
        <Show when={input.sessionID}>
          <Sidebar
            opts={opts}
            hidden={() => settings.hideSessionBar}
            usage={usage}
            failed={failed}
          />
        </Show>
      ),
    })

    // Global command layer for the /limit popup. Mounted through the app slot
    // so the layer is owned by a long-lived component.
    ctx.ui.slot({
      append: "app",
      render: () => {
        ctx.keymap.layer(() => ({
          mode: "global",
          priority: 100,
          commands: [
            {
              id: "usage-bar.usage",
              title: "Usage limits",
              description: "OpenCode Go - 5h / weekly / monthly usage",
              group: "Usage",
              palette: true,
              slash: { name: "limit" },
              run: openLimits,
            },
          ],
        }))
        return null
      },
    })

    return () => clearInterval(timer)
  },
})
