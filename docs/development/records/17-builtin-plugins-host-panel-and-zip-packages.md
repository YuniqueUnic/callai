# 17 · 内置插件 / 参数统一 / Host 控制面板 / Zip 包：把「插件平台」从对话里长出来

> 阶段：`v0.2.8+` 工作区 · 接续 [15 AI/MCP Prompt](./15-ai-mcp-prompt-composition.md) · [16 MCP Tools/Logs](./16-mcp-tools-and-logs.md)  
> 证据（代码真源，提交前请以 `git status` 为准）：
>
> | 路径 | 主题 |
> | --- | --- |
> | `src-tauri/templates/builtin_plugins/**` | 内置插件源（todo / pomodoro / meal-spin / work-report） |
> | `src-tauri/src/infra/plugin/builtins.rs` | catalog + 一次性 seed（删除不重装） |
> | `src-tauri/src/infra/plugin/runtime.rs` | `__callai_plugin__` · ENV/params 同名覆盖 · 开窗 |
> | `src-tauri/templates/plugin/host_panel.js` + `host_chrome.css` | 主机注入：可拖动贴边 FAB · 主题/通知/参数 Modal |
> | `src-tauri/src/infra/plugin/package.rs` | zip 包规范 · 安全解析 · 裸包/含数据导出 |
> | `src/pages/PluginsPage.tsx` | zip 安装 / 拖放 / 导出询问 |
> | `src-tauri/prompts/plugin_sdk.prompt` | Agent 合同（本轮重写，降低 ui.html 压力） |
>
> 关联口语：内置插件清单 · 吃喝转盘合并 · ENV 覆盖 · storage≡settings≡params · Host content panel · zip 市场铺垫

---

## 1. 思想 / 为什么有这个需求

### 1.1 插件系统已经「能跑」，但还不够「能给」

Record 15–16 之后，callai 已有：

- 独立插件窗 + bridge SDK  
- 闹钟二进制 `__callai_plugin__` 定时弹窗/通知  
- AI dual-part 生成 PluginDraft  
- MCP 外挂修插件  

学员与用户下一句几乎总是：

> 那能不能**自带几个有用的插件**？能不能**像装 App 一样装 zip**？  
> 每次 AI 写 ui.html 都要重写主题/设置/通知，**能不能主机帮掉**？

**思想：**

> 插件平台的成熟标志不是「又能写更多 HTML」，  
> 而是 **主机吃掉公共复杂度，插件只写业务主路径**。

### 1.2 为什么「参数 / settings / launch params」必须合一

口语里会混用三个词：

| 口语 | 直觉误解 | 正确模型 |
| --- | --- | --- |
| settings | 另一套配置表 | **就是 params** |
| params | 闹钟专用字段 | **同一 key 空间** |
| launch params | 第三套启动参数 | **同名 key 的本次覆盖层** |

**唯一底层：** `window.callai.storage`（插件隔离 SQLite）。  
**唯一公式：**

```text
effective(key) = defaults < storage 中的值 < 本次同名覆盖（闹钟/ENV/主机面板）
```

覆盖 **不写回 storage**，除非用户在业务 UI 里显式保存。

**禁止：** 为「设置页 / 启动参数 / 主机参数」再拆三套 schema、三套编辑器、三套 key 前缀（主机 chrome 除外，见 §4.3）。

### 1.3 为什么 Host Content Panel 比「每个 ui.html 自己写设置」更好

| 方案 | 成本 | 一致性 | AI 生成风险 |
| --- | --- | --- | --- |
| 每个插件手写设置/主题/通知 | 高 | 差 | 模型每次漏实现或 API 调错 |
| **主机注入 FAB + Modal** | 一次 | 全站一致 | ui.html **禁止再造轮子** |

Host panel 解决的是 **所有插件都会需要** 的共性：

1. 参数（业务 key 的读写入口之一）  
2. 主题 light/dark  
3. 通知开关  
4. 可拖动、靠边吸附的入口本身  

插件 `ui.html` 只负责：**领域主界面 + 业务数据 CRUD**。

### 1.4 为什么要先做 zip，再谈 GitHub 插件市场

