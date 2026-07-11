**✅ 已补充：错误处理与提示文案 + 数据持久化方案**

以下内容可直接用于产品设计和开发实现。

---

### 1. 错误处理与提示文案（可爱风格）

callai 的错误提示遵循**「温柔 + 建设性 + 不指责」**的原则，像小动物在关心你一样。

#### 核心原则
- 不使用“错误”“失败”“无效”等负面词汇
- 多使用「～」「哦」「啦」「我们」等温暖语气
- 提供下一步可操作的建议
- 严重错误使用弹窗，轻微问题使用 toast 或卡片内提示

#### 常见场景与文案示例

| 场景 | 提示类型 | 可爱风格文案 | 建议操作 |
|------|----------|--------------|----------|
| **Binary 未找到** | Toast + 卡片标签 | 「这个小命令好像不在本机哦～ 要不要检查一下路径呢？」 | 显示「浏览文件」按钮 |
| **执行失败（首次）** | 卡片状态 + Toast | 「这次任务没顺利完成，我们已经准备好再试一次啦！」 | 自动进入重试流程 |
| **重试全部失败** | 弹窗 + 卡片 | 「呜…尝试了 3 次还是没能成功。要不要打开日志看看发生了什么呢？」 | 提供「查看日志」按钮 |
| **权限不足** | 弹窗 | 「看起来这个命令需要一点特殊权限才能运行哦。可以试试用管理员身份运行应用吗？」 | 提供帮助链接 |
| **参数格式问题** | Toast | 「参数好像有点奇怪～ 可以检查一下引号或空格吗？」 | 高亮问题参数 |
| **Cron 表达式无效** | Toast | 「这个时间设置有点看不懂呢～ 要不要换成简单的时间选择模式试试？」 | 自动切换到简单模式 |
| **保存配置失败** | 弹窗 | 「配置保存的时候遇到了小麻烦… 要不要再试一次？」 | 重试按钮 + 联系反馈入口 |
| **应用启动时发现配置损坏** | 弹窗 | 「哎呀，配置文件好像有点问题。我们已经为你备份了旧文件，要不要重新开始设置呢？」 | 提供「恢复备份」和「新建配置」选项 |
| **任务正在执行时用户尝试删除** | Toast | 「这个闹钟正在努力工作呢～ 等它完成后再删除吧！」 | 阻止删除并提示 |

#### 通用 Toast 风格示例
- 成功类：「闹钟设置好啦！以后会按时帮你照顾 AI 的～」
- 信息类：「已暂停所有闹钟，随时可以重新开启哦」
- 警告类：「有 2 个闹钟最近执行不太顺利，要去看看吗？」

**设计建议**：
- Toast 使用 animal-island-ui 的柔和颜色（成功=浅绿，失败=浅橙）
- 重要错误使用**模态弹窗**，并配有可爱的小插图

---

### 2. 数据持久化与存储方案（Rust 端建议）

由于 callai 是**轻量级桌面应用**，存储方案需要兼顾**简单、可靠、可手动编辑**。

#### 推荐整体架构

| 数据类型           | 存储方式          | 推荐方案                  | 理由 |
|--------------------|-------------------|---------------------------|------|
| **用户配置**       | 文件              | **TOML** (`tasker.toml`)  | 用户可直接编辑，可读性强 |
| **闹钟列表 + 状态**| 数据库            | **SQLite**                | 支持事务、查询、索引，适合状态管理 |
| **执行日志**       | 数据库            | **SQLite**                | 需要按时间、任务筛选和分页 |
| **运行时缓存**     | 内存 + 文件       | `tokio` + SQLite          | - |

#### 详细存储方案

**1. 配置文件（TOML）**
- 路径：`~/.config/callai/config.toml`（跨平台使用 `dirs` crate）
- 内容：全局设置 + 闹钟列表（可手动编辑）
- 优势：用户可以直接修改配置，甚至用 Git 管理
- 启动时会读取 TOML，如果损坏则尝试恢复备份

**2. 运行时数据库（SQLite）**
- 路径：`~/.local/share/callai/callai.db`（使用 `dirs` crate 自动适配平台）
- 推荐使用 `rusqlite` 或 `sqlx`（异步更好）

**推荐表结构：**

```sql
-- 闹钟主表
CREATE TABLE alarms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    schedule TEXT NOT NULL,           -- cron 表达式
    binary_path TEXT NOT NULL,
    args TEXT,                        -- JSON 数组存储参数
    env_vars TEXT,                    -- JSON 对象存储环境变量
    retry_interval TEXT DEFAULT '2m',
    max_retries INTEGER DEFAULT 3,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 执行日志表
CREATE TABLE execution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alarm_id INTEGER,
    started_at DATETIME NOT NULL,
    finished_at DATETIME,
    status TEXT NOT NULL,             -- success / failed / running
    exit_code INTEGER,
    duration_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    stdout TEXT,
    stderr TEXT,
    FOREIGN KEY (alarm_id) REFERENCES alarms(id) ON DELETE CASCADE
);

-- 应用设置表（可选）
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

**优势**：
- 支持复杂查询（按时间范围、按任务筛选日志）
- 支持事务（执行任务时记录开始和结束状态）
- 日志可以定期清理（设置中可配置保留天数）

#### 存储位置建议（Rust 端）

使用 `dirs` crate 自动获取正确路径：

```rust
use dirs;

let config_dir = dirs::config_dir().unwrap().join("callai");
let data_dir = dirs::data_local_dir().unwrap().join("callai");
```

**推荐目录结构**：
```
~/.config/callai/
├── config.toml          # 用户可编辑的主配置
└── backups/             # 配置文件备份

~/.local/share/callai/
├── callai.db            # SQLite 数据库
└── logs/                # 可选的额外日志文件
```

#### 数据同步策略

- **启动时**：读取 `config.toml` → 同步到 SQLite（以 SQLite 为运行时权威数据源）
- **保存时**：更新 SQLite → 同时写回 `config.toml`（保持用户可编辑性）
- **冲突处理**：如果 TOML 被手动修改，以 TOML 为准，SQLite 重新同步

---

### 总结建议

| 模块             | 推荐技术          | 备注 |
|------------------|-------------------|------|
| 配置存储         | TOML + `serde`    | 用户友好，可手动编辑 |
| 运行数据 + 日志  | SQLite + `rusqlite` 或 `sqlx` | 功能完整，查询方便 |
| 错误提示         | 温和文案 + 分级反馈 | Toast / 卡片 / 弹窗 |
| 状态管理         | Tauri 的 `State` + SQLite | 前后端状态同步 |

