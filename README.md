# opencode-usage-bar

[OpenCode Go](https://opencode.ai/docs/go/) usage bars for the [opencode](https://opencode.ai) TUI - a persistent bar next to the prompt in sessions, plus a `/limit` popup with all three windows. Read-only; talks directly to the official usage API, never sends LLM prompts.

## Install

```sh
npm install -g @leo.gimp/opencode-usage-bar
```

Then quit and restart opencode - TUI config is only read at startup. The postinstall script copies the plugin to `~/.config/opencode/usage-bar/`, vendors its dependencies, and patches `~/.config/opencode/tui.json` with the absolute path.

> npm 11+ gates install scripts by default. If the postinstall was skipped, re-run with `npm install -g @leo.gimp/opencode-usage-bar --allow-scripts=@leo.gimp/opencode-usage-bar`, or run the `opencode-usage-bar` bin manually.

To uninstall, remove the entry from `tui.json` and delete `~/.config/opencode/usage-bar/`.

## Features

### Session usage bar

A full usage bar rendered on the right side of the prompt hint row, inside active sessions:

- Percent used (`xx.x%`), 20-character `▓/░` bar, reset countdown (`4h 10m`, `3d 4h`, …)
- Refreshes every **60 seconds** (with request deduplication and a 60s cache)
- **Adaptive sizing** - mirrors the session layout (sidebar, padding) and terminal size, live on resize; compact form in tight windows, hidden when it would overlap the prompt hints
- Shows a dimmed `5h (unavailable)` if the request fails instead of disappearing

![session usage bar](assets/session-bar.png)

### `/limit` popup

Type `/limit` (or `ctrl+p` → *Usage limits*) for a popup with all three windows - rolling 5h, weekly, monthly:

- Fetches **fresh** data on every open (bypasses the cache); timers keep ticking while open
- Floating panel, no background dimming - close with `esc` or a click outside
- `[ hide usage bar ]` toggle below the windows, persisted across restarts in `~/.config/opencode/usage-bar.json`

![/limit popup](assets/limit-popup.png)

### Data source

Reads the official OpenCode Go quota endpoint (`GET https://opencode.ai/zen/go/v1/usage`) returning the rolling, weekly, and monthly windows. The plugin is read-only.

## Options

Passed as the second element of the plugin tuple in `tui.json`:

| Option | Default | Description |
|---|---|---|
| `left_reserve` | `44` | Columns reserved for the left prompt hints. Increase if the bar hides too late. |
| `sidebar_width` | `42` | Columns reserved for the session sidebar. Set `0` if you keep it hidden. |
| `padding` | `6` | Prompt box inner padding subtracted from the available width. |

## Notes

- Without an OpenCode Go key (`OPENCODE_GO_API_KEY` or `opencode-go` in the auth store) the plugin does not start - no bar, no command, nothing registered.
- TUI plugins referenced by npm package spec in `tui.json` fail to render in opencode 1.17+ (upstream issue [#33884](https://github.com/anomalyco/opencode/issues/33884)) - hence the file-path copy.

## Local development

Add the absolute path to the plugin folder in `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["C:\\path\\to\\opencode-usage-bar"]
}
```

## Requirements

- opencode **1.18+** (uses the TUI plugin slot API)
- An OpenCode Go subscription

## License

MIT