市场 = 发现 + 信任 + 安装 + 更新。  
在 registry 之前，必须先有 **可机器校验的包格式**：

```text
plugin.zip
  manifest.json          # 必填
  ui.html                # 或 manifest.ui
  callai-package.json    # schema / kind / includes_data
  data.db                # 可选：仅「含数据」导出
```

导出时 **询问是否含数据**：

- **裸包**：分享 / 市场上架 / 给 Agent 当模板  
- **含数据**：备份 / 换机（含隐私，默认要明示）

---

## 2. 原始 prompt 拆解（好在哪 / 还缺什么）

### 2.1 内置插件清单（产品化清单型）

```text
添加更多程序内置 plugins，比如 TODO，番茄时钟，今天吃什么/喝什么转盘，
日报/周报/月报记录管理… 可以和 alarm 以及定时触发相关…
内置插件也可以被删除，它们只是提前内置… 和普通插件没什么不一样。
这些插件也该在合适的文件夹中统一管理和开发。
```

| 说法 | 好在哪 |
| --- | --- |
| 点名具体插件 | 可验收清单，不是「多做点插件」 |
| 「和 alarm 相关」 | 绑定已有二进制 `__callai_plugin__`，不造调度器 |
| 「可删除 / 和普通一样」 | 直接定 seed 语义：**不是系统特权插件** |
| 「合适的文件夹」 | 逼出 `templates/builtin_plugins/` 源布局 |

**缺什么（执行时补上）：** seed 删除后是否重装 → 定成 **offer 一次**（marker 记录 id）。

### 2.2 合并转盘 + ENV 覆盖（架构收敛型）

```text
drink-spin 和 food-spin 可以合并… 不同页面触发可由 alarm 的 ENV
进行 plugin 参数强制覆盖，完成打开页面的定制化。
```

| 说法 | 好在哪 |
| --- | --- |
| 合并 | 减 catalog 碎片；一个插件两个 mode |
| ENV 强制覆盖 | 同一插件、不同闹钟 = 不同 effective UI |
| 「页面定制化」 | 验收：午饭闹钟 → 吃；下午茶 → 喝 |

**纠偏：** 不要发明 `launchParams` 产品概念与 settings 并列；文档里写 **同名覆盖**。

### 2.3 storage ≡ settings ≡ params（心智归一型）

```text
记住，插件中的 storage 也就是 setting 的存储底层，
而 setting 其实就是 params… 不要分叉多套参数配置…
param 换个名称就可以是 setting、launch params，
这些其实都只是上层业务逻辑划分。
```

| 维度 | 含义 |
| --- | --- |
| **底层** | storage |
| **中层** | 同一 key 的读写与覆盖顺序 |
| **上层称呼** | 随意，不进架构 |

这是本轮 **最高优先级** 的设计约束；后续 SDK / 教材 / Agent prompt 必须复述它。

### 2.4 Host content panel（复杂度下沉型）

```text
settings / dark-light / notification 等插件肯定都会需要的功能和 UI，
直接内嵌更好？每个插件页面注入 content panel，可拖动摆放，
点击弹出 modal… 靠近四周自动贴靠…
这样 ui.html 可以少写很大一部分人逻辑。
深色主题可以用反色？可上网查，反色且不影响可读性。
```

| 说法 | 好在哪 |
| --- | --- |
| 「肯定都会需要」 | 正确抽取公共模块的信号 |
| 拖动 + 贴靠 | 具体交互，可测 |
| 减轻 ui.html | **直接降低 AI 生成失败面** |
| 反色 | 允许零配置主题，不强制 token 暗色系统 |

**落地选型：**

```css
html.callai-theme-dark { filter: invert(1) hue-rotate(180deg); }
/* 媒体 + 主机 chrome 二次反色，避免负片 */
html.callai-theme-dark img, video, … , [data-callai-no-invert] {
  filter: invert(1) hue-rotate(180deg);
}
```

### 2.5 Zip 安装/导出（分发雏形型）

```text
plugin tab 支持安装 zip（pick / drag-drop），符合规范则成功；
导出时询问是否包含数据；为后面 GitHub registry 铺垫。
```

