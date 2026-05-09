# textjam

A text-based thing jam — and the source for the little CLI experiences that announce it.

```sh
npx textjam
# or, equivalently:
npx @textjam/spring2026
```

## What's in here

```
.
├── editions/           # one folder per edition; current: spring2026
│   └── spring2026/     # → published as @textjam/spring2026
│       └── index.ts    # the actual TUI app
├── packages/
│   └── textjam-cli/    # → published as the unscoped `textjam` shim
└── scripts/
    ├── prepare-npm.ts  # cross-compiles binaries, stages dist/npm/*
    └── publish-npm.sh  # npm publish loop
```

This is a [Bun](https://bun.sh) workspaces monorepo.

## Develop a new edition

```sh
bun install
bun run --filter '@textjam/spring2026-edition' dev
```

Add a new edition by copying `editions/spring2026/` to `editions/<new-name>/`, updating its `package.json`, and registering it in `scripts/prepare-npm.ts`.

## Publish

```sh
bun run build           # cross-compile + stage dist/npm/
bun run publish:npm     # publish every package
```

Each edition becomes:

- `@textjam/<edition>` — Node launcher (tiny, picks the right binary)
- `@textjam/<edition>-<platform>-<arch>` — prebuilt binary holders (5 of these)

The unscoped `textjam` package ships as a thin shim that runs the **current edition** (currently `spring2026`).

## Editions

| Edition | Dates | Status |
|---|---|---|
| spring2026 | May 8 → Jun 7, 2026 | active |

## Links

- <https://textjam.github.io/>
- <https://github.com/textjam>
