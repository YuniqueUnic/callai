# 03 · CLI 与 daemon：一条二进制，两种活法

## 1. 思想：为什么 GUI 之外还要 CLI

桌面闹钟满足「有人看着的 Mac」；但真实用户还有：

- 无头 Linux 小主机 / CI runner 旁挂  
- 想 `ssh` 上看看闹钟列表  
- 希望 **关 GUI 也继续调度**  

若 CLI 另起一套存储，必然双写地狱。  
正确思想：**同一 domain + 同一 SQLite/TOML；仅入口不同**。

```
callai            → GUI（无子命令）
callai <cmd>      → CLI
callai run|daemon → 无界面保活调度
```

### 需求动机（prompt 侧）

```text
CLI, app 都需要支持呀；
clap features / tauri / dirs… 精简 default-features
CLI 加 Windows console 适配
cli daemon；或者 app 后台持续运行 → 保活
```

用户在同一段里混了三件事——**教学时要帮他拆**：

1. 功能：CLI 子命令  
2. 工程：依赖 features 瘦身  
3. 运行模型：daemon 保活  

---

## 2. Prompt 拆解：好在哪

| 片段 | 价值 |
| --- | --- |
| 「CLI, app 都需要」 | 双入口需求明确 |
| 「共用」隐含（后文数据路径） | agent 应对齐路径，而非新 DB |
| `disable-default=true` | 体积/编译时间意识 |
| Windows console | 平台细节，避免 GUI 子系统吞掉 stdout |
| daemon / 保活 | 运行模型，不只是 CRUD |

### 更好的一次说清版本（模板）

```markdown
## CLI
- 与 GUI 共用 ~/.config/callai + callai.db
- 子命令：list / run / run-once / validate / generate-example / app / daemon
- daemon == run（文档层别名即可）
- 无子命令启动 GUI

## 工程
- clap/tauri/… default-features=false，只开用到的 feature
- Windows：GUI windows_subsystem，CLI attach console

## 验收
- [ ] GUI 建的闹钟 CLI list 看得到
- [ ] daemon 下 due 任务会执行并写 log
```

---

## 3. 功能划分

| 命令 | 类型 | 说明 |
| --- | --- | --- |
| `(none)` / `app` | GUI | Tauri 窗口 + tray |
| `list` | 查询 | 闹钟列表 |
| `run-once <id\|name>` | 命令 | 立即执行一次 |
| `run` / `daemon` | 长驻 | 调度 poller + worker |
| `validate` | 查询 | 配置/闹钟合法性 |
| `generate-example` | 工具 | 示例 toml |

### 调度核心（与 GUI 相同）

- 20s 轮询 due  
- **单 worker 队列**串行执行（重试等待不占满线程）  
- 同 alarm 在途不重复入队  

---

## 4. 推进流程（让 agent 快）

```text
1. 抽出 AppState/AlarmService 使 main 与 cli 可复用
2. clap 定义子命令（先 list/run-once）
3. run 循环：复用 scheduler 模块
4. daemon alias
5. Windows subsystem 条件编译
6. features 裁剪 + cargo check 体积观感
7. just cli-* 菜谱 + README
8. 测试：service 层已有则 CLI 薄包装即可
```

**反模式**：为 CLI 新建 `cli_db.sqlite`。

---

## 5. 真实提交与偏差

| Commit | 内容 |
| --- | --- |
| `21d13b4` | CLI 主体 + 共用数据 + just + README |
| `aaa486b` | `daemon` 别名；文档澄清保活 |

偏差：

- message 写了 `BREAKING CHANGE` 但实际是附加命令——教学上提醒 **Conventional Commit 别滥用 breaking**。  
- features 精简曾波及 `tauri-plugin-dialog` → Linux rfd 爆（见 06）——**瘦身要按 crate 验证**。  

---

## 6. 验收清单

```bash
cargo build --manifest-path src-tauri/Cargo.toml
./src-tauri/target/debug/callai list
./src-tauri/target/debug/callai run-once <name>
# 另开终端
./src-tauri/target/debug/callai daemon
```

- [ ] GUI 与 CLI 列表一致  
- [ ] `run` 与 `daemon --help` 语义一致  
- [ ] Windows 下 CLI 有控制台输出  

## 7. 练习

1. 画组件图：`cli.rs` / `lib.rs` / `AlarmService` / `SqliteStore`。  
2. 设计 `callai import-toml` 与现有 `--import-toml` 的 UX 差异说明。  
3. 写一段 prompt：要求 agent **禁止**新存储，只能复用 ports。  

## 8. 关键路径

`src-tauri/src/cli.rs` · `main.rs` · `Cargo.toml` · `justfile` cli-*

---

## 附录 · MCP HTTP keep-alive 与 App supervisor（链到 15/16）

### 思想

`callai daemon` 与 `callai mcp-server --http` 同属 **前台 keep-alive** 家族：进程在，服务就在；Ctrl+C 结束。  
stdio MCP **不是** daemon——由 Claude/Codex **spawn**，生命周期跟 client。

### 三种入口（现行）

| 入口 | 命令 / 开关 | 默认端口 | 记录 |
| --- | --- | --- | --- |
| stdio | `callai mcp-server` | n/a | 15, 16 |
| HTTP CLI | `callai mcp-server --http` | **33927** | 16 |
| HTTP App | Settings → 开启 HTTP MCP | **33927** | 16 · `McpHttpSupervisor` |

**互斥：** 不要 CLI 与 App 同绑一端口。  
**鉴权：** Bearer token（bootstrap 自动生成）；Host **不**白名单（用户可 bind `0.0.0.0`）。

### 给 AI 的短提示

```text
实现/修改 MCP HTTP 时：
- stdio 保持 spawn 模型
- HTTP 可 CLI 或 App supervisor，共享 SQLite
- audit log 仅 source=mcp
- 开关必须反映真实 running/error，禁止「假开启」
```

### 偏差

早期文档写「开关不 bind」→ 用户否决 → 见 record 16 §1.3 / 15 §4.1 纠偏。
