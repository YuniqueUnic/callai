<p align="center">
  <img src="docs/assets/callai-logo.png" alt="callai logo" width="144" />
</p>

<h1 align="center">callai</h1>

<p align="center">
  <strong>Ciallo～(∠・ω&lt; )</strong><br />
  A cozy desktop + CLI alarm that warms AI usage windows.
</p>

<p align="center">
  <img src="docs/assets/elements/hero-perch.png" alt="hero bird" height="72" />
  &nbsp;
  <img src="docs/assets/elements/sprout-fresh.png" alt="fresh sprout" height="72" />
  &nbsp;
  <img src="docs/assets/elements/running.png" alt="running task" height="72" />
  &nbsp;
  <img src="docs/assets/elements/success-check.png" alt="success" height="72" />
</p>

<p align="center">
  <a href="./README.zh.md">中文文档</a>
  ·
  <a href="https://github.com/YuniqueUnic/callai/releases">Releases</a>
  ·
  <a href="./CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://github.com/YuniqueUnic/callai/actions/workflows/ci.yml"><img src="https://github.com/YuniqueUnic/callai/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/YuniqueUnic/callai/actions/workflows/release.yml"><img src="https://github.com/YuniqueUnic/callai/actions/workflows/release.yml/badge.svg" alt="Release" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/version-0.2.0-88c0d0?logo=github" alt="version 0.2.0" /><!-- x-release-please-version -->
  <img src="https://img.shields.io/badge/Tauri-2-ffc131?logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/Rust-stable-dea584?logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Bun-React-fbf0df?logo=bun&logoColor=black" alt="Bun React" />
</p>

---

## Why callai?

<p align="center">
  <img src="docs/assets/elements/paused-sleep.png" alt="waiting" height="88" />
  &nbsp;&nbsp;→&nbsp;&nbsp;
  <img src="docs/assets/elements/set-time.png" alt="set alarm" height="88" />
  &nbsp;&nbsp;→&nbsp;&nbsp;
  <img src="docs/assets/elements/sprout-fresh.png" alt="fresh window" height="88" />
</p>

Claude, ChatGPT, Codex, and friends often use **rolling usage windows**. A common pain:

> You start heavy AI work at 09:30, burn the window by noon, then wait half the afternoon for capacity to slide back.

**callai** is a tiny, Animal Crossing–inspired alarm: schedule lightweight tasks (`echo hi`, `codex exec hi`, …) so the rolling window starts earlier and stays fresher during your real work hours.

Recommended cadence: a few gentle pings per day (for example 08:00 / 13:00 / 18:00).

## Features

| | Feature | Notes |
| :---: | --- | --- |
| <img src="docs/assets/elements/create-alarm.png" height="48" alt="create" /> | **Alarm = task** | Create an alarm and configure binary, args, schedule in one flow |
| <img src="docs/assets/elements/set-time.png" height="48" alt="schedule" /> | **Cozy schedules** | Human-friendly times + cron-style rules |
| <img src="docs/assets/elements/running.png" height="48" alt="run" /> | **Desktop + CLI** | Tauri app and headless `run` / `daemon` share the same data |
| <img src="docs/assets/elements/theme-light.png" height="48" alt="theme" /> | **Theme + i18n** | Light / dark / system · zh-CN + en |
| <img src="docs/assets/elements/logs-clipboard.png" height="48" alt="logs" /> | **Logs & retries** | Local history, soft retries, failure notifications |
| <img src="docs/assets/elements/notify-badge.png" height="48" alt="tray" /> | **Tray native** | macOS template tray icon (light/dark adaptive) |
| <img src="docs/assets/elements/multi-device.png" height="48" alt="cross platform" /> | **Cross-platform** | macOS · Windows · Linux builds via CI |

## Island stickers

These are the same cutouts used inside the app UI (from `callai.elements.png`):

<p align="center">
  <img src="docs/assets/elements/hero-perch.png" height="64" alt="hero-perch" />
  <img src="docs/assets/elements/create-alarm.png" height="64" alt="create-alarm" />
  <img src="docs/assets/elements/set-time.png" height="64" alt="set-time" />
  <img src="docs/assets/elements/task-checklist.png" height="64" alt="task-checklist" />
  <img src="docs/assets/elements/running.png" height="64" alt="running" />
  <img src="docs/assets/elements/sprout-fresh.png" height="64" alt="sprout-fresh" />
  <img src="docs/assets/elements/theme-light.png" height="64" alt="theme-light" />
  <img src="docs/assets/elements/theme-dark.png" height="64" alt="theme-dark" />
  <img src="docs/assets/elements/success-check.png" height="64" alt="success-check" />
  <img src="docs/assets/elements/logs-clipboard.png" height="64" alt="logs-clipboard" />
  <img src="docs/assets/elements/notify-badge.png" height="64" alt="notify-badge" />
  <img src="docs/assets/elements/multi-device.png" height="64" alt="multi-device" />
