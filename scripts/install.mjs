#!/usr/bin/env node
/**
 * Explicit opt-in installer for the local-path workflow.
 *
 * This is NOT an install lifecycle hook. It only ever runs when a human types
 * `npm run install-plugin`. The primary install path is:
 *
 *     opencode plugin add "@leo.gimp/opencode-usage-bar"
 *
 * which needs no script at all. This exists for the local-path case, where
 * opencode loads the plugin from a directory instead of from a package spec.
 *
 * Usage:
 *   node scripts/install.mjs [options]
 *
 *   --dry-run          report every change, write nothing
 *   --config-dir DIR   config directory (default: $OPENCODE_CONFIG_DIR or
 *                      $XDG_CONFIG_HOME/opencode or ~/.config/opencode)
 *   --target DIR       install directory (default: <config-dir>/usage-bar)
 *   --no-config        copy the plugin files only, do not touch any config
 *   --help             show this message
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir, EOL } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

if (flag("--help") || flag("-h")) {
  console.log(
    [
      "opencode-usage-bar installer (explicit opt-in, not a lifecycle hook)",
      "",
      "  node scripts/install.mjs [options]",
      "",
      "  --dry-run          report every change, write nothing",
      "  --config-dir DIR   config directory (default: opencode config dir)",
      "  --target DIR       install directory (default: <config-dir>/usage-bar)",
      "  --no-config        copy plugin files only, do not touch any config",
      "",
      "Primary install path is: opencode plugin add \"@leo.gimp/opencode-usage-bar\"",
    ].join("\n"),
  )
  process.exit(0)
}

const dryRun = flag("--dry-run")
const noConfig = flag("--no-config")
const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const srcDir = path.join(pkgRoot, "src")

const configDir = opt("--config-dir")
  ? path.resolve(opt("--config-dir"))
  : process.env.OPENCODE_CONFIG_DIR
    ? path.resolve(process.env.OPENCODE_CONFIG_DIR)
    : path.join(
        process.env.XDG_CONFIG_HOME ? process.env.XDG_CONFIG_HOME : path.join(homedir(), ".config"),
        "opencode",
      )
const targetDir = opt("--target") ? path.resolve(opt("--target")) : path.join(configDir, "usage-bar")

const log = (msg) => console.log(`[opencode-usage-bar] ${msg}`)
const plan = (msg) => console.log(`[opencode-usage-bar] ${dryRun ? "would " : ""}${msg}`)
const warn = (msg) => console.warn(`[opencode-usage-bar] ${msg}`)

if (!existsSync(path.join(srcDir, "tui.tsx"))) {
  warn(`src/tui.tsx not found in ${pkgRoot} - run this from a checkout or installed package`)
  process.exit(1)
}

function writeBackedUp(file, contents) {
  if (dryRun) return
  mkdirSync(path.dirname(file), { recursive: true })
  // Never overwrite user config without a recoverable copy alongside it.
  if (existsSync(file)) cpSync(file, `${file}.opencode-usage-bar.bak`)
  writeFileSync(file, contents)
}

// ---------------------------------------------------------------------------
// 1. Copy the plugin sources next to each other at the target root.
// ---------------------------------------------------------------------------
// Local-path plugin targets are resolved by opencode as `<target>/tui` with the
// extension probed, so the package.json exports mapping is NOT consulted for
// paths. Mirror every source module at the target root so that resolution finds
// `usage-bar/tui.tsx`; the entry's relative imports (./usage, ./bar, ./dialog)
// then resolve from the same flat location.

const modules = readdirSync(srcDir).filter((name) => /\.[cm]?[jt]sx?$/.test(name))
if (dryRun) {
  plan(`copy ${modules.length} source module(s) to ${targetDir}`)
} else {
  mkdirSync(targetDir, { recursive: true })
  for (const name of modules) {
    cpSync(path.join(srcDir, name), path.join(targetDir, name), { dereference: true })
  }
  for (const name of ["package.json", "README.md", "LICENSE"]) {
    const src = path.join(pkgRoot, name)
    if (existsSync(src)) cpSync(src, path.join(targetDir, name))
  }
  log(`installed ${modules.length} module(s) to ${targetDir}`)
}

// ---------------------------------------------------------------------------
// 2. Renderer libraries are deliberately NOT vendored.
// ---------------------------------------------------------------------------
// solid-js, @opentui/core and @opentui/solid are peerDependencies: the host
// supplies the one copy it renders with. Vendoring private copies here is what
// produced duplicate module identities, and OpenTUI's reconciler keys off that
// identity - a second copy renders nothing, silently. @opencode/plugin is
// resolved by the host as well and needs no copy either.

log("renderer libraries are left to the host (peerDependencies) - not vendored")

if (noConfig) {
  log("--no-config: skipped config changes")
  log(dryRun ? "dry run complete, nothing written" : "done - quit and restart opencode to load the plugin")
  process.exit(0)
}

// ---------------------------------------------------------------------------
// 3. Patch the global cli.json (OpenCode V2 terminal settings) so opencode
//    loads the installed copy by absolute path.
// ---------------------------------------------------------------------------

function readJson(file) {
  if (!existsSync(file)) return { value: {}, existed: false }
  let text
  try {
    text = readFileSync(file, "utf8").replace(/^\uFEFF/, "")
  } catch (error) {
    throw new Error(`${file} exists but could not be read (${error.message})`)
  }
  if (text.trim() === "") return { value: {}, existed: true }
  try {
    return { value: JSON.parse(text), existed: true }
  } catch (error) {
    // Refuse rather than silently replace a config we could not understand.
    throw new Error(`${file} is not valid JSON (${error.message}) - fix or remove it, then re-run`)
  }
}

const isOurSpec = (value) => {
  const spec = Array.isArray(value)
    ? value[0]
    : typeof value === "object" && value !== null
      ? value.package
      : value
  return typeof spec === "string" && spec.toLowerCase().includes("usage-bar")
}

const replaceSpec = (item) => {
  if (Array.isArray(item) && item.length > 1) {
    // V1 tuple form [spec, options] -> V2 object form.
    return { package: targetDir, options: item[1] }
  }
  return targetDir
}

/** Rewrite our own entry in place; every other entry is left untouched. */
const applyEntry = (config, key) => {
  const list = Array.isArray(config[key]) ? config[key] : []
  let replaced = false
  const next = list.map((item) => {
    if (!isOurSpec(item) || replaced) return item
    replaced = true
    return replaceSpec(item)
  })
  if (!replaced) next.push(targetDir)
  config[key] = next
  return replaced
}

