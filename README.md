

<p align="center">
<table align="center">
<tr>
<td width="160" align="center" valign="middle">
  <img src="docs/assets/callai-logo.png" alt="callai logo" width="128" />
</td>
<td align="left" valign="middle">
  <h1>callai</h1>
  <p>
    <strong>Ciallo～(∠・ω&lt; )</strong><br />
    A cozy desktop + CLI scheduler for AI windows — and any geeky timed tasks.
  </p>
</td>
</tr>
</table>
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
  <img src="https://img.shields.io/badge/version-0.2.2?logo=github" alt="version 0.2.1" /><!-- x-release-please-version -->
  <img src="https://img.shields.io/badge/Tauri-2-ffc131?logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/Rust-stable-dea584?logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Bun-React-fbf0df?logo=bun&logoColor=black" alt="Bun React" />
</p>

---

## Demo

<p align="center">
  <img src="docs/assets/screenshot/record-preview.webp" alt="callai demo preview" width="320" />
</p>

<p align="center">
  <em>1.4× speed preview</em> ·
  <a href="docs/assets/screenshot/record-preview.gif">GIF</a> ·
  <a href="docs/assets/screenshot/record.mp4">full MP4</a> ·
  <a href="docs/assets/screenshot/record.webp">full WebP</a>
</p>

### Screenshots

<table>
<tr>
  <td align="center" width="25%"><b>Alarms</b></td>
  <td align="center" width="25%"><b>New alarm</b></td>
  <td align="center" width="25%"><b>Logs</b></td>
  <td align="center" width="25%"><b>Settings</b></td>
</tr>
<tr>
  <td align="center" width="25%"><img src="docs/assets/screenshot/alarms.webp" alt="alarms" width="180" /></td>
  <td align="center" width="25%"><img src="docs/assets/screenshot/new-alarm.webp" alt="new alarm" width="180" /></td>
  <td align="center" width="25%"><img src="docs/assets/screenshot/logs.webp" alt="logs" width="180" /></td>
  <td align="center" width="25%"><img src="docs/assets/screenshot/settings.webp" alt="settings" width="180" /></td>
</tr>
</table>



## Install

### Package managers (GUI + CLI)

| Manager | GUI | CLI |
| --- | --- | --- |
| Homebrew | `brew tap YuniqueUnic/callai && brew install --cask callai-app` | `brew tap YuniqueUnic/callai && brew install callai` |
| Scoop | `scoop bucket add callai https://github.com/YuniqueUnic/scoop-callai && scoop install callai` | `scoop bucket add callai https://github.com/YuniqueUnic/scoop-callai && scoop install callai-cli` |
| winget | community PR (GUI only; one app per PR) → then `winget install YuniqueUnic.Callai` · local: `winget install --manifest packaging/winget/manifests/y/YuniqueUnic/Callai/0.2.1` | separate PR for CLI → `winget install YuniqueUnic.Callai.CLI` · local: `--manifest .../Callai.CLI/0.2.1` |

Full matrix, refresh scripts, and upstream submission notes: **[packaging/README.md](./packaging/README.md)**.

```bash
# refresh manifests after a GitHub Release
./packaging/scripts/generate_from_release.sh v0.2.1
just packaging-validate
```

### Direct downloads

