# callai development recipes
# Usage: just <recipe>
# List:  just --list

set shell := ["zsh", "-cu"]
set dotenv-load := false

root := justfile_directory()
tauri_manifest := root / "src-tauri" / "Cargo.toml"
tauri_dir := root / "src-tauri"

# Default: show available recipes
default:
    @just --list

# ── Setup ──────────────────────────────────────────────────────────

# Install JS/TS dependencies (bun)
install:
    bun install

# Install frontend deps + fetch Rust crates
setup: install
    cargo fetch --manifest-path {{tauri_manifest}}

# ── Dev ────────────────────────────────────────────────────────────

# Desktop app (Tauri + Vite)
dev:
    bun run tauri dev

# Frontend only (browser mock API, port 1420)
dev-web:
    bun run dev

# Vite production preview (requires build first)
preview: build-web
    bun run preview

# ── Build ──────────────────────────────────────────────────────────

# Frontend typecheck + vite build
build-web:
    bun run build

# Frontend typecheck only
typecheck:
    bun run typecheck

# Tauri release bundle (all platforms targets as configured)
build:
    bun run tauri build

# Tauri debug build (faster than release)
build-debug:
    bun run tauri build -- --debug

# Rust check only (no full Tauri bundle)
check-rs:
    cargo check --manifest-path {{tauri_manifest}} --all-targets --all-features

# ── Test ───────────────────────────────────────────────────────────

# Frontend unit tests (vitest)
test-web:
    bun test

# Frontend tests in watch mode
test-web-watch:
    bun run test:watch

# Rust lib tests
test-rs:
    cargo test --manifest-path {{tauri_manifest}} --lib

# Rust all tests (lib + bins if any)
test-rs-all:
    cargo test --manifest-path {{tauri_manifest}} --all-targets --all-features

# Frontend + Rust tests
test: test-web test-rs

# ── Lint / Format ──────────────────────────────────────────────────

# Format Rust (cargo fmt)
fmt:
    cargo fmt --manifest-path {{tauri_manifest}} --all

# Check Rust formatting without writing
fmt-check:
    cargo fmt --manifest-path {{tauri_manifest}} --all -- --check

# Clippy with warnings denied
clippy:
    cargo clippy --manifest-path {{tauri_manifest}} --all-targets --all-features -- -D warnings

# Auto-fix some clippy suggestions (allow dirty tree)
clippy-fix:
    cargo clippy --fix --tests --allow-dirty --manifest-path {{tauri_manifest}} --all-targets --all-features -- -D warnings

# Frontend typecheck + Rust fmt/clippy
lint: typecheck fmt-check clippy

# ── Quality gate (CI-ish local) ────────────────────────────────────

# Full local gate: fmt, typecheck, tests, clippy, web build
gate: fmt typecheck test clippy build-web
    @echo "✅ callai gate passed"

# Gate without formatting writes (check-only)
gate-check: fmt-check typecheck test clippy build-web
    @echo "✅ callai gate-check passed"

# ── Tauri helpers ──────────────────────────────────────────────────

# Forward arbitrary tauri CLI args, e.g. `just tauri info`
tauri *args:
    bun run tauri {{args}}

# Show Tauri / env info
info:
    bun run tauri info

# ── Rust helpers ───────────────────────────────────────────────────

# Forward cargo with project manifest, e.g. `just cargo tree -d`
cargo *args:
    cargo {{args}} --manifest-path {{tauri_manifest}}

# Update Rust dependencies (Cargo.lock)
update-rs:
    cargo update --manifest-path {{tauri_manifest}}

# ── Data / cleanup ─────────────────────────────────────────────────

# Show callai local data & config paths
paths:
    #!/usr/bin/env zsh
    set -euo pipefail
    echo "config: ${XDG_CONFIG_HOME:-$HOME/.config}/callai"
    echo "data:   ${XDG_DATA_HOME:-$HOME/.local/share}/callai"
    if [[ "$(uname -s)" == "Darwin" ]]; then
      echo "macOS data may also use: $HOME/Library/Application Support/callai"
    fi
    echo "repo:   {{root}}"

# Remove frontend build artifacts
clean-web:
    rm -rf {{root}}/dist

# Remove Rust/Tauri target dir
clean-rs:
    cargo clean --manifest-path {{tauri_manifest}}

# Remove node_modules, dist, and Rust target
clean: clean-web clean-rs
    rm -rf {{root}}/node_modules