</p>

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | TypeScript · React · Vite 8 · Bun · [animal-island-ui](https://github.com/guokaigdg/animal-island-ui) |
| Shell | Tauri 2 |
| Core | Rust (`domain` / `app` / `infra`) |
| Storage | SQLite + `config.toml` backups |
| Release | release-please (semver) + GitHub Actions multi-platform build |

**Current version:** `0.2.0` <!-- x-release-please-version -->

## Quick start

```bash
# prerequisites: bun, rustup stable, just (optional)
just setup
just dev          # desktop
just dev-web      # frontend mock only
```

Raw commands:

```bash
bun install
bun run tauri dev
```

### CLI (shares GUI data)

```bash
cargo build --manifest-path src-tauri/Cargo.toml
./src-tauri/target/debug/callai list
./src-tauri/target/debug/callai run                 # headless scheduler keepalive
./src-tauri/target/debug/callai daemon              # alias of run
./src-tauri/target/debug/callai run-once <name|id>
./src-tauri/target/debug/callai validate
./src-tauri/target/debug/callai app                 # force GUI
```

Or via just: `just cli-list`, `just cli-run`, `just cli-validate`, …

### Data locations

| Kind | Path |
| --- | --- |
| Config | `~/.config/callai/config.toml` |
| Backups | `~/.config/callai/backups/` (max 10) |
| Database | `~/.local/share/callai/callai.db` |

## Architecture (short)

```
src/                 # UI + frontend domain + Tauri bridge
src-tauri/
  src/domain/        # pure Rust rules
  src/app/           # use-cases + ports
  src/infra/         # sqlite / process / toml / scheduler
  src/commands.rs    # Tauri commands + CLI entry
```

Dependency rule: **UI → domain ← infra** (ports / DI). Domain stays free of React, HTTP, and filesystem details.

## Quality gates

```bash
./scripts/check_versions.sh
just gate
# or
just ci
```

Gate covers version sync (including README markers), typecheck, frontend tests/build, `cargo fmt` / `test --lib` / `clippy -D warnings`, CLI smoke.

## CI / CD & versioning

- **CI** (`.github/workflows/ci.yml`) — every push/PR to `main`
- **Release** (`.github/workflows/release.yml`) — [release-please](https://github.com/googleapis/release-please) opens a Release PR from Conventional Commits; merge creates the tag/GitHub Release and builds:
  - Desktop: macOS arm64/x64, Linux, Windows ([tauri-action](https://github.com/tauri-apps/tauri-action))
  - CLI: same matrix as `callai-cli-<target>`

Version sources (must stay identical; release-please updates them):

| File | Field |
| --- | --- |
| `package.json` | `version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `package.version` |
| `.release-please-manifest.json` | `"."` |
| `README.md` / `README.zh.md` | version badges + **Current version** lines (`x-release-please-version`) |

Commit style: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, …).

## Brand tooling

```bash
just brand          # regenerate icons + element slices
just brand-logo
just brand-elements
just brand-check
python3 scripts/brand/make_tray_template.py --help
```

Tray templates are pure black + alpha silhouettes for macOS light/dark menu bars.

## Docs

- [PRODUCT.md](./PRODUCT.md) — product intent
- [DESIGN.md](./DESIGN.md) — interaction / structure
- [usecases/](./usecases/) — scenarios
- [CONTRIBUTING.md](./CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) · [SECURITY.md](./SECURITY.md)

## License

- Application source: [MIT](./LICENSE)
- UI kit dependency: [`animal-island-ui`](https://github.com/guokaigdg/animal-island-ui) is **CC BY-NC 4.0** (non-commercial). Personal / non-commercial use of callai is fine; commercial redistribution requires replacing that UI stack or obtaining permission. See the third-party notice in `LICENSE`.

---

<p align="center">
  <img src="docs/assets/elements/hero-perch.png" height="56" alt="bye bird" />
  <br />
  <em>Ciallo～(∠・ω&lt; ) — keep your AI windows warm.</em>
</p>
