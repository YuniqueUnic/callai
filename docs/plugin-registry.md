# callai Plugin Registry (marketplace prep)

## Index format (`registry.json`)

```json
{
  "schema": 1,
  "name": "my-registry",
  "updated_at": "2026-07-16T00:00:00Z",
  "plugins": [
    {
      "id": "cool-timer",
      "name": "Cool Timer",
      "version": "1.0.0",
      "description": "…",
      "author": "you",
      "zip_url": "https://…/cool-timer.zip",
      "homepage": "https://…",
      "repository": "https://github.com/…",
      "tags": ["timer"]
    }
  ]
}
```

- `zip_url` must be **https** (or localhost for dev).
- Zip layout: see package format in `src-tauri/src/infra/plugin/package.rs` / record 17.

## Hosting on GitHub

1. Create repo e.g. `callai-plugin-registry`.
2. Put `registry.json` on `main`.
3. Release plugin zips (or commit under `packages/`).
4. Point the app registry URL to:
   `https://raw.githubusercontent.com/<user>/<repo>/main/registry.json`

Default URL constant: `DEFAULT_PLUGIN_REGISTRY_URL` in `domain/plugin_registry.rs`.

## App commands

- `fetch_plugin_registry(url?)` → index
- `import_plugin_zip_url(url, conflict?)` → install package