**好在哪：** 安装路径（picker + DnD）与导出分支（裸/含数据）一次说清。

---

## 3. 如何把需求说清楚（给 AI 的提示模板）

### 3.1 内置插件 + seed

```text
在 src-tauri/templates/builtin_plugins/<id>/{manifest.json,ui.html} 统一管理内置插件。
启动 ensure_builtin_plugins：catalog 中尚未 offer 过的 id 才安装；
删除后不重装（marker 记录 seeded ids）。
新加 catalog id 时只 seed 新 id。
内置插件与用户插件同一 PluginManager 路径，无特权。
```

### 3.2 参数统一 + 闹钟覆盖

```text
storage 是唯一持久化；settings 与 params 同一 key 空间。
effective = defaults + storage + 同名覆盖（后写覆盖）。
覆盖来源（后者优先）：alarm.plugin.params → argv k=v → ENV
（任务 ENV 同名 key，如 mode=drink）。
覆盖不写 storage。meal-spin 用 mode=food|drink 切页。
```

### 3.3 Host panel（减少 ui.html）

```text
compose_host_html 注入 host_panel：可拖动 FAB，贴边吸附，点击 Modal。
Modal 含：参数 key-value、主题 light/dark、通知开关。
主题用 invert+hue-rotate；面板 data-callai-no-invert。
插件 ui.html 禁止再实现全局主题开关/全局通知总闸/第二套参数中心。
业务主界面仍在插件内；主机只吃公共 chrome。
```

### 3.4 Zip 包

```text
package 格式：manifest.json + ui + 可选 callai-package.json + 可选 data.db。
拒绝路径穿越、过深嵌套、未知文件、过大 payload。
import_zip_* / export_zip_*（include_data 布尔）。
Plugins 页：安装按钮 + DnD；导出 Modal 二选一（裸/含数据）。
```

---

## 4. 功能划分与交互扩展

### 4.1 模块边界

```text
                    ┌─────────────────────────┐
  闹钟 / ENV        │  同名覆盖（本次打开）      │
  主机面板参数      │  ───────────────────    │──► getLaunchParams()
                    │  storage 业务 key        │
  插件业务 UI       │  （settings ≡ params）   │
                    └───────────┬─────────────┘
                                │
                                ▼
                         PluginDb (storage)
```

### 4.2 内置 catalog（当前）

| id | 职责 | 典型 key |
| --- | --- | --- |
| `todo` | 待办 | `filter`, `notifyOnOpen`, … |
| `pomodoro` | 番茄钟 | `mode`, `focusMin`, … |
| `meal-spin` | 吃/喝转盘 | `mode`, `spinSeconds`, … |
| `work-report` | 日/周/月报 | `kind`, … |

源目录：`src-tauri/templates/builtin_plugins/`（`include_str!` 进二进制）。

### 4.3 主机保留 key（不是业务分叉）

| key 前缀 | 用途 | 为何允许 |
| --- | --- | --- |
| `__callai_host__/prefs` | theme / notifications | **主机 chrome**，非业务 |
| `__callai_host__/panel` | FAB 坐标 | 主机 chrome |
| `__callai_host__/params` | 面板编辑的业务 key 镜像入口 | 应与业务 key 同名；长期避免与插件内设置 UI 重复维护两套默认值 |

> 学员易混点：`__callai_host__/*` **不是** 第三套「参数哲学」，  
> 只是 **主机注入 UI 的存储命名空间**；业务语义仍是那一套 key。

### 4.4 交互草图

```text
插件窗口
┌──────────────────────────────┐
│  业务 UI（ui.html）           │
│                              │  ┌──┐
│                              │  │⚙│ ← FAB：拖动 / 贴边 / 点击
│                              │  └──┘
└──────────────────────────────┘
        │ click
        ▼
   Modal：参数 | 主题 | 通知
```

```text
Plugins 页
[安装 zip] [AI 创建]
  · 拖入 .zip → import
  · 卡片 [导出] → 裸包 | 含数据
```

---

## 5. 推进流程（推荐 agent 顺序）

