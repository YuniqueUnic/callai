# 06 · CI/CD 与 release-please：从「本机能跑」到「别人能装」

## 1. 思想：为什么 CI/CD 是产品功能的一部分

桌面应用如果只在作者 Mac 上 `just dev` 绿，对用户等于不存在。  
CI/CD 解决三件产品问题：

| 问题 | 没有 CI | 有 CI/CD |
| --- | --- | --- |
| 「合进去会不会炸？」 | 靠感觉 | PR 上 `gate` 红就不能合 |
| 「版本号谁说了算？」 | 手改三个文件必漂移 | release-please + check_versions |
| 「用户从哪下载？」 | 网盘私发 | GitHub Release 多平台资产 + updater |

**callai 的发布哲学**：

1. **main 始终可发布**（gate 守门）  
2. **版本语义化**（Conventional Commits → semver）  
3. **一份二进制，两种入口**（GUI / CLI 同 crate）  
4. **更新通道可验证**（`latest.json` + `.sig`）

### 需求从何而来（原始动机）

用户不是先说「写个 YAML」，而是说：

```text
使用 gh 来构建本仓库的 workflow，构建出 tauri
（使用官方或者更好用的 tauri ci/cd，以及构建出 cli）
以及做好 version 管理；version 管理就使用 semver + google 的 release-please 吧；
以及需要确保 ci/cd 正常！！！
```

这是**工程类好 prompt**：指定工具族（gh / tauri-action / release-please / semver），并给硬验收（「正常」= 红必修到绿）。

后来又追加：

```text
Node.js 20 is deprecated … release-please-action@v4 / checkout@v4 / action-gh-release@v2
macos-latest will migrate to macOS 26 …
main branch protect；自动 rebase 合并；PR 需要过了 gate 才能合并
```

→ CI 不是「搭完就完」，而是**随 GitHub 平台演进持续维护**。

---

## 2. 原始 prompt 拆解：为什么好 / 如何写得更好

### 2.1 初建 CI 的 prompt（好）

| 句子 | 好在哪 | agent 应落地 |
| --- | --- | --- |
| 用 `gh` 构建 workflow | 指定操作面，别只贴 YAML 理论 | 真写 `.github/workflows` 并用 gh 验证 |
| tauri 官方或更好 | 允许选型，默认 tauri-action | `tauri-apps/tauri-action` |
| 还要 cli | 第二产物，不是可选项 | `cargo build --release` 上传 `callai-cli-*` |
| semver + release-please | 版本策略钉死 | manifest + conventional commits |
| 确保正常 | 禁止停在「应该能跑」 | `gh run list` 到绿 |

### 2.2 平台警告类 prompt（好）

用户直接贴 **GitHub Actions annotation 原文** —— 这是最高质量 bug 报告：

- 有组件名（`release-please` / `publish (macos-*)`）  
- 有废弃原因（Node 20 → 24）  
- 有迁移时间表（macos-latest → 26，2026-06-15）  

**模板（学员可抄）**：

```markdown
## CI 警告原文
（粘贴 annotation 全文）

## 期望
- 不再出现 Node 20 deprecation
- 不再依赖会漂移的 macos-latest
- CI 仍然全绿

## 约束
- 不破坏 release-please / updater 签名流程
- runner 尽量 pin 具体版本标签
```

### 2.3 分支保护 prompt（好）

```text
为 main 开启 protect
开启自动 rebase 合并
PR 需要过了 gate 之后才能合并进入
```

拆成三张「策略工单」：

1. Branch protection：required check = `gate`  
2. Merge button：只允许 rebase  
3. Linear history + 禁止 force-push  

---

## 3. 给 AI 的完整提示模板（可复用到你的项目）

```markdown
## 目标仓库
- 技术栈：…（前端/后端/桌面）
- 产物：…（安装包 / CLI / Docker）

## Workflow
### ci.yml（每个 PR）
- checkout / 装依赖 / 单测 / lint / 构建
- 必须有一个 job 名叫 `gate`（或改成你的 check 名）
- runs-on 使用 pin：ubuntu-24.04 等

### release.yml
- release-please（或 changesets）开 Release PR
- merge 后矩阵构建多平台
- 上传到 GitHub Release

## 版本
- Conventional Commits
- 版本源文件列表：… 必须一致
- 提供 check_versions 脚本，CI 第一步跑

## 分支策略
- main protected：required status checks + strict（需与 main 同步）
- 仅 rebase merge；禁 squash/merge commit（若要线性历史）
- 合入后删 head 分支

## 验收
- [ ] 开一个空 docs PR，gate 红/绿可见
- [ ] 直接 push main 被拒绝
- [ ] release 后 Release 页有资产
- [ ] Actions 无 Node 20 deprecation 警告
```

