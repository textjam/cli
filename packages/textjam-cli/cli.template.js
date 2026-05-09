#!/usr/bin/env node
// `textjam` shim: runs the current edition's prebuilt binary if available,
// otherwise prints a friendly hint pointing to the edition.
//
// This file is a template. Placeholders prefixed with __TEXTJAM_ are replaced
// at build time by scripts/prepare-npm.ts using metadata from the active
// edition's edition.json. Do not edit those placeholders.

const { spawn } = require("node:child_process")
const path = require("node:path")
const fs = require("node:fs")

const CURRENT_EDITION = "__TEXTJAM_EDITION_NAME__"
const CURRENT_EDITION_DATES = "__TEXTJAM_EDITION_DATES__"

const platform = process.platform
const arch = process.arch
const subPkg = `@textjam/${CURRENT_EDITION}-${platform}-${arch}`
const binaryName =
  platform === "win32"
    ? `textjam-${CURRENT_EDITION}-${platform}-${arch}.exe`
    : `textjam-${CURRENT_EDITION}-${platform}-${arch}`

let binaryPath
try {
  const subPkgJson = require.resolve(`${subPkg}/package.json`)
  binaryPath = path.join(path.dirname(subPkgJson), "bin", binaryName)
} catch {}

if (binaryPath && fs.existsSync(binaryPath)) {
  const child = spawn(binaryPath, process.argv.slice(2), { stdio: "inherit", windowsHide: false })
  child.on("exit", (code, signal) =>
    signal ? process.kill(process.pid, signal) : process.exit(code ?? 0),
  )
  child.on("error", (err) => {
    process.stderr.write(`textjam: failed to launch binary: ${err.message}\n`)
    process.exit(1)
  })
} else {
  process.stdout.write(
    "textjam: a text-based thing jam.\n\n" +
      `  current edition: ${CURRENT_EDITION} (${CURRENT_EDITION_DATES})\n\n` +
      `  npx @textjam/${CURRENT_EDITION}\n` +
      `  https://textjam.github.io/${CURRENT_EDITION}/\n\n`,
  )
}
