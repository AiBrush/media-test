#!/usr/bin/env bash
#
# Refresh the local @aibrush/media build and atomically persist the exact source/build/WASM tuple that
# the browser adapter reports. The generated artifact contains no timestamps or host paths, so the same
# clean revision and artifacts always produce byte-identical metadata.
#
# Usage:
#   bun run sync-vendor
#   bash scripts/sync-aibrush-vendor.sh --reproducible
#
# --reproducible (and any truthy CI value) refuses dirty or unlabeled source before building. The default
# development mode permits a dirty sibling, but the generated artifact labels it dirty-dev and adapter
# reproducible requests fail closed.
set -euo pipefail

REPRODUCIBLE=false
case "${1:-}" in
  '') ;;
  --reproducible) REPRODUCIBLE=true ;;
  -h|--help)
    sed -n '2,14p' "$0"
    exit 0
    ;;
  *)
    echo "[sync-vendor] ERROR: unknown argument '$1'" >&2
    exit 2
    ;;
esac
[ "$#" -le 1 ] || { echo "[sync-vendor] ERROR: expected at most one argument" >&2; exit 2; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEDIA="$(cd "$HERE/../media" && pwd)"
INSTALLED="$HERE/node_modules/@aibrush/media"
PROVENANCE_OUT="$HERE/src/engines/aibrush-media/vendor-provenance.generated.ts"
BUILD_FLAGS=("bun run build" "bun run vendor-wasm")

is_truthy() {
  case "${1:-}" in
    ''|0|false|FALSE|False|no|NO|No) return 1 ;;
    *) return 0 ;;
  esac
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo "[sync-vendor] ERROR: shasum or sha256sum is required" >&2
    return 1
  fi
}

sha256_stream() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    echo "[sync-vendor] ERROR: shasum or sha256sum is required" >&2
    return 1
  fi
}

compute_source_tree_digest() {
  {
    printf 'revision\0%s\0' "$SOURCE_REVISION"
    # A binary Git diff captures every tracked working-tree deviation without persisting its contents.
    git -C "$MEDIA" diff --binary --no-ext-diff HEAD --
    # Include untracked files that can affect package construction; exclude unrelated worktree/tool state.
    while IFS= read -r -d '' relative; do
      printf 'untracked\0%s\0%s\0' "$relative" "$(sha256_file "$MEDIA/$relative")"
    done < <(
      git -C "$MEDIA" ls-files --others --exclude-standard -z -- \
        package.json bun.lock tsconfig.json tsconfig.test.json tsconfig.scripts.json tsup.config.ts \
        src scripts/vendor-wasm.ts
    )
  } | sha256_stream
}

capture_source_state() {
  if command -v git >/dev/null 2>&1 && git -C "$MEDIA" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    SOURCE_REVISION="$(git -C "$MEDIA" rev-parse HEAD)"
    if [ -z "$(git -C "$MEDIA" status --porcelain=v1 --untracked-files=all)" ]; then
      DIRTY_STATE=clean
    else
      DIRTY_STATE=dirty
    fi
    SOURCE_TREE_DIGEST="$(compute_source_tree_digest)"
  else
    SOURCE_REVISION=UNLABELED_LOCAL_SOURCE
    SOURCE_TREE_DIGEST=UNLABELED_SOURCE_TREE
    DIRTY_STATE=unknown
  fi
}

package_version() {
  bun -e \
    'const p = await Bun.file(process.argv[1]).json(); process.stdout.write(String(p.version));' \
    "$1"
}

write_provenance_atomically() {
  local temp
  temp="$(mktemp "${PROVENANCE_OUT}.tmp.XXXXXX")"
  trap 'rm -f "${temp:-}"' RETURN
  {
    printf '%s\n' '// Generated atomically by scripts/sync-aibrush-vendor.sh. Do not edit by hand.'
    printf '%s\n' '// Stable inputs only: deliberately no timestamp, origin URL, or absolute host path.'
    printf '%s\n' 'export const GENERATED_AIBRUSH_VENDOR_PROVENANCE = {'
    printf '%s\n' '  formatVersion: 1,'
    printf "  dependency: 'file:../media',\n"
    printf "  packageVersion: '%s',\n" "$PACKAGE_VERSION"
    printf "  sourceRevision: '%s',\n" "$SOURCE_REVISION"
    printf "  sourceTreeDigest: '%s',\n" "$SOURCE_TREE_DIGEST"
    printf "  dirtyState: '%s',\n" "$DIRTY_STATE"
    printf '%s\n' '  buildFlags: ['
    local flag
    for flag in "${BUILD_FLAGS[@]}"; do printf "    '%s',\n" "$flag"; done
    printf '%s\n' '  ],'
    printf '%s\n' '  bundledWasmArtifacts: ['
    local row
    for row in "${WASM_ROWS[@]}"; do printf '%s\n' "$row"; done
    printf '%s\n' '  ],'
    printf '%s\n' '} as const;'
  } > "$temp"
  chmod 0644 "$temp"
  mv -f "$temp" "$PROVENANCE_OUT"
  trap - RETURN
}