const patchFile = (file, key) => {
  const { value: config, existed } = readJson(file)
  const replaced = applyEntry(config, key)
  if (!config.$schema) config.$schema = "https://opencode.ai/v2/cli.json"
  writeBackedUp(file, JSON.stringify(config, null, 2) + EOL)
  const backupNote = existed && !dryRun ? " (previous version backed up)" : ""
  log(`${replaced ? "updated" : "added"} entry in ${file}${backupNote}`)
  return replaced
}

try {
  patchFile(path.join(configDir, "cli.json"), "plugins")

  // Keep a legacy tui.json entry pointing at the same target, so a later
  // tui.json -> cli.json migration cannot resurrect a stale path. Only ever
  // rewrites tui.json when it already mentions this plugin.
  for (const name of ["tui.json", "tui.jsonc"]) {
    const legacy = path.join(configDir, name)
    if (!existsSync(legacy)) continue
    const { value: config } = readJson(legacy)
    const list = Array.isArray(config.plugin) ? config.plugin : []
    if (!list.some(isOurSpec)) continue
    applyEntry(config, "plugin")
    writeBackedUp(legacy, JSON.stringify(config, null, 2) + EOL)
    log(`updated legacy entry in ${legacy}${dryRun ? "" : " (previous version backed up)"}`)
  }
} catch (error) {
  warn(error.message)
  warn(`plugin files are in place at ${targetDir}, but cli.json was left untouched`)
  process.exit(1)
}

log(dryRun ? "dry run complete, nothing written" : "done - quit and restart opencode to load the plugin")