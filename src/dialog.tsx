/** @jsxImportSource @opentui/solid */
import { createSignal, For, onCleanup, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/tui"
import { getUsage, type GoUsage, type GoWindow } from "./usage"
import { formatReset, barOnly } from "./bar"

const BAR_WIDTH = 24
const LABEL_WIDTH = 9
const TICK_MS = 30_000

export function UsagePanel(props: {
  apiKey: string
  keyHint: string
  hidden: () => boolean
  onToggle: () => void
}) {
  const ctx = usePlugin()
  const theme = ctx.theme
  const [usage, setUsage] = createSignal<GoUsage | null>(null)
  const [failed, setFailed] = createSignal<string | null>(null)
  const [tick, setTick] = createSignal(0)
  const tickTimer = setInterval(() => setTick((t) => t + 1), TICK_MS)
  onCleanup(() => clearInterval(tickTimer))

  // Component-owned layer: disposed automatically when the dialog unmounts.
  ctx.keymap.layer(() => ({
    mode: "global",
    priority: 1,
    commands: [
      {
        bind: "escape",
        run: () => {
          ctx.ui.dialog.clear()
        },
      },
    ],
  }))

  getUsage(props.apiKey, true)
    .then((data) => setUsage(data))
    .catch((error: any) => setFailed(String(error?.message ?? error)))

  const windows = () => {
    const u = usage()
    if (!u) return []
    return [u.rolling, u.weekly, u.monthly].filter((w): w is GoWindow => w !== null)
  }

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingBottom={1}>
      <box paddingBottom={1}>
        <text fg={theme.text.base}>OpenCode Go usage</text>
      </box>
      <Show when={failed()}>
        <text fg={theme.text.feedback.error.base}>{failed()}</text>
      </Show>
      <Show when={!usage() && !failed()}>
        <text fg={theme.text.muted}>Loading…</text>
      </Show>
      <box flexDirection="column" gap={1}>
        <For each={windows()}>
          {(win) => {
            const body = () => {
              tick()
              return barOnly(win.percentUsed, BAR_WIDTH)
            }
            const reset = () => {
              tick()
              return formatReset(win.resetsAtMs)
            }
            return (
              <box flexDirection="row" height={1}>
                <text fg={theme.text.base}>{win.label.padEnd(LABEL_WIDTH)}</text>
                <text fg={theme.text.base}>{body()}</text>
                <Show when={reset()}>
                  <text fg={theme.text.muted}>{`  resets ${reset()}`}</text>
                </Show>
              </box>
            )
          }}
        </For>
      </box>
      <box paddingTop={1} flexDirection="row" onMouseUp={() => props.onToggle()}>
        <text fg={theme.text.muted}>{`[ ${props.hidden() ? "show" : "hide"} usage bar ]`}</text>
      </box>
      <box paddingTop={1}>
        <text fg={theme.text.muted}>esc close · active key ····{props.keyHint} · refreshes every 60s</text>
      </box>
    </box>
  )
}
