# homebrew-callai

Homebrew tap for **callai** (layout mirror for easy install).

**Source of truth:** [`YuniqueUnic/callai`](https://github.com/YuniqueUnic/callai) → `packaging/homebrew/`.  
Do not hand-edit version/hash here — change the monorepo and let **Packaging sync** refresh this tap.

## Install

```bash
brew tap YuniqueUnic/homebrew-callai
brew install --cask callai-app   # GUI
brew install callai             # CLI
```

## Why a separate repo?

Homebrew expects `Casks/` and `Formula/` at the **tap repository root**.  
callai keeps manifests under `packaging/homebrew/` so the app monorepo stays clean; this repo is a thin mirror for `brew tap`.
