#!/usr/bin/env bash
# Publish all npm packages staged in dist/npm/.
# Sub-packages must publish before main + squat (they depend on the binary holders).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NPM_DIR="$ROOT/dist/npm"

if [ ! -d "$NPM_DIR" ]; then
  echo "Run scripts/prepare-npm.ts first."
  exit 1
fi

# Per-platform binary holders (everything matching @textjam/<edition>-<platform>-<arch>)
for d in "$NPM_DIR/@textjam/"*-*-*/; do
  name="$(jq -r .name "$d/package.json")"
  echo "==> Publishing $name"
  (cd "$d" && npm publish --access public)
done

# Edition launchers (@textjam/<edition>) — directories without a -platform suffix
for d in "$NPM_DIR/@textjam/"*/; do
  name="$(basename "$d")"
  case "$name" in
    *-*-*) continue ;; # skip the per-platform ones (already done)
  esac
  pkg="$(jq -r .name "$d/package.json")"
  echo "==> Publishing $pkg"
  (cd "$d" && npm publish --access public)
done

# Unscoped squat package
echo "==> Publishing textjam (squat)"
(cd "$NPM_DIR/textjam" && npm publish --access public)

echo
echo "Done. Try:  npx @textjam/spring2026   |   npx textjam"
