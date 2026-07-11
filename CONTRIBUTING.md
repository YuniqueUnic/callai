# Contributing to callai

Thanks for helping keep this cozy AI alarm useful.

## Ground rules

- Prefer small, reviewable PRs with a clear problem statement.
- Use [Conventional Commits](https://www.conventionalcommits.org/) so [release-please](https://github.com/googleapis/release-please) can bump versions correctly:
  - `feat:` new user-facing capability
  - `fix:` bug fix
  - `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `style:` as appropriate
- Keep architecture layers clean:
  - UI observes state and expresses intent only
  - domain logic stays pure and framework-free
  - infrastructure owns SQLite, process exec, TOML, scheduler I/O
- Do not leave compatibility glue for removed code paths unless the task explicitly requires migration.

## Development setup

Requirements:

- [Bun](https://bun.sh/)
- Rust stable (`rustfmt`, `clippy`)
- [just](https://github.com/casey/just) (recommended)
- platform GUI deps for Tauri (macOS/Windows/Linux)

```bash
just setup
just dev        # desktop app
just dev-web    # frontend mock only
just --list
```

Useful gates before opening a PR:

```bash
./scripts/check_versions.sh
just gate
# or
just ci
```

`just gate` / CI cover:

- version sync (`package.json` / `tauri.conf.json` / `Cargo.toml`)
- `bun` typecheck / tests / build
- `cargo fmt` / `test --lib` / `clippy -D warnings`
- CLI release binary smoke (`--help`, `list`)

## Project layout

```
src/                 # React UI + frontend domain + Tauri bridge
src-tauri/           # Rust domain / app / infra / Tauri commands / CLI
scripts/             # brand tooling, version checks, helpers
usecases/            # product scenarios
.github/workflows/   # CI + release-please + multi-platform publish
```

## UI / brand notes

- Visual language is Animal Crossing–inspired via `animal-island-ui`.
- Do not switch design systems casually; polish within the existing cozy style.
- Brand regeneration:

```bash
just brand
just brand-check
```

Tray template icons:

```bash
python3 scripts/brand/make_tray_template.py --help
# typically invoked through just brand-logo / brand pipeline
```

## Tests

- Frontend: Vitest (`bun test`)
- Rust: tests live under `src-tauri/src/tests/**` (mirrored layout; avoid inline `#[cfg(test)]` modules in production modules when possible)
- Prefer pure domain unit tests; isolate process/SQLite/time at boundaries

## Pull requests

1. Branch from `main`.
2. Keep commits conventional and focused.
3. Ensure local gate is green.
4. Describe user-visible behavior, risk, and how you verified.
5. Screenshots / short clips help for UI changes.

## Releases

- Do **not** hand-edit version numbers across files for a release.
- Push Conventional Commits to `main`; release-please opens a Release PR.
- Merging that PR creates the tag/GitHub Release and triggers multi-platform Tauri + CLI builds.
- Version sources that must stay aligned:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
  - `.release-please-manifest.json`

## License

By contributing, you agree that your contributions are licensed under the MIT License in `LICENSE`, subject to the third-party notice about `animal-island-ui` (CC BY-NC 4.0). Do not introduce dependencies that block personal/non-commercial use without calling it out in the PR.

## Code of conduct

Be kind, assume good intent, and keep discussion technical and constructive. Harassment or personal attacks are not welcome.
