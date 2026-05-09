# textjam spring2026 — edition source

Source for the **spring2026** edition of textjam.

```sh
bun dev
```

Published to npm as `@textjam/spring2026` (with per-platform sub-packages).

This package itself is private — it just holds the source. The build script in `../../scripts/prepare-npm.ts` cross-compiles `index.ts` into platform binaries and stages the publishable packages.
