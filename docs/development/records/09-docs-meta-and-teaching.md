# 09 · 元数据、开源礼仪与教学沉淀

## 1. 思想：仓库门面与教材是同一套叙事

开源项目被判断的前 30 秒：

- README 是否像成品  
- License 是否清晰（尤其 CC BY-NC 依赖）  
- Topics / description 是否可搜  
- 有没有贡献与安全说明  

教学项目额外多一条：

> 过程是否可复述——否则 AI Coding 课只剩「魔法成功」。

所以 callai 同时做了：

- 对外：LICENSE / CONTRIBUTING / SECURITY / 双语 README / topics  
- 对内：`docs/development/records` + `scripts` 说明 + `TODO` 留存  

---

## 2. 原始 prompt 拆解

### 2.1 开源门面

```text
GitHub description、tags… 填好
license、contribution 文档写好
双语 README + logo + elements
```

### 2.2 教学沉淀（本轮）

```text
分析 commits 和 prompt，拆解 prompt，说明为什么好
说明需求从何而来、如何清晰描述、如何驱动 agent
交互拓展、功能拆解、真实执行与偏差
让每篇展示思想、操作、流程、功能划分
```

**这段本身就是元 prompt**：用户在教你「如何写教材」。  
好在哪：评价标准清晰（思想/操作/流程/偏差），不是「再写长一点」。

---

## 3. 给 AI 的提示模板（文档类）

```markdown
## 目标
为 AI coding 课写 records，对象=学员，不是 changelog。

## 每篇必须包含
思想动机 / prompt 原文与拆解 / 好在哪 / 模板 /
功能划分 / 推进流程 / 真实 commit 与偏差 / 验收 / 练习

## 证据
- git log
- TODO
- PRODUCT/usecases
禁止空话，禁止无 commit 的编造功能。
```

---

## 4. 功能划分（文档系统）

| 资产 | 角色 |
| --- | --- |
| `TODO` | 原始口语，脏但全 |
| `PRODUCT/DESIGN/usecases` | 产品真源 |
| `docs/development/records` | 教学叙事 |
| `scripts/**/README` | 操作手册 |
| GitHub 元数据 | 发现与信任 |
| `CHANGELOG` / releases | 用户可见历史 |

---

## 5. 推进流程：从对话到教材

```text
1. git log --reverse 建时间线
2. TODO 切段 → 映射到阶段
3. 每阶段选 1–3 个代表 commit 深挖 message body
4. 写「偏差表」（计划 vs 实际）
5. 补练习题（强制动手）
6. 更新 00-index 学习路径
7. README 链到 development 入口
```

---

## 6. 真实执行

| Commit | 内容 |
| --- | --- |
| `f3ab0ff` | MIT 等社区文件 + 双语 README + icons 强制入库 |
| `fec4fe6` | README 版本进入 release-please |
| `3f4a97f` | records 初版 + media 脚本文档 |
| 本轮扩写 | records 加深：prompt 批评与模板 |

偏差：初版 records 偏「目录卡片」→ 用户明确要求加深 → **按统一骨架重写**（本文件所在迭代）。

---

## 7. 如何评价一篇 record 是否「能上课」

- [ ] 脱离开聊天记录，学员能复述需求动机  
- [ ] 有至少一段 **可复制 prompt 模板**  
- [ ] 有 **commit 证据**  
- [ ] 有 **偏差/纠偏**（展示真实工程）  
- [ ] 有 **练习**（防止只听不练）  

---

## 8. 练习（给助教）

1. 指定一个未来功能（如「导入/导出闹钟」），先写 record 草稿再开发。  
2. 把 `TODO` 某一段差 prompt 改成模板，对比 agent 两次产出。  
3. 组织 15 分钟 code walk：只带 `00-index` + 一个路径 A 子集。  

## 9. 关键

`docs/development/*` · `TODO` · `LICENSE` · `CONTRIBUTING.md` · GitHub repo settings  
