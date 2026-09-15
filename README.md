# opencode-usage-bar

[OpenCode Go](https://opencode.ai/docs/go/) subscription usage bars for the [opencode](https://opencode.ai) TUI.

Shows how much of your Go plan quota you've used and how long until it resets — a persistent bar next to the prompt in sessions, and a `/limit` popup with all three windows. No LLM prompts are ever sent; the plugin talks directly to the official usage API.

```
Build · GLM-5.3-Flash OpenCode Go · high          5h ▓▓░░░░░░░░░░░░░░░░░░ 11.0% (resets 4h 10m)
```

## Features

### Session usage bar

A full usage bar rendered on the right side of the prompt hint row (the same row as
`agent · model · provider · effort`), inside active sessions:

```
5h ▓▓▓▓░░░░░░░░░░░░░░░░ 11.0% (resets 4h 10m)
```

- Percent **used**, one decimal (`xx.x%`), 20-character `▓/░` bar, reset countdown (`4h 10m`, `3d 4h`, …)
- Refreshes automatically every **60 seconds** (with in-flight request deduplication and a 60s response cache)
- **Adaptive sizing** — mirrors opencode's own session layout (sidebar width, prompt padding) and
  terminal size, re-evaluated live on window resize:
  | Space available | Display |
  |---|---|
  | Plenty | full bar + percent + reset timer (44 chars) |
  | Tight | compact form `5h ▓▓░░░░░░ 11.0%` (no timer) |
  | Not enough | hidden — it never wraps or overlaps the prompt hints |
- Not shown on the home screen or fresh-session screen — only once you are inside a session
- If the usage request fails, shows a dimmed `5h (unavailable)` instead of silently disappearing

### `/limit` command

Type `/limit` (or open the command palette with `ctrl+p` → *Usage limits*) to get a popup with
all three OpenCode Go windows in the same style:

```
OpenCode Go usage

5h       ▓▓░░░░░░░░░░░░░░░░░░░░░░ 11.0%  resets 4h 10m

weekly   ▓▓░░░░░░░░░░░░░░░░░░░░░░ 9.0%   resets 5d 3h

monthly  ▓▓░░░░░░░░░░░░░░░░░░░░░░ 4.0%   resets 27d 13h

esc close · refreshes every 60s
```

- Fetches **fresh** data every time it opens (bypasses the 60s cache)
- Reset timers keep ticking while the popup is open (30s tick)
- Floating panel with no background dimming — the session stays visible behind it
- Close with `esc` or a mouse click outside the panel; prompt focus is restored

### Data source

Reads the official OpenCode Go quota endpoint:

```
GET https://opencode.ai/zen/go/v1/usage
Authorization: Bearer <opencode-go key>
```

returning the rolling (5h), weekly, and monthly windows with percent used and reset times.
The plugin is read-only — it never sends prompts, session data, or anything else to the LLM.

## Install

The plugin needs an OpenCode Go subscription key connected in opencode
(`/connect` → opencode-go, or set `OPENCODE_GO_API_KEY`).

### From a local checkout

Add the absolute path to the plugin folder in `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["C:\\path\\to\\opencode-usage-bar"]
}
```

Then quit and restart opencode — TUI config is only read at startup.

> Note: TUI plugins referenced by npm package spec currently fail to render in opencode
> 1.17+ (upstream issue [#33884](https://github.com/anomalyco/opencode/issues/33884)),
> so use a local path or `file://` URL for now.

### Install globally (recommended)

```sh
npm install -g opencode-usage-bar
```

Works on Windows, macOS, and Linux. The package's postinstall script:

1. copies the plugin outside `node_modules` to `~/.config/opencode/usage-bar/`
   (working around the npm-spec TUI loading bug below),
2. vendors the runtime dependencies (`solid-js`, `@opentui/solid`) next to that copy,
   so no network access is needed afterwards,
3. patches `~/.config/opencode/tui.json` (or `tui.jsonc`) with the absolute plugin path —
   replacing any previous `usage-bar` entry, preserving other plugins.

Then quit and restart opencode — TUI config is only read at startup.

> npm 11+ gates install scripts by default. If the postinstall was skipped
> ("install scripts not yet covered by allowScripts"), either run
> `npm install -g opencode-usage-bar --allow-scripts=opencode-usage-bar`
> once, or run the bin manually (see below).

To re-run the installer manually (e.g. after `--ignore-scripts` installs, or under pnpm's
build-script prompt):

```sh
opencode-usage-bar        # bin installed by the package
# or: npx opencode-usage-bar
```

To uninstall, remove the entry from `~/.config/opencode/tui.json` and delete
`~/.config/opencode/usage-bar/`.

> Note: TUI plugins referenced by npm package spec in `tui.json` currently fail to render
> in opencode 1.17+ (upstream issue
> [#33884](https://github.com/anomalyco/opencode/issues/33884)) — that is why this package
> installs a file-path copy instead of using `"plugin": ["opencode-usage-bar"]` directly.

## Options

Options are passed as the second element of the plugin tuple in `tui.json`:

```json
{
  "plugin": [
    ["C:\\path\\to\\opencode-usage-bar", { "left_reserve": 44 }]
  ]
}
```

| Option | Default | Description |
|---|---|---|
| `left_reserve` | `44` | Columns reserved for the left prompt hints (`agent · model · provider · effort`). Increase if your hints are longer and the bar hides too late; decrease to show the bar in tighter windows. |
| `sidebar_width` | `42` | Columns reserved for the session sidebar when it is visible. Set `0` if you keep the sidebar hidden. |
| `padding` | `6` | Prompt box inner padding subtracted from the available width. |

## Behavior without a key

If no OpenCode Go key is found (no `OPENCODE_GO_API_KEY`, no `opencode-go` entry in opencode's
auth store), the plugin does not start — no bar, no command, nothing registered.

## Requirements

- opencode **1.18+** (tested against 1.18.31; uses the TUI plugin slot API)
- An OpenCode Go subscription

## License

MIT
