#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir, EOL } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const distDir = path.join(pkgRoot, "dist")
const configDir = process.env.OPENCODE_CONFIG_DIR
  ? path.resolve(process.env.OPENCODE_CONFIG_DIR)
  : path.join(process.env.XDG_CONFIG_HOME ? process.env.XDG_CONFIG_HOME : path.join(homedir(), ".config"), "opencode")
const targetDir = path.join(configDir, "usage-bar")

const log = (msg) => console.log(`[opencode-usage-bar] ${msg}`)
const warn = (msg) => console.warn(`[opencode-usage-bar] ${msg}`)

if (!existsSync(path.join(distDir, "tui.tsx"))) {
  warn("dist/tui.tsx not found — run `npm run build` first")
  process.exit(1)
}

// 1. Copy the plugin files outside node_modules (npm-spec TUI plugins cannot load,
//    see https://github.com/anomalyco/opencode/issues/33884)
mkdirSync(path.join(targetDir, "dist"), { recursive: true })
cpSync(distDir, path.join(targetDir, "dist"), { recursive: true, dereference: true })
for (const name of ["README.md", "LICENSE"]) {
  const src = path.join(pkgRoot, name)
  if (existsSync(src)) cpSync(src, path.join(targetDir, name))
}
log(`installed plugin files to ${targetDir}`)

// 2. Vendor runtime deps next to the installed copy so bare imports resolve.
//    Walk the full dependency closure (hoisted packages) from the plugin's own
//    node_modules, so no transitive import is missed.
const srcNodeModules = path.join(pkgRoot, "node_modules")
const dstNodeModules = path.join(targetDir, "node_modules")
const ROOT_DEPS = ["solid-js", "@opentui/solid"]
const DEP_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"]

function readPackageJson(dir) {
  try {
    return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8").replace(/^\uFEFF/, ""))
  } catch {
    return undefined
  }
}

const copiedDeps = new Set()
const missingDeps = []
const queue = ROOT_DEPS.map((name) => ({ name, fromDir: pkgRoot }))
const resolveDepDir = (fromDir, name) => {
  const parts = name.split("/")
  let dir = fromDir
  while (true) {
    const candidate = path.join(dir, "node_modules", ...parts)
    if (existsSync(candidate)) return candidate
    if (dir === srcNodeModules || path.dirname(dir) === dir) return undefined
    dir = path.dirname(dir)
  }
}
while (queue.length > 0) {
  const job = queue.shift()
  if (copiedDeps.has(job.name)) continue
  copiedDeps.add(job.name)
  const src = resolveDepDir(job.fromDir, job.name)
  const pkg = src ? readPackageJson(src) : undefined
  if (!pkg) {
    missingDeps.push(job.name)
    continue
  }
  const parts = job.name.split("/")
  mkdirSync(path.join(dstNodeModules, ...parts.slice(0, -1)), { recursive: true })
  cpSync(src, path.join(dstNodeModules, ...parts), { recursive: true, dereference: true })
  for (const field of DEP_FIELDS) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (!copiedDeps.has(dep)) queue.push({ name: dep, fromDir: src })
    }
  }
}

if (missingDeps.length > 0) {
  warn(`optional/other-platform packages not found locally (usually fine): ${missingDeps.join(", ")}`)
  warn(`if the plugin fails to load, run: npm install --prefix ${targetDir}`)
}

// 3. Patch the global tui.json so opencode loads the installed copy by absolute path
let tuiPath = path.join(configDir, "tui.json")
if (!existsSync(tuiPath) && existsSync(path.join(configDir, "tui.jsonc"))) {
  tuiPath = path.join(configDir, "tui.jsonc")
}

let config
try {
  config = JSON.parse(readFileSync(tuiPath, "utf8").replace(/^\uFEFF/, ""))
} catch {
  warn(`could not parse ${tuiPath} (comments or invalid JSON) — add the plugin entry manually:`)
  warn(`  "plugin": [ ${JSON.stringify(targetDir)} ]`)
  process.exit(0)
}

const isOurSpec = (value) => {
  const spec = Array.isArray(value) ? value[0] : value
  return typeof spec === "string" && spec.toLowerCase().includes("usage-bar")
}

const plugin = Array.isArray(config.plugin) ? config.plugin : []
let replaced = false
const next = plugin.map((item) => {
  if (!isOurSpec(item) || replaced) return item
  replaced = true
  return Array.isArray(item) && item.length > 1 ? [targetDir, item[1]] : targetDir
})
if (!replaced) next.push(targetDir)
config.plugin = next

mkdirSync(configDir, { recursive: true })
writeFileSync(tuiPath, JSON.stringify(config, null, 2) + EOL)
log(`${replaced ? "updated" : "added"} entry in ${tuiPath}`)
log("done — quit and restart opencode to load the plugin")
