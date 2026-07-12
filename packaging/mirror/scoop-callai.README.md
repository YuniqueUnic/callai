# scoop-callai

Scoop bucket for **callai** (layout mirror for easy install).

**Source of truth:** [`YuniqueUnic/callai`](https://github.com/YuniqueUnic/callai) → `packaging/scoop/bucket/`.  
Do not hand-edit version/hash here — change the monorepo and let **Packaging sync** refresh this bucket.

## Install

```powershell
scoop bucket add callai https://github.com/YuniqueUnic/scoop-callai
scoop install callai       # GUI
scoop install callai-cli   # CLI
```

## Why a separate repo?

Scoop expects JSON manifests at the **bucket root**.  
callai keeps them under `packaging/scoop/bucket/` for monorepo hygiene; this repo is a thin mirror for `scoop bucket add`.