Grab installers / CLI binaries from [Releases](https://github.com/YuniqueUnic/callai/releases).

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


## Recipes (beyond AI windows)

**callai** started as a gentle **AI rolling-window warmer**, but under the hood it is a **lightweight, cross-platform task trigger**: pick a time, run any binary/script, keep logs, retry, timeout, and cancel. Prefer that over fighting `crontab` syntax or the heavy Windows Task Scheduler UI.

> Set **timeout** (default 20s) for interactive tools like dialogs / `say` — otherwise a modal can block forever.
>
> **Args parsing:** paste shell-style lines (e.g. `-e 'display dialog "hi"'`) — callai splits them with [`shlex`](https://docs.rs/shlex) before spawn, so outer quotes are not sent to the program.

### 1) AI usage window (the original job)

| Field | Example |
| --- | --- |
| Binary | `codex` / `claude` / `echo` |
| Args | `exec` + `hi` · or `-p` + `hi` · or `callai warmup {{date}}` |
| Schedule | Daily `08:00`, `13:00`, `18:00` |
| Timeout | `30`–`120` s if the CLI is slow |

```bash
# headless smoke
callai run-once morning-warmup
callai list
callai daemon   # keep scheduler alive without GUI
```

### 2) Force-break dialogs (workflow interrupt)

**macOS** — system dialog (needs a real desktop session; set timeout ≥ 60s or click it):

```bash
osascript -e 'display dialog "已经连续写代码 2 小时了，喝口水？" buttons {"已喝", "等会"} default button 1 with icon caution'
```

In callai: binary `osascript`, one arg per line:

```text
-e
display dialog "已经连续写代码 2 小时了，喝口水？" buttons {"已喝", "等会"} default button 1 with icon caution
```

**Linux** — Zenity:

```bash
zenity --question --text="写了这么久，要不要强行锁屏休息 5 分钟？" --ok-label="锁屏" --cancel-label="继续卷"
```

### 3) Voice / media alarms

**macOS speak:**

```bash
say -v Mei-Jia "主人，你关注的股票好像跌惨了，快去看看吧"
```

**Play a file:**

```bash
# macOS
afplay ~/Music/evangelion_warning.mp3
# Linux
aplay ~/Music/alarm.wav
# or
ffplay -nodisp -autoexit ~/Music/alarm.wav
```

### 4) Focus / end-of-day automation

**macOS Shortcuts:**

```bash
shortcuts run "开启下班摸鱼模式"
```

Schedule at 18:30 — your Shortcut can close the IDE, open music, dim the display, etc.

### 5) Quiet background automation

**Silent git pull** (every 30 min via cron expression, or a few fixed times):

```bash
bash
-lc
cd ~/Projects/my-main-repo && git pull --ff-only origin main
```

**Local health check + notification:**

```bash
bash
-lc
curl -sf http://localhost:8080/health || osascript -e 'display notification "本地服务挂了！" with title "callai"'
```

### Tips

- Prefer **absolute paths** or tools on `PATH` (`which codex`, `which say`).
- Long interactive jobs: raise **timeout**, or use **Stop** from the UI / `Ctrl+C` on `run-once`.
- Failed runs can send a **system notification** (Settings → notify on failure).
- Desktop and CLI share `~/.config/callai` + `~/.local/share/callai`.

## Features

| | Feature | Notes |
| :---: | --- | --- |
| <img src="docs/assets/elements/create-alarm.png" height="48" alt="create" /> | **Alarm = task** | Create an alarm and configure binary, args, schedule in one flow |
| <img src="docs/assets/elements/set-time.png" height="48" alt="schedule" /> | **Cozy schedules** | Human-friendly times + cron-style rules |
| <img src="docs/assets/elements/running.png" height="48" alt="run" /> | **Desktop + CLI** | Tauri app and headless `run` / `daemon` share the same data |
| <img src="docs/assets/elements/theme-light.png" height="48" alt="theme" /> | **Theme + i18n** | Light / dark / system · zh-CN + en |
| <img src="docs/assets/elements/logs-clipboard.png" height="48" alt="logs" /> | **Logs & retries** | Local history, soft retries, failure notifications |
| <img src="docs/assets/elements/notify-badge.png" height="48" alt="tray" /> | **Tray native** | macOS template tray icon (light/dark adaptive) |
| <img src="docs/assets/elements/sync-refresh.png" height="48" alt="updater" /> | **Auto-update** | Tauri updater via GitHub Releases (`latest.json`) |
| <img src="docs/assets/elements/multi-device.png" height="48" alt="cross platform" /> | **Cross-platform** | macOS · Windows · Linux builds via CI |

## Download & first launch (unsigned builds)

Official installers on [Releases](https://github.com/YuniqueUnic/callai/releases) are **not Apple/Microsoft notarized** (open-source self-signed updater key only). Gatekeeper / SmartScreen may warn — that is expected.

### macOS

```bash
# after dragging callai.app into Applications:
xattr -dr com.apple.quarantine /Applications/callai.app
# or (broader clear of extended attributes):
xattr -cr /Applications/callai.app
open /Applications/callai.app
```

If macOS still blocks: **Right-click → Open** once, or **System Settings → Privacy & Security → Open Anyway**.

### Windows

1. Run the `.msi` or `-setup.exe` from Releases  
2. If SmartScreen appears: **More info → Run anyway**

### Linux

```bash
chmod +x callai_*.AppImage
./callai_*.AppImage
# or install the .deb / .rpm from Releases
```

### CLI

Same release page ships `callai-cli-*` binaries for headless `run` / `daemon` without the GUI.

## Auto-update

Desktop builds include **tauri-plugin-updater**:

- Endpoint: `https://github.com/YuniqueUnic/callai/releases/latest/download/latest.json`
- Packages are minisign-signed; the public key is embedded in `src-tauri/tauri.conf.json`
- In-app: **Settings → Check for updates**

Maintainers: set GitHub Actions secrets `TAURI_SIGNING_PRIVATE_KEY` (and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) so release CI can sign updater artifacts. Never commit the private key (see `.keys/` locally, gitignored).

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | TypeScript · React · Vite 8 · Bun · [animal-island-ui](https://github.com/guokaigdg/animal-island-ui) |
| Shell | Tauri 2 (+ updater) |
| Core | Rust (`domain` / `app` / `infra`) |
| Storage | SQLite + `config.toml` backups |
| Release | release-please (semver) + GitHub Actions multi-platform build |

**Current version:** `0.2.2` <!-- x-release-please-version -->

## Quick start (dev)

```bash
# prerequisites: bun, rustup stable, just (optional)
just setup
just dev          # desktop
just dev-web      # frontend mock only
```

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

Dependency rule: **UI → domain ← infra**. Domain stays free of React, HTTP, and filesystem details.

## Quality gates

```bash
./scripts/check_versions.sh
just gate
# or
just ci
```

## CI / CD & versioning

- **CI** (`.github/workflows/ci.yml`) — every push/PR to `main`
- **Release** (`.github/workflows/release.yml`) — release-please opens a Release PR; merge creates the tag/GitHub Release and builds desktop + CLI (+ updater `.sig` / `latest.json` when signing secrets exist)

Version sources (must stay identical):

| File | Field |
| --- | --- |
| `package.json` | `version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `package.version` |
| `.release-please-manifest.json` | `"."` |
| `README.md` / `README.zh.md` | version badges + **Current version** (`x-release-please-version`) |

Commit style: [Conventional Commits](https://www.conventionalcommits.org/).

## Brand / screenshot tooling

```bash
just brand
just brand-check
python3 scripts/brand/make_tray_template.py --help
./scripts/media/optimize_screenshots.sh   # PNG/WebP + 1.4× demo video
```

## Docs
- [Development records (teaching)](./docs/development/README.md) — AI coding 实战过程

- [PRODUCT.md](./PRODUCT.md) · [DESIGN.md](./DESIGN.md) · [usecases/](./usecases/)
- [CONTRIBUTING.md](./CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) · [SECURITY.md](./SECURITY.md)

## Links

- [Homebrew tap](https://github.com/YuniqueUnic/homebrew-callai)
- [Scoop bucket](https://github.com/YuniqueUnic/scoop-callai)
- [winget GUI PR](https://github.com/microsoft/winget-pkgs/pull/401366) · [winget CLI PR](https://github.com/microsoft/winget-pkgs/pull/401367)
- [GitHub](https://github.com/YuniqueUnic/callai)
- [Releases](https://github.com/YuniqueUnic/callai/releases)
- [LinuxDo](https://linux.do)
- [animal-island-ui](https://github.com/guokaigdg/animal-island-ui)
- [Development records](./docs/development/README.md)

## License

- Application source: [MIT](./LICENSE)
- UI kit: [`animal-island-ui`](https://github.com/guokaigdg/animal-island-ui) is **CC BY-NC 4.0** (non-commercial). Personal use is fine; commercial redistribution needs a different UI stack or permission. See `LICENSE`.

---

<p align="center">
  <img src="docs/assets/elements/hero-perch.png" height="56" alt="bye bird" />
  <br />
  <em>Ciallo～(∠・ω&lt; ) — keep your AI windows warm.</em>
</p>
