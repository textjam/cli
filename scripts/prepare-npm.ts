#!/usr/bin/env bun
// Build all editions' per-platform binaries and stage all npm packages
// into ./dist/npm/. Each subdirectory there is a publishable package.
//
// Layout produced:
//   dist/npm/@textjam/<edition>            -> launcher (Node, optionalDependencies)
//   dist/npm/@textjam/<edition>-<platform> -> binary holders
//   dist/npm/textjam                       -> unscoped squat shim

import { mkdirSync, copyFileSync, writeFileSync, chmodSync, rmSync, readFileSync } from "node:fs"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")
const distNpm = join(repoRoot, "dist", "npm")
const distBin = join(repoRoot, "dist", "binaries")

const SCOPE = "@textjam"

interface Target {
  platform: "darwin" | "linux" | "win32"
  arch: "x64" | "arm64"
  bunTarget: string
  exeSuffix?: string
}

const TARGETS: Target[] = [
  { platform: "darwin", arch: "arm64", bunTarget: "bun-darwin-arm64" },
  { platform: "darwin", arch: "x64", bunTarget: "bun-darwin-x64" },
  { platform: "linux", arch: "x64", bunTarget: "bun-linux-x64" },
  { platform: "linux", arch: "arm64", bunTarget: "bun-linux-arm64" },
  { platform: "win32", arch: "x64", bunTarget: "bun-windows-x64", exeSuffix: ".exe" },
]

interface EditionMeta {
  name: string
  description: string
  homepage: string
  dates: string
}

interface Edition extends EditionMeta {
  dir: string
  version: string
  bugs: string
}

const BUGS_URL = "https://github.com/textjam/cli/issues"
const REPO_URL = "https://github.com/textjam/cli.git"

function loadEdition(name: string): Edition {
  const dir = join(repoRoot, "editions", name)
  const meta: EditionMeta = JSON.parse(readFileSync(join(dir, "edition.json"), "utf8"))
  if (meta.name !== name) {
    throw new Error(`edition.json name mismatch: ${meta.name} vs directory ${name}`)
  }
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string }
  return { ...meta, dir, version: pkg.version, bugs: BUGS_URL }
}

const EDITIONS: Edition[] = [loadEdition("spring2026")]
const CURRENT_EDITION = "spring2026"

// ─── clean output ───────────────────────────────────────────────────────────
rmSync(distNpm, { recursive: true, force: true })
mkdirSync(distNpm, { recursive: true })
mkdirSync(distBin, { recursive: true })

// ─── 1. compile binaries for each edition × target ─────────────────────────
console.log("Building per-platform binaries...")
for (const ed of EDITIONS) {
  for (const t of TARGETS) {
    const exeName = `textjam-${ed.name}-${t.platform}-${t.arch}${t.exeSuffix ?? ""}`
    const outfile = join(distBin, exeName)
    console.log(`  → ${exeName}`)
    const proc = Bun.spawnSync({
      cmd: ["bun", "build", "--compile", `--target=${t.bunTarget}`, "index.ts", "--outfile", outfile],
      cwd: ed.dir,
      stdio: ["inherit", "pipe", "pipe"],
    })
    if (proc.exitCode !== 0) {
      console.error(`  Failed: ${exeName}`)
      console.error(proc.stderr?.toString())
      process.exit(1)
    }
  }
}

