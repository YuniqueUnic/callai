# 09 · 仓库元数据、许可证与教学沉淀

## 学员目标

- 会配置 GitHub description / topics / LICENSE / CONTRIBUTING  
- 理解「把对话需求沉淀为 records」对 AI 协作课的价值  
- 能维护 `docs/development/records` 作为下一届教材  

## 原始诉求（摘要）

- GitHub 信息、license、contribution 文档写好  
- 双语 README + logo/elements  
- **分 commits 写 records，方便 AI coding 实战教学**  
- scripts 流程文档化，便于复用  

## 关键提交

| Commit | 说明 |
| --- | --- |
| `f3ab0ff` | LICENSE / CONTRIBUTING / SECURITY / 双语 README / icons |
| `fec4fe6` | release-please 同步 README 版本 |
| （本篇） | `docs/development/*` + `scripts/*` 文档 |

## 教学资产地图

```
TODO                         # 口语 prompt 总集（脏、全）
docs/development/records/    # 结构化教案（干净、可讲）
scripts/                     # 可执行流程
usecases/ + PRODUCT.md       # 产品真源
.git history                 # 证据链
```

## 如何新增一篇 record

1. `git log --oneline` 找代表提交  
2. 从 `TODO` / 对话摘 3–10 行原始诉求  
3. 复制本目录任一模板结构写 `NN-title.md`  
4. 更新 `00-index.md` 学习路径表  

## 练习

1. 针对下一次需求，先写 record 草稿再让 AI 改代码（规格驱动）。  
2. 给学员布置：只读 records 00–03，不看聊天记录，复述 callai 是什么。
