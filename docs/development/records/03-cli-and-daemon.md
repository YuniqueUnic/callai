# 03 · CLI / daemon 与共享数据

## 学员目标

- 理解「同一二进制：无参 GUI / 有子命令 CLI」
- 会用 `run` / `daemon` 做无界面保活调度
- 知道数据目录与桌面 App 一致

## 原始诉求（摘要）

- CLI 与 App 都要支持  
- features 精简（`default-features = false`）减体积  
- Windows console 适配  
- daemon / 后台持续运行保活  

## 关键提交

| Commit | 说明 |
| --- | --- |
| `21d13b4` | CLI 支持，共享数据后端 |
| `aaa486b` | `daemon` 作为 `run` 别名 |

## 关键文件

- `src-tauri/src/cli.rs`
- `src-tauri/src/main.rs`（windows_subsystem）
- `src-tauri/Cargo.toml` features 裁剪

## 复现命令

```bash
cargo build --manifest-path src-tauri/Cargo.toml
./src-tauri/target/debug/callai --help
./src-tauri/target/debug/callai list
./src-tauri/target/debug/callai run          # 前台保活
./src-tauri/target/debug/callai daemon       # 别名
just cli-list
```

## 架构提示

- 调度：轮询 due + 单 worker 队列，避免线程堆积 sleep  
- CLI 与 GUI 共用 `AlarmService` / SQLite / TOML 备份路径  

## 练习

1. 写一条「导入 toml → daemon → list logs」的手工验收清单。  
2. 比较 `run` 与 GUI 托盘常驻的差异（会话生命周期）。
