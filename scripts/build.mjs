import { cpSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = join(root, "src")
const dist = join(root, "dist")

mkdirSync(dist, { recursive: true })
cpSync(src, dist, { recursive: true })
console.log("built: src/ -> dist/")