1. **定模型**（storage ≡ params；seed 语义；zip 布局）写进 SDK / README  
2. **builtin_plugins 目录 + CATALOG + ensure seed + 测试**  
3. **runtime 覆盖合并 + 开窗带 launch JSON / 已开窗 host-launch**  
4. **meal-spin 合并 + 内置 UI 示范同名 key**  
5. **host_chrome + host_panel 注入 compose**  
6. **package parse/export + 安全测试**  
7. **Plugins 页 pick / DnD / 导出 Modal**  
8. **重写 plugin_sdk.prompt**（告诉 Agent **少写什么**）  
9. **本 record + index**  

每步验收：`cargo test --lib plugin_` / `package` · `clippy -D warnings` · 手测开插件 FAB / 导出再导入。

---

## 6. 真实落地与偏差纠偏

### 6.1 做对的

| 点 | 说明 |
| --- | --- |
| 统一目录 | `templates/builtin_plugins` 可浏览器预览 ui.html |
| Seed marker | 新版本加插件 ≠ 把用户删掉的装回来 |
| 同名覆盖 | ENV / params / argv 一条链 |
| Host panel | 公共设置不再进每个 ui.html |
| Zip 安全 | 穿越 / 过大 / 未知文件拒绝 |
| 导出分叉 | 裸包 vs 含数据显式询问 |

### 6.2 纠偏

| 偏差 | 纠偏 |
| --- | --- |
| food/drink 两个 id | 合并 `meal-spin` + `mode` |
| 把 launch params 讲成第二套产品 | 用户纠正：只是覆盖层命名 |
| `navigate(WebviewUrl)` API 不符 | 已开窗改 `eval` + `callai:host-launch` |
| zip 2.x 过旧 | 升到 stable **8.6**（不用 9 pre） |
| 反色伤图 | 媒体与 FAB 二次反色 + `data-callai-no-invert` |

### 6.3 已知局限（诚实写给学员）

- 反色暗色不是完整 design-token 暗色系统。  
- 已 seed 用户不会自动覆盖旧 `ui.html`（与普通插件一致）。  
- 主机参数面板与插件内「设置」区块可能暂时双入口——**key 必须同名**；教学上强调「一个语义一个 key」。  
- 市场 registry（GitHub）尚未做；本轮只定 **包格式与本地安装面**。

---

## 7. 对 Prompt / Agent 的含义（为什么要改 plugin_sdk）

### 7.1 过去 Agent 为什么把 ui.html 写炸

1. 既要业务 CRUD，又要主题/通知/设置壳  
2. 误用 `localStorage` / 错用 `invoke` 信封  
3. 不知道闹钟如何覆盖同一 key  
4. 输出过大被截断  

### 7.2 主机 panel 之后 Agent 的新合同

| 必须写 | 禁止写 |
| --- | --- |
| 业务主界面与领域数据 | 全局主题开关、全局通知总闸 |
| 用 storage 持久化业务 key | 第二套 params 对象 / 平行 schema |
| 读 `getLaunchParams()` 做同名覆盖 | 假设闹钟编辑器收集业务表单 |
| 小而完整的一屏 | 巨型多路由设置中心 |

**一句话给模型：**

> Host already injects chrome. Your ui.html is the **domain screen only**.

详见更新后的 `src-tauri/prompts/plugin_sdk.prompt`。

---

## 8. 验收清单

### 8.1 内置与 seed

- [ ] 新用户（或空 plugins 目录）启动后可见 todo / pomodoro / meal-spin / work-report  
- [ ] 删除 todo 后重启 **不会** 自动回来  
- [ ] catalog 新增 id 后只 seed 新 id  

### 8.2 参数覆盖

- [ ] 闹钟 `meal-spin` + ENV `mode=drink` 打开喝什么  
- [ ] 另一闹钟 `mode=food` 打开吃什么  
- [ ] 覆盖不污染 storage 里已保存的默认 mode（除非用户在业务 UI 保存）  

### 8.3 Host panel

- [ ] 任意插件右下角（默认）见 FAB；可拖；近边吸附  
- [ ] Modal：参数 / 主题 / 通知可用  
- [ ] 深色：正文反色，图片不「负片」，FAB 仍可读  
- [ ] 关通知后 `notification.show` 不弹系统提示  