// ─── 2. stage edition packages ──────────────────────────────────────────────
console.log("\nStaging npm packages...")
for (const ed of EDITIONS) {
  // 2a. binary holder packages
  for (const t of TARGETS) {
    const pkgName = `${SCOPE}/${ed.name}-${t.platform}-${t.arch}`
    const pkgDir = join(distNpm, "@textjam", `${ed.name}-${t.platform}-${t.arch}`)
    const binDir = join(pkgDir, "bin")
    mkdirSync(binDir, { recursive: true })

    const exeName = `textjam-${ed.name}-${t.platform}-${t.arch}${t.exeSuffix ?? ""}`
    const src = join(distBin, exeName)
    const dst = join(binDir, exeName)
    copyFileSync(src, dst)
    if (!t.exeSuffix) chmodSync(dst, 0o755)

    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify(
        {
          name: pkgName,
          version: ed.version,
          description: `Prebuilt ${SCOPE}/${ed.name} binary for ${t.platform}-${t.arch}`,
          license: "MIT",
          homepage: ed.homepage,
          files: ["bin/"],
          os: [t.platform],
          cpu: [t.arch],
        },
        null,
        2,
      ) + "\n",
    )

    writeFileSync(
      join(pkgDir, "README.md"),
      `# ${pkgName}

Prebuilt \`${t.platform}-${t.arch}\` binary for [${SCOPE}/${ed.name}](https://www.npmjs.com/package/${SCOPE}/${ed.name}).

You probably want the parent package instead:

\`\`\`sh
npx ${SCOPE}/${ed.name}
\`\`\`
`,
    )
    console.log(`  ✓ ${pkgName}`)
  }

  // 2b. main edition launcher package
  {
    const pkgName = `${SCOPE}/${ed.name}`
    const pkgDir = join(distNpm, "@textjam", ed.name)
    mkdirSync(pkgDir, { recursive: true })

    const cliJs = `#!/usr/bin/env node
// Launcher for ${pkgName}: locate the per-platform sub-package binary and exec it.

const { spawn } = require("node:child_process")
const path = require("node:path")
const fs = require("node:fs")

const platform = process.platform
const arch = process.arch
const subPkg = \`${SCOPE}/${ed.name}-\${platform}-\${arch}\`
const binaryName = platform === "win32"
  ? \`textjam-${ed.name}-\${platform}-\${arch}.exe\`
  : \`textjam-${ed.name}-\${platform}-\${arch}\`

let binaryPath
try {
  const subPkgJson = require.resolve(\`\${subPkg}/package.json\`)
  binaryPath = path.join(path.dirname(subPkgJson), "bin", binaryName)
} catch {}

if (!binaryPath || !fs.existsSync(binaryPath)) {
  process.stderr.write(
    \`\\n${pkgName}: no prebuilt binary available for \${platform}-\${arch}.\\n\` +
      \`Supported: darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64.\\n\\n\`,
  )
  process.exit(1)
}

const child = spawn(binaryPath, process.argv.slice(2), { stdio: "inherit", windowsHide: false })
child.on("exit", (code, signal) => signal ? process.kill(process.pid, signal) : process.exit(code ?? 0))
child.on("error", (err) => {
  process.stderr.write(\`${pkgName}: failed to launch binary: \${err.message}\\n\`)
  process.exit(1)
})
`
    writeFileSync(join(pkgDir, "cli.js"), cliJs)
    chmodSync(join(pkgDir, "cli.js"), 0o755)

    const optionalDeps: Record<string, string> = {}
    for (const t of TARGETS) optionalDeps[`${SCOPE}/${ed.name}-${t.platform}-${t.arch}`] = ed.version

    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify(
        {
          name: pkgName,
          version: ed.version,
          description: ed.description,
          keywords: ["textjam", "gamejam", "tui", "poster", "ascii"],
          homepage: ed.homepage,
          bugs: { url: ed.bugs },
          repository: { type: "git", url: REPO_URL, directory: `editions/${ed.name}` },
          license: "MIT",
          bin: { [`textjam-${ed.name}`]: "cli.js" },
          files: ["cli.js", "README.md"],
          optionalDependencies: optionalDeps,
          engines: { node: ">=18" },
          os: ["darwin", "linux", "win32"],
          cpu: ["x64", "arm64"],
        },
        null,
        2,
      ) + "\n",
    )

    writeFileSync(
      join(pkgDir, "README.md"),
      `# ${pkgName}

A tiny text-adventure poster for **[textjam ${ed.name}](${ed.homepage})** — a text-based thing jam (${ed.dates}).

## Run

\`\`\`sh
npx ${pkgName}
\`\`\`

## What is textjam?

It's like a game jam, but you can produce anything you want, as long as it's text based. Think nethack / dwarf fortress / zork / etc.

Only know basic python? Even \`print("hello world")\` is a valid submission. :)

- ${ed.homepage}
- https://github.com/textjam

## Quit

\`q\`, \`esc\`, or \`ctrl-c\`.
`,
    )
    console.log(`  ✓ ${pkgName}`)
  }
}

// ─── 3. unscoped squat package: `textjam` ──────────────────────────────────
{
  const ed = EDITIONS.find((e) => e.name === CURRENT_EDITION)!
  const pkgDir = join(distNpm, "textjam")
  mkdirSync(pkgDir, { recursive: true })

  // Render the squat shim from its template, substituting placeholders
  // with current-edition metadata.
  const template = readFileSync(join(repoRoot, "packages", "textjam-cli", "cli.template.js"), "utf8")
  const cliJs = template
    .replaceAll("__TEXTJAM_EDITION_NAME__", ed.name)
    .replaceAll("__TEXTJAM_EDITION_DATES__", ed.dates)
  writeFileSync(join(pkgDir, "cli.js"), cliJs)
  chmodSync(join(pkgDir, "cli.js"), 0o755)

  const optionalDeps: Record<string, string> = {}
  for (const t of TARGETS) optionalDeps[`${SCOPE}/${ed.name}-${t.platform}-${t.arch}`] = ed.version

  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify(
      {
        name: "textjam",
        version: ed.version,
        description: `A text-based thing jam. Run \`npx ${SCOPE}/${ed.name}\` for the current edition.`,
        keywords: ["textjam", "gamejam"],
        homepage: "https://textjam.github.io/",
        bugs: { url: BUGS_URL },
        repository: { type: "git", url: REPO_URL },
        license: "MIT",
        bin: { textjam: "cli.js" },
        files: ["cli.js", "README.md"],
        optionalDependencies: optionalDeps,
        engines: { node: ">=18" },
      },
      null,
      2,
    ) + "\n",
  )

  writeFileSync(
    join(pkgDir, "README.md"),
    `# textjam

A text-based thing jam.

## Current edition: ${ed.name}

${ed.dates}

\`\`\`sh
npx textjam
\`\`\`

This package shims to the current edition's binary. Equivalent to:

\`\`\`sh
npx ${SCOPE}/${ed.name}
\`\`\`

## Links

- https://textjam.github.io/
- https://github.com/textjam
`,
  )
  console.log(`  ✓ textjam (squat → ${ed.name})`)
}

console.log("\nDone. Packages staged in dist/npm/")
console.log("\nTo publish:  ./scripts/publish-npm.sh")
