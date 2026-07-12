# 06 · CI/CD：从「能跑」到「可发布」

## 1. 思想：本地绿 ≠ 用户能装

callai 作为桌面+CLI 产品，交付物是：

- 多平台安装包（dmg/msi/deb/…）  
- CLI 单文件  
- 可重复的版本号与 changelog  

思想：

> PR 门禁保主分支质量；release-please 保版本语义；矩阵构建保资产存在。

### 需求动机

```text
使用 gh 构建 workflow，构建 tauri + cli
version：semver + google release-please
确保 CI/CD 正常！！！
```

短、硬、可执行——这是 **工程类 prompt 的正确语气**。

---

## 2. Prompt 拆解

| 要求 | 落地 |
| --- | --- |
| gh + workflow | `.github/workflows/*.yml` |
| Tauri 官方/更好 | `tauri-apps/tauri-action@v1` + `bunx tauri` |
| CLI | 同 crate `cargo build --release` 上传 |
| semver + release-please | `googleapis/release-please-action@v4` |
| 确保正常 | 真的 merge、真的看 run、真的修红 |

**好 prompt 特征**：指定工具族（gh、release-please），而非「弄一下自动发布」。

---

## 3. 给 AI 的提示模板（CI 类）

```markdown
## 目标
main 每次 PR：typecheck/test/build + cargo fmt/test/clippy + CLI smoke
main 发版：release-please PR → merge → tag → 矩阵发布 desktop+cli

## 约束
- 包管理器 bun --frozen-lockfile
- 版本源同步：package.json / tauri.conf.json / Cargo.toml / manifest / README markers
- Ubuntu 依赖不要同时装冲突的 appindicator 包

## 验收
- [ ] gh run 绿
- [ ] 人为制造版本不一致时 check_versions 失败
```

---

## 4. 功能划分

| Job | 何时 | 做什么 |
| --- | --- | --- |
| `ci.yml` gate | PR/push main | 质量门禁 |
| release-please | push main | 开/更 Release PR |
| publish matrix | release_created | 4 平台 Tauri + CLI upload |

版本源：`scripts/check_versions.sh`。

---

## 5. 推进流程（真实排障序）

```text
1. 写 ci.yml 最小 gate（先前端+ fmt）
2. 加 Rust test/clippy
3. 加 release-please + 版本同步
4. 加 publish 矩阵
5. 修第一轮红：apt / fmt / rfd / icons
6. 修第二轮红：README 版本 marker
7. merge release PR 验证真产物
```

---

## 6. 真实故障与纠偏（课堂重点）

| Commit | 故障 | 根因 | 教训 |
| --- | --- | --- | --- |
| `fc24400` | apt 冲突 | 两个 appindicator 包 | 官方文档依赖列表要本地验证 |
| `773afe0` | fmt check | 未在 CI 前 fmt | gate 与本地 just 对齐 |
| `1e7423f` | rfd 编译 | dialog default-features 关过头 | 瘦身按 crate 测 Linux |
| `f3ab0ff` | 缺 icons | 全局 `Icon?` ignore | CI 环境 ≠ 开发机 ignore |
| `09c6f87` | README 仍 0.1.0 | release-please 未改 markdown | extra-files + marker 约定 |
| `fec4fe6` | 同上预防 | generic extra-files | 文档也是版本源 |

发版证据：`6868380` → tag `v0.2.0` → 13 个资产（桌面+CLI）。

---

## 7. 验收清单

```bash
./scripts/check_versions.sh
just ci
gh run list --limit 5
gh release view v0.2.0
```

- [ ] PR 红能在 1 个工作会话内定位  
- [ ] 说清 release-please PR **不要手改版本**（除非修 marker）  

## 8. 练习

1. 画 swimlane：开发者 commit → CI → release PR → publish。  
2. 模拟：只改 package.json 版本，预测哪步红。  
3. 解释为何 publish 用 `release_created == true` 门闩。  

## 9. 关键

`.github/workflows/*` · `release-please-config.json` · `scripts/check_versions.sh`
