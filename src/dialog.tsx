/** @jsxImportSource @opentui/solid */
import { createSignal, For, onCleanup, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { getUsage, type GoUsage, type GoWindow } from "./usage"
import { formatReset, barOnly } from "./bar"

const BAR_WIDTH = 24
const LABEL_WIDTH = 9
const PANEL_WIDTH = 60
const TICK_MS = 30_000

export function UsagePanel(props: {
  api: any
  apiKey: string
  hidden: () => boolean
  onToggle: () => void
}) {
  const theme = props.api.theme.current
  const [usage, setUsage] = createSignal<GoUsage | null>(null)
  const [failed, setFailed] = createSignal<string | null>(null)
  const [tick, setTick] = createSignal(0)
  const toggleHidden = (e: any) => {
    e.stopPropagation()
    props.onToggle()
  }
  const tickTimer = setInterval(() => setTick((t) => t + 1), TICK_MS)
  onCleanup(() => clearInterval(tickTimer))

  getUsage(props.apiKey, true)
    .then((data) => setUsage(data))
    .catch((error) => setFailed(String(error?.message ?? error)))

  const windows = () => {
    const u = usage()
    if (!u) return []
    return [u.rolling, u.weekly, u.monthly].filter((w): w is GoWindow => w !== null)
  }

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingBottom={1}>
      <box paddingBottom={1}>
        <text fg={theme.text}>OpenCode Go usage</text>
      </box>
      <Show when={failed()}>
        <text fg={theme.error}>{failed()}</text>
      </Show>
      <Show when={!usage() && !failed()}>
        <text fg={theme.textMuted}>Loading…</text>
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
                <text fg={theme.text}>{win.label.padEnd(LABEL_WIDTH)}</text>
                <text fg={theme.text}>{body()}</text>
                <Show when={reset()}>
                  <text fg={theme.textMuted}>{`  resets ${reset()}`}</text>
                </Show>
              </box>
            )
          }}
        </For>
      </box>
      <box paddingTop={1} flexDirection="row" onMouseUp={toggleHidden}>
        <text fg={theme.textMuted}>{`[ ${props.hidden() ? "show" : "hide"} usage bar ]`}</text>
      </box>
      <box paddingTop={1}>
        <text fg={theme.textMuted}>esc close · refreshes every 60s</text>
      </box>
    </box>
  )
}

export function UsageOverlay(props: {
  api: any
  apiKey: string
  open: () => boolean
  onClose: () => void
  hidden: () => boolean
  onToggle: () => void
}) {
  const dims = useTerminalDimensions()
  return (
    <Show when={props.open()}>
      <box
        position="absolute"
        left={0}
        top={0}
        width={dims().width}
        height={dims().height}
        alignItems="center"
        paddingTop={Math.floor(dims().height / 4)}
        zIndex={2500}
        onMouseUp={() => props.onClose()}
      >
        <box
          width={PANEL_WIDTH}
          maxWidth={dims().width - 2}
          backgroundColor={props.api.theme.current.backgroundPanel}
          paddingTop={1}
          onMouseUp={(e: any) => e.stopPropagation()}
        >
          <UsagePanel api={props.api} apiKey={props.apiKey} hidden={props.hidden} onToggle={props.onToggle} />
        </box>
      </box>
    </Show>
  )
}