---

## 4. 功能划分（callai 实装地图）

```
.github/workflows/
  ci.yml        # PR/push → job "gate"
  release.yml   # release-please + publish matrix

scripts/check_versions.sh
release-please-config.json
.release-please-manifest.json
```

| 子系统 | 职责 | 非职责 |
| --- | --- | --- |
| **gate** | 质量门禁 | 上传安装包 |
| **release-please** | 版本 PR / tag / changelog | 编译 Tauri |
| **publish matrix** | 多平台构建 + 上传 | 改业务代码 |
| **check_versions** | 版本源一致性 | semver 决策 |
| **branch protection** | 合并策略 | 替代 code review 文化 |

### publish 矩阵（学员可改成自己的）

| name | runs-on（pin） | rust target | 产物 |
| --- | --- | --- | --- |
| macos-aarch64 | `macos-15` | aarch64-apple-darwin | dmg/app.tar.gz + cli |
| macos-x86_64 | `macos-15` | x86_64-apple-darwin（交叉） | 同上 |
| linux-x86_64 | `ubuntu-24.04` | x86_64-unknown-linux-gnu | deb/AppImage/rpm + cli |
| windows-x86_64 | `windows-2025` | x86_64-pc-windows-msvc | msi/nsis + cli.exe |

**为什么 pin，不写 `macos-latest`？**  
因为 latest 会在某天悄悄换大版本（警告里写了 2026-06-15 → macOS 26），Tauri 原生依赖对 OS 升级敏感。

---

## 5. 推进流程（推荐你按此指挥 agent）

### 阶段 A：最小 gate

```text
1. 写 ci.yml：checkout → install → test → build
2. 推 PR，用 gh run watch 看到绿
3. 把 job 名称定为 gate（或与 protection 一致）
```

### 阶段 B：release-please

```text
1. Conventional Commits 约束写进 CONTRIBUTING
2. release-please-config + manifest
3. release.yml 只跑 release-please（先不 publish）
4. 合一个 feat commit，确认出现 Release PR
```

### 阶段 C：多平台 publish

```text
1. matrix + tauri-action
2. 同步上传 CLI
3. 第一次红：按日志修（依赖/fmt/features）
4. 验证 Release 资产列表
```

### 阶段 D：平台卫生（Node / runner）

```text
1. 升级 actions 到 Node 24 运行时版本
   - actions/checkout@v7
   - softprops/action-gh-release@v3
   - googleapis/release-please-action@v5
2. pin runners：macos-15 / ubuntu-24.04 / windows-2025
3. 再跑一次 CI，确认 annotation 消失
```

### 阶段 E：分支保护

```text
1. required_status_checks: ["gate"], strict: true
2. allow_rebase_merge only + required_linear_history
3. enforce_admins: true（连管理员也不能绕过）
4. 用「直接 push main」实验：应被拒绝
5. 用 PR 合入：gate 绿才能合
```

**callai 验证过**：`docs: document main…` 直接 push 被 `GH006 Required status check "gate" is expected` 拒绝 —— 保护生效。

---

## 6. 关键 Actions 版本（本仓库当前）

| 用途 | 版本 | 说明 |
| --- | --- | --- |
| checkout | `actions/checkout@v7` | Node 24 |
| gh-release | `softprops/action-gh-release@v3` | Node 24 |
| release-please | `googleapis/release-please-action@v5` | Node 24 |
| tauri | `tauri-apps/tauri-action@v1` | 已是 Node 24 |
| bun | `oven-sh/setup-bun@v2` | 可保留 |
| rust cache | `Swatinem/rust-cache@v2` | 可保留 |

对应 commit：`ea94e42`（pin runners + 升级 Actions）。

---

## 7. 真实故障树（课堂金句）

| 症状 | 根因 | 纠偏 | 证据 commit |
| --- | --- | --- | --- |
| Ubuntu apt 冲突 | 两套 appindicator 包 | 只装 ayatana | `fc24400` |
| fmt check 红 | 未统一 rustfmt | `cargo fmt` | `773afe0` |
| rfd 无 backend | dialog default-features 关过头 | 恢复 defaults | `1e7423f` |
| 缺 icons | 本机全局 `Icon?` ignore | `git add -f` | `f3ab0ff` |
| README 版本未涨 | release-please 未改 md | generic extra-files + marker | `09c6f87` `fec4fe6` |
| Node 20 deprecated | action 旧 major | 升到 v5/v7/v3 | `ea94e42` |
| macos-latest 预警 | 浮动标签 | pin `macos-15` | `ea94e42` |
| 直接 push main 失败 | protection | 走 PR | 保护配置后实测 |

