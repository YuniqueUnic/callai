# Changelog

## [0.2.5](https://github.com/YuniqueUnic/callai/compare/v0.2.4...v0.2.5) (2026-07-12)


### Features

* **domain:** add portable built-in alarm binary for cross-platform execution ([368db2a](https://github.com/YuniqueUnic/callai/commit/368db2a9f1506dec0de3411016595b232559e4b2))
* **ui:** custom cross-platform titlebar + dark modal contrast ([685c6a8](https://github.com/YuniqueUnic/callai/commit/685c6a8f0a00d1e44cf1b163526a5d7cc5a38e34))


### Bug Fixes

* **drawer:** preserve rounded window when logs panel opens ([4dad919](https://github.com/YuniqueUnic/callai/commit/4dad9193973adbb42393877d66283a68194500df))
* **performance:** resolve UI switching lag through component keep-alive and caching ([368db2a](https://github.com/YuniqueUnic/callai/commit/368db2a9f1506dec0de3411016595b232559e4b2))
* **rust:** clippy needless_return in builtin_alarm ([919a24d](https://github.com/YuniqueUnic/callai/commit/919a24d304ed9c0cb42e8f679cc4dd0059ee5bba))
* **ui:** restore dark-mode contrast on modals and overlays ([409eb5f](https://github.com/YuniqueUnic/callai/commit/409eb5fdb069761062053d27ef002a1fbea28e52))
* **window:** implement transparent rounded window with clip-path ([4dad919](https://github.com/YuniqueUnic/callai/commit/4dad9193973adbb42393877d66283a68194500df))

## [0.2.4](https://github.com/YuniqueUnic/callai/compare/v0.2.3...v0.2.4) (2026-07-12)


### Features

* **autostart:** version-aware macOS login item via auto-launch 0.6 ([deb330a](https://github.com/YuniqueUnic/callai/commit/deb330ad8b8bcbfcc791b1e08d856ff4652539d7))


### Bug Fixes

* **ci:** gate macos_launcher behind target_os = macos ([5cf443f](https://github.com/YuniqueUnic/callai/commit/5cf443fd91ce06d930e2caf07dc749e86d0dc7bd))
* issues [#16](https://github.com/YuniqueUnic/callai/issues/16)–[#19](https://github.com/YuniqueUnic/callai/issues/19) version, dark UI, open backups, autostart ([4387e27](https://github.com/YuniqueUnic/callai/commit/4387e27ed36101c9a1450f3e595116793b8de414)), closes [#17](https://github.com/YuniqueUnic/callai/issues/17) [#18](https://github.com/YuniqueUnic/callai/issues/18)
* open backups dir from Rust (no opener path scope) ([8cf8cae](https://github.com/YuniqueUnic/callai/commit/8cf8cae756b47ee5d09c9f86ac137e85e12df011))

## [0.2.3](https://github.com/YuniqueUnic/callai/compare/v0.2.2...v0.2.3) (2026-07-12)


### Features

* **packaging:** scheduled sync from releases + tap/bucket mirrors ([862ecbb](https://github.com/YuniqueUnic/callai/commit/862ecbb994038aef3691bac066068a861b26d5c9))


### Bug Fixes

* **packaging:** mirror via per-repo SSH deploy keys ([b9077a2](https://github.com/YuniqueUnic/callai/commit/b9077a20d92ba133c10c30be98074cf861565d28))
* **schedule:** wall-clock TZ evaluation, weekly/monthly, TimezonePicker ([2c13cd8](https://github.com/YuniqueUnic/callai/commit/2c13cd8e6ff507bd97c01dccbffffd0c3fe97bf2))
* **ui:** float edit header like home-hero (sticky brand grid) ([ba4a286](https://github.com/YuniqueUnic/callai/commit/ba4a286b2eb4f091913240a9107210eade0375b5))

## [0.2.2](https://github.com/YuniqueUnic/callai/compare/v0.2.1...v0.2.2) (2026-07-12)


### Features

* **packaging:** add brew/scoop/winget manifests for GUI and CLI ([68aa339](https://github.com/YuniqueUnic/callai/commit/68aa33930554807cb85e3ab867f559b33de33284))
* procedural UI sounds with settings toggle ([21cbc43](https://github.com/YuniqueUnic/callai/commit/21cbc433cf45d4a093183c3e300e33cde4221115))


### Bug Fixes

* migrate sound_enabled on legacy DBs; strip UI hints; teach record 12 ([4c78016](https://github.com/YuniqueUnic/callai/commit/4c780168cc6e7da1733fa8b8894711a18dc66559))
* process timeout/cancel, env focus, log delete, CLI live output ([405cd74](https://github.com/YuniqueUnic/callai/commit/405cd74f81ed6b4cebd1ee494509343403b16471))
* shlex-parse shell-style args for osascript/say pastes ([4985a45](https://github.com/YuniqueUnic/callai/commit/4985a459746d0b63b3a7bf2c196b87ce2aafa476))
* **ui:** replace timeout segmented+input with DurationPicker ([e25d783](https://github.com/YuniqueUnic/callai/commit/e25d783c05723be5fa258b5f09cdb727f5d706f9))

## [0.2.1](https://github.com/YuniqueUnic/callai/compare/v0.2.0...v0.2.1) (2026-07-12)


### Features

* tauri auto-updater, install guide, optimized screenshots ([d8d9182](https://github.com/YuniqueUnic/callai/commit/d8d9182c89536066c27df1a961836139644741a1))

## [0.2.0](https://github.com/YuniqueUnic/callai/compare/v0.1.0...v0.2.0) (2026-07-11)


### ⚠ BREAKING CHANGES

* **cli:** The CLI behavior changes slightly as `daemon` command is introduced alongside the existing `run` command.

### Features

* add .gitignore and VS Code extensions config, update README with project details ([79dcbba](https://github.com/YuniqueUnic/callai/commit/79dcbba5f6c932b654e76e04f88a552c7281c32c))
* add brand assets and update development workflow with just commands ([263c12c](https://github.com/YuniqueUnic/callai/commit/263c12cae5bfcde3197268b859c9e1b7dc30e7cf))
* **backup:** add delete backup functionality with UI ([c5b6dc7](https://github.com/YuniqueUnic/callai/commit/c5b6dc761a1031959ec2ede594266190fdf79784))
* **brand:** update logo generation with Python tray template script ([e677adf](https://github.com/YuniqueUnic/callai/commit/e677adffb18bcb401d02617b052d793266c66947))
* **cli:** add CLI support with shared data backend ([21d13b4](https://github.com/YuniqueUnic/callai/commit/21d13b4720c7ec892e42889479345ec9f938479c))
* **cli:** add daemon command as alias for run command ([aaa486b](https://github.com/YuniqueUnic/callai/commit/aaa486b3dbcdf04595567baaa9ecb9fdfc57da24))
* **i18n:** add new translation keys for time picker and tray menu ([514c873](https://github.com/YuniqueUnic/callai/commit/514c873bb081833276e245ddc2e07a923852cd8b))
* **tray:** add macOS tray template icon support ([8e945a3](https://github.com/YuniqueUnic/callai/commit/8e945a3740be3a346bc1e395328e5f6b69ca234c))
* **ui:** replace Notification with custom toast component ([7d39013](https://github.com/YuniqueUnic/callai/commit/7d390136fd5cdeafb5ce90aae6a2e63a7dae60af))


### Bug Fixes

* **ci:** re-enable tauri-plugin-dialog default features for Linux rfd ([1e7423f](https://github.com/YuniqueUnic/callai/commit/1e7423fbd8ac5eb543415c8072653f8e7fdf4ffe))
* **ui:** drawer scroll, hide FAB over logs, vite 8 react plugin ([2b5c142](https://github.com/YuniqueUnic/callai/commit/2b5c142b14de4f3e7505a5004db1e8f5894ccca2))


### Performance Improvements

* **toast:** implement warm start for immediate visibility ([7d39013](https://github.com/YuniqueUnic/callai/commit/7d390136fd5cdeafb5ce90aae6a2e63a7dae60af))

## Changelog

All notable changes to this project will be documented in this file.
