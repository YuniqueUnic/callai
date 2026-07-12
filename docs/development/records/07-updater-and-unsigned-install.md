# 07 · 自动更新与未签名安装：信任分层

## 1. 思想：两套「信任」不要混谈

| 层级 | 问题 | callai 现状 |
| --- | --- | --- |
| OS 信任 | Gatekeeper / SmartScreen | **未** Apple 公证 / 未买 Windows EV 签 |
| 更新信任 | 安装包是否被篡改 | minisign + `latest.json`（tauri updater） |
| 产品信任 | 用户是否敢用 | README 诚实说明 + xattr 步骤 |

用户要 updater，**同时**要未签名也能装——这不是矛盾，而是：

- 开发期 / 开源分发先跑通更新通道  
- 文档承担 OS 拦截解释成本  

---

## 2. 原始 prompt 拆解

```text
使用 tauri-updater 支持程序自动更新
增强 README.zh / README，让 xattr……没有签名的程序用户可以使用
（同批）截图压缩后再增强 README
```

### 好在哪

- **功能**（updater）与 **采用率阻塞**（签名/公证）被同时点名  
- 中英 README 都要 —— 支持负担对等  
- 与媒体增强同批：发布页「好看 + 能装 + 能更新」  

### 拆给 agent 的三张工单

1. 代码：plugin + capability + Settings UI  
2. 发布：`createUpdaterArtifacts` + CI secrets  
3. 文档：xattr / SmartScreen / chmod  

---

## 3. 给 AI 的提示模板

```markdown
## Updater
- tauri-plugin-updater + rustls
- endpoint: GitHub latest/download/latest.json
- pubkey 写入 tauri.conf；私钥只进 GitHub Secrets
- Settings：检查更新 / 下载安装

## 文档
- 明确未公证
- macOS: xattr -dr com.apple.quarantine …
- Windows SmartScreen / Linux chmod

## 验收
- [ ] 无密钥时 build 仍可通过（或文档说明）
- [ ] 有密钥时 release 上传 .sig
- [ ] README 中英都有安装章节
```

---

## 4. 功能划分

| 部件 | 路径 |
| --- | --- |
| 配置 | `tauri.conf.json` plugins.updater |
| Rust 注册 | `lib.rs` plugin init |
| 权限 | `capabilities/default.json` |
| 前端 API | `src/infra/updater.ts` |
| UI | Settings「检查更新」 |
| CI | `TAURI_SIGNING_PRIVATE_KEY*` |
| 用户文档 | README Download & first launch |

---

## 5. 推进流程

```text
1. signer generate → 公钥进 conf，私钥 secret
2. createUpdaterArtifacts true
3. 前端 check / downloadAndInstall
4. i18n 文案
5. release.yml 注入 env
6. README 安装章节 + 截图
7. （可选）下个版本验证端到端更新
```

---

## 6. 真实执行与偏差

| 项 | 实际 |
| --- | --- |
| Commit | `d8d9182` |
| Secrets | 已 `gh secret set TAURI_SIGNING_PRIVATE_KEY` |
| 风险 | 私钥丢失则更新链断裂 → 备份离线 |
| 偏差 | 无公证时，用户仍需手动 xattr——文档必须置顶 |

---

## 7. 验收清单

- [ ] Settings 在浏览器 mock 显示 unsupported，在 Tauri 显示检查  
- [ ] README 中英均有 macOS `xattr`  
- [ ] `.keys/*.key` 不被 git 跟踪  
- [ ] release workflow 含 signing env  

## 8. 练习

1. 解释：用户执行 `xattr` 解决的是哪一层信任。  
2. 设计：若未来上 Apple 公证，updater 流程哪些不变。  
3. 写一段客服话术：Windows SmartScreen 弹窗怎么点。  

## 9. 关键

`d8d9182` · `src/infra/updater.ts` · README 安装章 · `scripts` 不存私钥
