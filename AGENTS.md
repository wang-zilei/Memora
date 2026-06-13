# AGENTS.md — 规则

## 项目简介

LLM 对话自动沉淀知识库工具。详见 [docs/PRD-v1.md](docs/PRD-v1.md)

## 项目索引

### Guidance/（协作文档 — 用户级规范要求）

| 文档 | 用途 |
|------|------|
| [Guidance/status.md](Guidance/status.md) | 项目当前状态（阶段/进行中/待解决） |
| [Guidance/summary.md](Guidance/summary.md) | 项目简报（给人看的 5 分钟概览） |
| [Guidance/architecture/overview.md](Guidance/architecture/overview.md) | 工作区文件层级 + 技术栈 + 架构图 |
| [Guidance/architecture/changelog.md](Guidance/architecture/changelog.md) | 架构变更历史 |
| [Guidance/knowledge/index.md](Guidance/knowledge/index.md) | Bug 修复记录 + 可复用范式索引 |
| [Guidance/logs/index.md](Guidance/logs/index.md) | 每日会话日志索引 |
| [Guidance/CHANGELOG.md](Guidance/CHANGELOG.md) | Guidance 自身结构变更记录 |
| [Guidance/UI-REDESIGN-GUARDRAILS.md](Guidance/UI-REDESIGN-GUARDRAILS.md) | UI 重设计护栏规则 |
| [Guidance/RELEASE-DISTRIBUTION.md](Guidance/RELEASE-DISTRIBUTION.md) | Release 分发结构约定 |

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

### 3. 中文沟通

使用中文，技术术语保留英文。