### 8.4 Zip

- [ ] 选择 zip / 拖入 zip 安装成功  
- [ ] 非法 zip（缺 manifest / 穿越）失败有清晰错误  
- [ ] 导出裸包再导入：无旧 storage 数据  
- [ ] 导出含数据再导入：storage key 仍在  

### 8.5 工程

```bash
cd src-tauri
cargo test --lib plugin_
cargo test --lib package
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

---

## 9. 练习（学员）

1. **写 prompt：** 要求新增内置插件 `water-reminder`（喝水提醒），说明 seed、key、`__callai_plugin__` 闹钟示例，**禁止**在 ui.html 里做主题开关。  
2. **画有效值：** 给定 storage `{mode:"food"}` + ENV `mode=drink`，写出 effective 与是否写回。  
3. **拆包：** 手造一个缺 `ui.html` 的 zip，预测错误信息。  
4. **对比 SDK：** 打开旧会话里某段「巨型设置页」ui.html，标出哪些块现在应由 host panel 承担。

---

## 10. 给授课者的 8 分钟演示

1. 空数据目录启动 → 四个内置插件。  
2. 删 meal-spin → 重启仍不在。  
3. 两个闹钟同一插件不同 ENV → 不同页。  
4. 打开插件拖 FAB、切深色、关通知。  
5. 导出裸包 / 含数据各一次，再导入对比 storage。  
6. 打开 `plugin_sdk.prompt` 读「Do not reimplement」一节。

---

## 11. 小结

| 层级 | 本轮交付 |
| --- | --- |
| **产品** | 开箱插件 + 可删 + 可定时 |
| **架构** | storage 唯一底层；覆盖层不入库 |
| **主机** | content panel 吃掉公共 UI |
| **分发** | zip 规范 + 本地安装/导出 |
| **Agent** | SDK 明确「少写」比「多 API」更重要 |

下一跳（未做，可当作业）：GitHub registry 索引、签名校验、内置插件版本升级策略（用户已改过的 ui 不覆盖）。


## 12. 跟进落地（本会话续）

| 项 | 状态 |
| --- | --- |
| 内置版本自动升级（未改 UI 时） | `builtins::ensure` / `upgrade_builtins` |
| 恢复内置 | `restore_builtin` + Plugins 卡按钮 |
| 安装冲突 rename/overwrite/fail/skip | `InstallConflictMode` |
| data.db SQLite magic 校验 | package parse/export |
| Host 参数写 `settings` | host_panel 与业务 key 合一 |
| 闹钟快捷 params | meal-spin/todo/pomodoro/work-report |
| MCP list/restore/upgrade | server tools |
| https 安装 zip | `import_plugin_zip_url` |
| Floating actions bar 60% 透明 | host_chrome |

## Follow-up (restore confirm + QA zips + dark chrome)

- Plugins 列表：**恢复内置** / **删除** 均二次确认；恢复可选「同时清空数据」。
- Dark 插件子窗：去掉 `is-content-dark` 外阴影（避免圆角外方形耳朵），titlebar 强制实心深色，置顶/全屏 pill 高对比。
- 测试包：`src-tauri/templates/plugin_packages/test/` + `scripts/build_plugin_test_packages.py`。
- meal-spin 扇区标签：绝对定位 + 反向旋转，保证字在扇区内可见（manifest 0.5.1）。

## Follow-up (alarm ENV is sole param surface)

- Alarm **插件运行** 区只保留 plugin_id / 弹窗策略；去掉参数覆盖表单与 QuickParams。
- **任务 → 环境变量** 是唯一 runtime 覆盖入口：ENV 的 key 与 `storage.settings` 同名即可（如 `mode=drink`）。
- `manifest.params` 可选声明初始 keys；`PluginSummary.param_keys` = 声明 ∪ storage.settings 提取，供 ENV autocomplete。
- 已去掉 CALLAI_PLUGIN_* 参数别名；Task ENV 只用同名 key。保存 alarm 时清空 legacy `plugin.params`。
