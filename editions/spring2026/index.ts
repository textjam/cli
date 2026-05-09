#!/usr/bin/env bun

import {
  createCliRenderer,
  type CliRenderer,
  type OptimizedBuffer,
  RGBA,
  FrameBufferRenderable,
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type KeyEvent,
} from "@opentui/core"
import * as readline from "node:readline/promises"

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: plain stdin/stdout text-adventure intro
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Inline pause syntax: [p:200] pauses 200ms mid-typing.
// Also: ',' and '.' get tiny natural extra pauses.
async function typeOut(text: string, delay = 18): Promise<void> {
  const pauseRe = /\[p:(\d+)\]/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  const segments: { text?: string; pause?: number }[] = []
  while ((m = pauseRe.exec(text)) !== null) {
    if (m.index > lastIdx) segments.push({ text: text.slice(lastIdx, m.index) })
    segments.push({ pause: parseInt(m[1], 10) })
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) segments.push({ text: text.slice(lastIdx) })

  for (const seg of segments) {
    if (seg.pause !== undefined) {
      await sleep(seg.pause)
      continue
    }
    if (!seg.text) continue
    for (const ch of seg.text) {
      process.stdout.write(ch)
      if (ch === " " || ch === "\n") continue
      let extra = 0
      if (ch === ",") extra = 90
      else if (ch === "." || ch === "?" || ch === "!") extra = 160
      await sleep(delay + extra)
    }
  }
}

async function typeLine(text = "", delay = 18): Promise<void> {
  await typeOut(text, delay)
  process.stdout.write("\n")
}

// "Thinking" pause after user input, before responding
async function think(min = 350, max = 750): Promise<void> {
  await sleep(min + Math.random() * (max - min))
}

function blank(n = 1): void {
  for (let i = 0; i < n; i++) process.stdout.write("\n")
}

async function ask(rl: readline.Interface, prompt: string): Promise<string> {
  // Type out everything except the final "> " marker, then let readline own that prompt
  const marker = "> "
  let leading = prompt
  if (prompt.endsWith(marker)) {
    leading = prompt.slice(0, -marker.length)
  }
  await typeOut(leading, 14)
  const answer = (await rl.question(marker)).trim()
  return answer
}

interface Story {
  name: string
  experience: "yes" | "no" | "kinda"
  dream: string
}

async function intro(): Promise<Story> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  // Clear screen, hide cursor briefly, hold on a black screen for a beat
  process.stdout.write("\x1b[2J\x1b[H\x1b[?25l")
  await sleep(700)
  process.stdout.write("\x1b[?25h")

  blank()
  await typeLine("you find yourself[p:300] at the start of a game jam.", 22)
  await sleep(500)
  await typeLine("the room is dim.[p:250] there is a terminal in front of you.", 22)
  await sleep(400)
  await typeLine("a cursor blinks,[p:200] waiting.", 22)
  blank()
  await sleep(600)

  const name = (await ask(rl, "what's your name, traveller?\n> ")) || "friend"
  await think(500, 900)
  blank()
  await typeLine(`hello,[p:200] ${name}.`, 18)
  await sleep(350)
  blank()

  await typeLine("the terminal hums.", 22)
  await sleep(400)
  let exp: Story["experience"] = "kinda"
  while (true) {
    const raw = (await ask(rl, "have you ever made a text-based thing before?[p:150] (yes / no / kinda)\n> ")).toLowerCase()
    if (raw.startsWith("y")) {
      exp = "yes"
      break
    }
    if (raw.startsWith("n")) {
      exp = "no"
      break
    }
    if (raw.startsWith("k") || raw.startsWith("m") || raw === "") {
      exp = "kinda"
      break
    }
    await think(300, 500)
    await typeLine("(just yes,[p:150] no,[p:150] or kinda[p:200] — whichever feels true)", 18)
  }
  await think(450, 800)
  blank()
  if (exp === "yes") {
    await typeLine("then you know[p:250] the warmth of a good prompt.", 22)
  } else if (exp === "no") {
    await typeLine("then you are in for[p:250] something nice.", 22)
  } else {
    await typeLine("then you are exactly[p:200] the right kind of in-between.", 22)
  }
  await sleep(400)
  blank()

  await typeLine("the cursor blinks again,[p:200] patient.", 22)
  await sleep(400)
  const dreamRaw = await ask(rl, "what would you make,[p:200] if anyone could play it?\n> ")
  const dream = dreamRaw || "something small and strange"
  await think(700, 1200)
  blank()
  await typeLine("that[p:300] is[p:250] wonderful.", 22)
  await sleep(600)
  blank()

  await typeLine("the room shifts.", 24)
  await sleep(450)
  await typeLine("the terminal warms in your hands.", 24)
  await sleep(450)
  await typeLine("there is a door.", 24)
  await sleep(700)
  blank()
  process.stdout.write("> ")
  await rl.question("")
  rl.close()

  return { name, experience: exp, dream }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: ASCII flicker transition (still plain stdout)
