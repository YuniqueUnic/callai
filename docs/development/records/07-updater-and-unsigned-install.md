# 07 · 自动更新与未签名安装说明

## 学员目标

- 接入 `tauri-plugin-updater`（检查 + 下载安装）  
- 配置 `createUpdaterArtifacts` + minisign 公钥  
- 写清 **未公证安装包** 的 macOS `xattr` / Windows SmartScreen 用法  

## 原始诉求（摘要）

> 使用 tauri-updater 支持自动更新；增强 README.zh / README，说明无签名程序如何用（xattr 等）；截图压缩后再增强 README。

## 关键提交

| Commit | 说明 |
| --- | --- |
| `d8d9182` | updater + 安装说明 + 优化截图 |

## 关键文件

- `src-tauri/tauri.conf.json` — `plugins.updater`、`bundle.createUpdaterArtifacts`  
- `src-tauri/src/lib.rs` — `.plugin(tauri_plugin_updater::…)`  
- `src-tauri/capabilities/default.json` — `updater:*`  
- `src/infra/updater.ts`、`src/pages/SettingsPage.tsx`  
- `.github/workflows/release.yml` — `TAURI_SIGNING_PRIVATE_KEY*`  
- README「Download & first launch」章节  

## 端点

```
https://github.com/YuniqueUnic/callai/releases/latest/download/latest.json
```

## 密钥操作（维护者）

```bash
bunx tauri signer generate -w .keys/callai.key -p ''
# 公钥写入 tauri.conf.json
# 私钥：gh secret set TAURI_SIGNING_PRIVATE_KEY < .keys/callai.key
# 切勿提交 .keys/*.key
```

## 用户侧首次打开

```bash
# macOS
xattr -dr com.apple.quarantine /Applications/callai.app
# 或
xattr -cr /Applications/callai.app
open /Applications/callai.app
```

Windows：SmartScreen → 更多信息 → 仍要运行。  
Linux：`chmod +x` AppImage。

## 教学讨论

- **代码签名 / 公证** vs **updater minisign**：解决的是不同信任问题。  
- 无 Apple 公证时，文档必须诚实，否则支持成本会爆炸。  

## 练习

1. 在 Settings 走一遍「检查更新」状态机：unsupported / upToDate / available / error。  
2. 说明为何 `latest.json` 挂在 GitHub Releases 即可跨平台更新。
