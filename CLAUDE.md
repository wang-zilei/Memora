# CLAUDE.md — 规则

## 项目简介

LLM 对话自动沉淀知识库工具。详见 [docs/PRD-v1.md](docs/PRD-v1.md)

## 项目索引

### Guidance/（协作文档 — 用户级规范要求）

| 文档 | 用途 |
|------|------|
| [Guidance/PROGRESS.md](Guidance/PROGRESS.md) | 任务阶段进度 |
| [Guidance/bug-log.md](Guidance/bug-log.md) | Bug 记录与根因分析 |
| [Guidance/architecture.md](Guidance/architecture.md) | 工作区文件层级说明 |
| [Guidance/project-log.md](Guidance/project-log.md) | 会话总结记录 |

### docs/（产品与技术文档）

| 文档 | 用途 |
|------|------|
| [docs/PRD-v1.md](docs/PRD-v1.md) | 产品需求文档 |
| [docs/chat-capture-research.md](docs/chat-capture-research.md) | 抓取方案调研 |
| [docs/Progress.md](docs/Progress.md) | 旧进度记录（已迁移到 Guidance/PROGRESS.md） |
| [docs/Errors.md](docs/Errors.md) | 旧报错记录（已迁移到 Guidance/bug-log.md） |
| [docs/架构.md](docs/架构.md) | 旧架构文档（已迁移到 Guidance/architecture.md） |

## 规则

### 1. 需求先约束

接到模糊需求时，必须先向用户提问确认边界和范围，不可自行脑补假设直接开干。

### 2. 结构变更必须记录

任何关键文档（PRD、架构定义、数据模型）或代码（目录结构、接口定义、类型定义）的结构性变更，须在 [Guidance/PROGRESS.md](Guidance/PROGRESS.md) 中追加记录，说明变更内容与原因。

### 3. 参考项目隔离

`ctxport/`、`chat-export/`、`gemini-voyager/` 是独立参考项目，各有 `.git`，修改时注意作用域，不可越界改动。

### 4. 中文沟通

使用中文，技术术语保留英文。