// ─────────────────────────────────────────────────────────────────────────────

const PLASMA_CHARS = " .,:;i1tfLCG08@"

function plasma(x: number, y: number, w: number, h: number, t: number): number {
  const nx = x / Math.max(1, w)
  const ny = y / Math.max(1, h)
  const v1 = Math.sin(nx * 10 + t)
  const v2 = Math.sin(ny * 10 + t * 0.7)
  const v3 = Math.sin((nx + ny) * 8 + t * 1.3)
  const v4 = Math.sin(Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 12 - t * 2)
  return (v1 + v2 + v3 + v4 + 4) / 8
}

async function bloomTransition(): Promise<void> {
  const cols = process.stdout.columns ?? 80
  const rows = (process.stdout.rows ?? 24) - 1
  // Move cursor home, hide it, switch to alt screen
  process.stdout.write("\x1b[?25l")
  process.stdout.write("\x1b[2J\x1b[H")

  const frames = 26
  for (let f = 0; f < frames; f++) {
    const t = f * 0.18
    const intensity = Math.min(1, f / (frames - 6))
    let out = "\x1b[H"
    for (let y = 0; y < rows; y++) {
      let line = ""
      for (let x = 0; x < cols; x++) {
        const v = plasma(x, y, cols, rows, t)
        const idx = Math.floor(v * intensity * (PLASMA_CHARS.length - 1))
        const safe = Math.max(0, Math.min(PLASMA_CHARS.length - 1, idx))
        const ch = PLASMA_CHARS[safe]
        // Color shifts cool->warm as we bloom
        const shade = Math.floor(v * 200 + 30)
        const r = shade
        const g = Math.floor(shade * (0.6 + intensity * 0.4))
        const b = Math.floor(shade * (1.0 - intensity * 0.5))
        line += `\x1b[38;2;${r};${g};${b}m${ch}`
      }
      out += line + "\x1b[0m\n"
    }
    process.stdout.write(out)
    await sleep(40)
  }
  process.stdout.write("\x1b[2J\x1b[H")
  process.stdout.write("\x1b[?25h")
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: opentui poster
// ─────────────────────────────────────────────────────────────────────────────

let framebuffer: OptimizedBuffer | null = null
let bgBuffer: Float32Array | null = null
let posterBox: BoxRenderable | null = null
let bgRenderable: FrameBufferRenderable | null = null

type LineStyle = "title" | "date" | "body" | "blank" | "link" | "accent"

const POSTER_LINES: { text: string; style: LineStyle }[] = [
  { text: "textjam spring2026", style: "title" },
  { text: "", style: "blank" },
  { text: "may 8th  ->  june 7th", style: "date" },
  { text: "", style: "blank" },
  { text: "a text-based thing jam", style: "accent" },
  { text: "", style: "blank" },
  { text: "its like a game jam, but you", style: "body" },
  { text: "can produce anything you want,", style: "body" },
  { text: "as long as its text based", style: "body" },
  { text: "", style: "blank" },
  { text: "think nethack / dwarf fortress /", style: "body" },
  { text: "zork / etc.", style: "body" },
  { text: "", style: "blank" },
  { text: "only know basic python?", style: "body" },
  { text: 'even print("hello world") is', style: "body" },
  { text: "a valid submission :)", style: "body" },
  { text: "", style: "blank" },
  { text: "textjam.github.io/spring2026", style: "link" },
  { text: "github.com/textjam/spring2026", style: "link" },
]

async function showPoster(): Promise<void> {
  const renderer: CliRenderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
  })
  renderer.start()
  renderer.setBackgroundColor(RGBA.fromInts(8, 8, 18, 255))

  let time = 0
  let paused = false

  // Intensity fades from 0 -> 1 (plasma blooms in)
  let plasmaIntensity = 0

  bgRenderable = new FrameBufferRenderable(renderer, {
    id: "textjam-poster-bg",
    width: renderer.terminalWidth,
    height: renderer.terminalHeight,
    zIndex: 0,
  })
  renderer.root.add(bgRenderable)
  framebuffer = bgRenderable.frameBuffer

  const contentWidth = POSTER_LINES.reduce((m, l) => Math.max(m, l.text.length), 0)
  const boxInnerPadX = 4
  const boxInnerPadY = 2
  const boxWidth = contentWidth + boxInnerPadX * 2 + 2
  const boxHeight = POSTER_LINES.length + boxInnerPadY * 2 + 2

  posterBox = new BoxRenderable(renderer, {
    id: "textjam-poster-box",
    width: boxWidth,
    height: boxHeight,
    position: "absolute",
    left: Math.max(0, Math.floor((renderer.terminalWidth - boxWidth) / 2)),
    top: Math.max(0, Math.floor((renderer.terminalHeight - boxHeight) / 2)),
    zIndex: 10,
    border: true,
    borderColor: RGBA.fromInts(180, 200, 255, 255),
    backgroundColor: RGBA.fromInts(10, 10, 20, 220),
    title: " textjam.github.io/spring2026 ",
    titleAlignment: "center",
    opacity: 0, // start invisible, will animate in
  })
  renderer.root.add(posterBox)

  const styleColor = (style: LineStyle) => {
    switch (style) {
      case "title":
        return { fg: RGBA.fromInts(255, 230, 120, 255), attr: TextAttributes.BOLD }
      case "date":
        return { fg: RGBA.fromInts(120, 220, 255, 255), attr: TextAttributes.BOLD }
      case "accent":
        return { fg: RGBA.fromInts(220, 220, 240, 255), attr: TextAttributes.BOLD }
      case "link":
        return { fg: RGBA.fromInts(160, 220, 180, 255), attr: TextAttributes.NONE }
      case "body":
        return { fg: RGBA.fromInts(220, 220, 230, 255), attr: TextAttributes.NONE }
      case "blank":
      default:
        return { fg: RGBA.fromInts(200, 200, 200, 255), attr: TextAttributes.NONE }
    }
  }

  POSTER_LINES.forEach((line, i) => {
    if (line.text.length === 0) return
    const { fg, attr } = styleColor(line.style)
    const left = Math.floor((boxWidth - 2 - line.text.length) / 2)
    const t = new TextRenderable(renderer, {
      id: `poster-line-${i}`,
      content: line.text,
      position: "absolute",
      left,
      top: 1 + boxInnerPadY + i,
      fg,
      attributes: attr,
      zIndex: 11,
    })
    posterBox!.add(t)
  })

  function renderBackground(): void {
    if (!framebuffer) return
    const fb = framebuffer
    const w = fb.width
    const h = fb.height
    const ssW = w * 2
    const ssH = h * 2
    if (!bgBuffer || bgBuffer.length !== ssW * ssH) {
      bgBuffer = new Float32Array(ssW * ssH)
    }
    const intensity = plasmaIntensity
    for (let y = 0; y < ssH; y++) {
      for (let x = 0; x < ssW; x++) {
        bgBuffer[y * ssW + x] = plasma(x, y, ssW, ssH, time) * intensity
      }
    }
    fb.clear(RGBA.fromInts(8, 8, 18, 255))
    fb.drawGrayscaleBufferSupersampled(0, 0, bgBuffer, ssW, ssH)
  }

  function recenterBox() {
    if (!posterBox) return
    posterBox.left = Math.max(0, Math.floor((renderer.terminalWidth - boxWidth) / 2))
    posterBox.top = Math.max(0, Math.floor((renderer.terminalHeight - boxHeight) / 2))
  }

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "space") paused = !paused
    if (key.name === "q" || (key.ctrl && key.name === "c") || key.name === "escape") {
      renderer.destroy()
      process.exit(0)
    }
  })

  renderer.on("resize", (_w: number, _h: number) => {
    if (framebuffer) framebuffer.resize(renderer.terminalWidth, renderer.terminalHeight)
    recenterBox()
  })

  renderer.setFrameCallback(async (deltaTime) => {
    if (!paused) time += (deltaTime / 1000) * 0.6
    renderBackground()
  })

  // Sequence: fade plasma in, then fade panel in
  const plasmaFadeMs = 1400
  const plasmaSteps = 40
  for (let i = 0; i <= plasmaSteps; i++) {
    plasmaIntensity = i / plasmaSteps
    await sleep(plasmaFadeMs / plasmaSteps)
  }

  await sleep(250)

  const panelFadeMs = 700
  const panelSteps = 30
  for (let i = 0; i <= panelSteps; i++) {
    if (posterBox) posterBox.opacity = i / panelSteps
    await sleep(panelFadeMs / panelSteps)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

await intro()
await bloomTransition()
await showPoster()