capture_source_state
SOURCE_REVISION_BEFORE="$SOURCE_REVISION"
SOURCE_TREE_DIGEST_BEFORE="$SOURCE_TREE_DIGEST"
DIRTY_STATE_BEFORE="$DIRTY_STATE"

echo "[sync-vendor] source revision: $SOURCE_REVISION_BEFORE ($DIRTY_STATE_BEFORE)"
if [ "$REPRODUCIBLE" = true ] || is_truthy "${CI:-}"; then
  if [ "$DIRTY_STATE_BEFORE" != clean ] || [[ ! "$SOURCE_REVISION_BEFORE" =~ ^[0-9a-f]{40}$ ]]; then
    echo "[sync-vendor] ERROR: reproducible/CI sync requires a clean, labeled Git revision" >&2
    exit 1
  fi
fi

echo "[sync-vendor] building @aibrush/media and vendoring its external WASM artifacts"
( cd "$MEDIA" && bun run build && bun run vendor-wasm )

if [ "$(find -L "$MEDIA/dist" -type f -name '*.wasm' | wc -l | tr -d ' ')" -eq 0 ]; then
  echo "[sync-vendor] ERROR: built package contains no external *.wasm artifacts" >&2
  exit 1
fi

# Bun installs this file dependency as per-file symlinks. A single known link is not sufficient proof
# that the install follows the current build: a new export or content-hashed chunk has no pre-existing
# symlink. Compare the complete dist file set and force-refresh whenever it differs. The frozen lockfile
# and loopback-only registry keep this local sync offline.
INDEX_LINK="$(readlink "$INSTALLED/dist/index.js" 2>/dev/null || true)"
DIST_FILE_SET_MATCHES=false
if [ -d "$INSTALLED/dist" ] && diff -q \
  <(cd "$MEDIA/dist" && find . -type f -print | LC_ALL=C sort) \
  <(cd "$INSTALLED/dist" && find -L . -type f -print | LC_ALL=C sort) \
  >/dev/null; then
  DIST_FILE_SET_MATCHES=true
fi
if [[ "$INDEX_LINK" == "$MEDIA/dist/"* ]] && [ "$DIST_FILE_SET_MATCHES" = true ]; then
  echo "[sync-vendor] installed file dependency already follows the complete local dist"
else
  echo "[sync-vendor] refreshing the local file dependency with the frozen lockfile"
  ( cd "$HERE" && bun install --force --frozen-lockfile --ignore-scripts --registry=http://127.0.0.1:9 )
fi

for entry in index.js core.js image.js wav.js; do
  [ -f "$INSTALLED/dist/$entry" ] || {
    echo "[sync-vendor] ERROR: installed dist/$entry is missing" >&2
    exit 1
  }
done

PACKAGE_VERSION="$(package_version "$MEDIA/package.json")"
INSTALLED_VERSION="$(package_version "$INSTALLED/package.json")"
[[ "$PACKAGE_VERSION" =~ ^[0-9A-Za-z.+-]+$ ]] || {
  echo "[sync-vendor] ERROR: package version is not safe to persist" >&2
  exit 1
}
[ "$PACKAGE_VERSION" = "$INSTALLED_VERSION" ] || {
  echo "[sync-vendor] ERROR: source package $PACKAGE_VERSION != installed package $INSTALLED_VERSION" >&2
  exit 1
}

WASM_ROWS=()
while IFS= read -r artifact; do
  relative="${artifact#"$INSTALLED/"}"
  digest="$(sha256_file "$artifact")"
  [[ "$relative" =~ ^dist/[A-Za-z0-9._/-]+\.wasm$ ]] || {
    echo "[sync-vendor] ERROR: unsafe package-relative WASM path" >&2
    exit 1
  }
  [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || {
    echo "[sync-vendor] ERROR: invalid SHA-256 for $relative" >&2
    exit 1
  }
  WASM_ROWS+=("    { path: '$relative', sha256: '$digest' },")
done < <(find -L "$INSTALLED/dist" -type f -name '*.wasm' -print | LC_ALL=C sort)
[ "${#WASM_ROWS[@]}" -gt 0 ] || {
  echo "[sync-vendor] ERROR: installed package contains no external *.wasm artifacts" >&2
  exit 1
}

# Refuse to label artifacts if source changed concurrently while the build/install was running.
capture_source_state
if [ "$SOURCE_REVISION" != "$SOURCE_REVISION_BEFORE" ] || \
   [ "$SOURCE_TREE_DIGEST" != "$SOURCE_TREE_DIGEST_BEFORE" ] || \
   [ "$DIRTY_STATE" != "$DIRTY_STATE_BEFORE" ]; then
  echo "[sync-vendor] ERROR: media source changed during sync; rerun against a stable working tree" >&2
  exit 1
fi

write_provenance_atomically
echo "[sync-vendor] persisted deterministic provenance (${#WASM_ROWS[@]} external WASM artifacts)"
echo "[sync-vendor] done; restart the dev server or rebuild before running the matrix"
