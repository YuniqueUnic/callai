# callai 开发过程记录（AI Coding 实战教材）

本目录把真实项目里的 **口语需求 → 清晰规格 → agent 推进 → 偏差纠偏 → 可复现命令** 整理成可授课材料。

## 从这里开始

1. 读 [`records/00-index.md`](./records/00-index.md) 选学习路径  
2. 对照根目录 [`TODO`](../../TODO) 看「生肉 prompt」  
3. 对照 [`PRODUCT.md`](../../PRODUCT.md) / [`usecases/`](../../usecases/) 看规格真源  
4. 对照 `git log --oneline --reverse` 看落地证据  
5. 操作手册见 [`scripts/README.md`](../../scripts/README.md)

## 每篇 record 教什么

| 块 | 学员获得 |
| --- | --- |
| 思想 / 动机 | 为什么要做，不为什么炫技 |
| Prompt 拆解 | 好 prompt 的结构与反例 |
| 提示模板 | 可复制给下一次 agent |
| 功能划分 | 模块边界与非职责 |
| 推进流程 | 推荐执行顺序 |
| 偏差表 | 真实工程不是直线 |
| 验收 + 练习 | 可考核 |

## 维护

新增大阶段需求后：新增 `records/NN-*.md`，更新 `00-index.md` 时间线。
最近完整长文示例：[`records/12-runtime-hardening-and-sfx.md`](./records/12-runtime-hardening-and-sfx.md)。  
禁止把私钥、本机绝对路径密钥、`assets/screenshot/original` 大文件写进教材附件。

## 专题速查

- winget 投稿硬规则（一应用一 PR、CLA 评论签署）：[`records/11-packaging-brew-scoop-winget.md`](./records/11-packaging-brew-scoop-winget.md) **§9**