### 红变绿的标准操作（教学员）

```bash
gh run list --limit 5
gh run view <id> --log-failed | tail -100
# 修 → commit → push → 再看
gh pr checks
```

---

## 8. release-please 工作流（给学员画图）

```
开发者: feat: xxx  ──push──► main
                              │
                              ▼
                     release-please job
                              │
                    ┌─────────┴─────────┐
                    │ 打开/更新 Release PR │  (chore: release x.y.z)
                    └─────────┬─────────┘
                              │ human merge (需 gate 绿)
                              ▼
                     创建 tag + GitHub Release
                              │
                              ▼
                     publish matrix (仅 release_created)
                              │
              ┌───────────────┼───────────────┐
           macOS            Linux           Windows
         + .sig           + .sig            + .sig
                              │
                              ▼
                     latest.json（updater 读这个）
```

**学员练习**：在自己的玩具仓库只做 A+B，第二天再加 C。

---

## 9. 版本源一致性（防低级事故）

callai 检查：

```bash
./scripts/check_versions.sh
```

对齐：

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `.release-please-manifest.json`
- README 中 `x-release-please-version` 标记

**教学点**：文档里的 badge 版本也是版本源；漏了会在发版 PR 的 gate 红掉（我们已经踩过）。

---

## 10. 与 updater 的接口（连到 07）

publish 成功后，updater 依赖：

- `createUpdaterArtifacts: true`
- secrets：`TAURI_SIGNING_PRIVATE_KEY`（+ optional password）
- endpoint：`…/releases/latest/download/latest.json`

v0.2.0：有安装包，**无** sig/latest.json（updater 未进 release 链路）  
v0.2.1：11 platforms 全带 signature —— **更新通道可用**

---

## 11. 分支保护配置清单（callai 当前）

| 项 | 值 |
| --- | --- |
| required check | `gate` |
| strict | true（PR 需与 main 同步） |
| enforce_admins | true |
| linear history | true |
| allow_force_pushes | false |
| merge methods | **仅 rebase** |
| delete branch on merge | true |
| conversation resolution | true |

直接 push 实验失败信息：

```text
GH006: Protected branch update failed
Required status check "gate" is expected.
```

---

## 12. 验收清单（学员作业可勾）

**CI**

- [ ] PR 上出现 check 名 `gate`  
- [ ] `just ci` 本地与 CI 大致同构  
- [ ] Actions 日志无 Node 20 deprecation  

**Release**

- [ ] `feat:` 合入后出现 release-please PR  
- [ ] merge 后 tag + 多平台资产  
- [ ] `gh release view` 能看到 cli 与安装包  

**保护**

- [ ] `git push origin main` 被拒  
- [ ] 仅 rebase 按钮可用  
- [ ] gate 红时无法 merge  

**Updater（连 07）**

- [ ] `curl -sL …/latest.json \| jq .version`  
- [ ] platforms 均有 `signature` 与 `url`  

---

## 13. 练习

1. **移植练习**：把 callai 的 `ci.yml` 改成「纯 Rust CLI 项目」最小 gate（删前端步骤），写出 diff 说明。  
2. **故障注入**：故意把 `package.json` 版本改成与 Cargo 不一致，预测哪一步红。  
3. **策略辩论**：为何 solo 项目仍要 `enforce_admins: true`？写出 3 个利弊。  
4. **警告处理**：给定一段新的 Actions deprecation 文案，写出升级 plan（action 名 + 目标 major + runner pin）。  

---

## 14. 关键提交

| Commit | 主题 |
| --- | --- |
| `45343c8` | 引入 CI + release-please + publish |
| `fc24400`…`1e7423f` | 第一轮修绿 |
| `f3ab0ff` `fec4fe6` | 版本源/图标/README |
| `6868380` | v0.2.0 发版 |
| `60110aa` | v0.2.1 发版（含 updater 产物） |
| `ea94e42` | Node 24 actions + pin runners |
| （PR docs protection） | CONTRIBUTING 记录保护策略 |

## 15. 关键文件

- `.github/workflows/ci.yml`  
- `.github/workflows/release.yml`  
- `scripts/check_versions.sh`  
- `release-please-config.json`  
- `CONTRIBUTING.md`（Branch protection 节）  