# Open local data dir (macOS / Linux)
open-data:
    #!/usr/bin/env zsh
    set -euo pipefail
    if [[ "$(uname -s)" == "Darwin" ]]; then
      dir="$HOME/Library/Application Support/com.yunxuan.callai"
      [[ -d "$dir" ]] || dir="${XDG_DATA_HOME:-$HOME/.local/share}/callai"
      open "$dir" 2>/dev/null || mkdir -p "$dir" && open "$dir"
    else
      dir="${XDG_DATA_HOME:-$HOME/.local/share}/callai"
      mkdir -p "$dir"
      xdg-open "$dir" 2>/dev/null || echo "$dir"
    fi

# Open local config dir
open-config:
    #!/usr/bin/env zsh
    set -euo pipefail
    dir="${XDG_CONFIG_HOME:-$HOME/.config}/callai"
    mkdir -p "$dir"
    if [[ "$(uname -s)" == "Darwin" ]]; then
      open "$dir"
    else
      xdg-open "$dir" 2>/dev/null || echo "$dir"
    fi

# ── Docs ───────────────────────────────────────────────────────────

# Print common commands cheat-sheet
help:
    @echo "callai just recipes"
    @echo ""
    @echo "  just setup          install bun deps + fetch crates"
    @echo "  just dev            Tauri desktop dev"
    @echo "  just dev-web        Vite browser mock"
    @echo "  just test           web + rust tests"
    @echo "  just gate           full local quality gate"
    @echo "  just build          Tauri release bundle"
    @echo "  just clippy         rust clippy -D warnings"
    @echo "  just paths          show config/data locations"
    @echo "  just brand          regenerate logo + element UI assets"
    @echo "  just brand-qa       background residue QA"
    @echo "  just cli-list       CLI: list alarms"
    @echo "  just cli-run        CLI: headless scheduler"
    @echo ""
    @echo "Run \`just --list\` for the full recipe list."


# ── Brand / UI assets ──────────────────────────────────────────────

# Full brand pipeline: logo icons + element slices + UI module
brand:
    ./scripts/brand/generate_all.sh

# Only app / tray / favicon icons from callai.logo.png
brand-logo:
    ./scripts/brand/generate_logo_icons.sh

# Only element sheet slice + catalog + index.ts
brand-elements:
    ./scripts/brand/slice_elements.sh
    ./scripts/brand/generate_ui_module.sh

# Regenerate only the TS module from existing catalog
brand-ui-module:
    ./scripts/brand/generate_ui_module.sh

# Verify generated brand files exist
brand-check:
    ./scripts/brand/check.sh

# Background residue / grayscale QA for logo + elements
brand-qa:
    ./scripts/brand/qa_background.sh


# ── CLI (headless, DESIGN.md) ──────────────────────────────────────

# Build debug callai binary (GUI + CLI)
cli-build:
    cargo build --manifest-path {{tauri_manifest}}

# List alarms
cli-list: cli-build
    ./src-tauri/target/debug/callai list

# Start headless scheduler (keep-alive)
cli-run: cli-build
    ./src-tauri/target/debug/callai run

# Alias: headless daemon keep-alive
cli-daemon: cli-build
    ./src-tauri/target/debug/callai daemon

# Run one alarm by name/id: just cli-run-once morning-warmup
cli-run-once name: cli-build
    ./src-tauri/target/debug/callai run-once {{name}}

# Validate config.toml
cli-validate: cli-build
    ./src-tauri/target/debug/callai validate

# Write callai.example.toml
cli-example: cli-build
    ./src-tauri/target/debug/callai generate-example --out callai.example.toml


# ── Version / CI helpers ───────────────────────────────────────────

# Ensure package.json / tauri.conf / Cargo.toml versions match
check-versions:
    ./scripts/check_versions.sh

# Local CI-ish gate + version check
ci: check-versions gate

# Optimize README screenshots + demo video (1.4x)
optimize-screenshots:
    ./scripts/media/optimize_screenshots.sh

# Fail if original screenshot sources are staged/tracked
check-media:
    ./scripts/media/check_no_originals.sh

# Validate Homebrew/Scoop/winget manifests
packaging-validate:
    ./packaging/scripts/validate_manifests.sh

# Regenerate package manifests from a GitHub release tag (e.g. v0.2.1)
packaging-generate tag:
    ./packaging/scripts/generate_from_release.sh {{tag}}
    ./packaging/scripts/validate_manifests.sh

