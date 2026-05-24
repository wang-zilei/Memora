---
name: architecture-decisions
description: 关键技术决策、数据流、技术栈
metadata:
  type: project
---

## 关键技术决策（2026-05-18 确定）

### 技术栈
- **Demo 后端**：Node.js + Express（localhost:17321），JSON 文件存储（环境无 Rust/VS Build Tools）
- **Demo 前端**：React + Vite + TypeScript，知识库界面
- **Demo 扩展**：Chrome Extension MV3
- **正式版本**：Tauri 2.0（Rust 后端 + SQLite + 桌面应用），待 Demo 验证后迁移

### 数据分层
Raw（原始抓取结果）→ Clean（清洗后纯文本问答）→ KnowledgeCard（AI 总结卡片）

### AI 总结方案
- 模型：GPT-4.1 nano / DeepSeek V3 / GLM-4 Flash（用户自带 Key）
- 单次成本约 ¥0.01，月度 < ¥2
- 任务性质：轻推理，结构化信息提取 + 格式化输出
- **失败兜底**：AI 总结失败时也先创建"待总结"卡片，用户可后补总结

### 抓取优先级
1. 平台内部接口读取（最稳，如豆包 `/im/chain/single`）
2. 语义选择器（如 ChatGPT `data-testid`）
3. 通用 DOM / Shadow DOM 深遍历（兜底）

### 扩展 CSP 约束
MV3 CSP 禁止 background 中使用 `new Function()`，抓取逻辑必须在 content script 中执行。

### 爬取脚本规范化
统一输出为 `{role: "user"/"assistant", content}` Q&A 格式，合并连续同角色消息。9 平台脚本位于 `scripts/`。

### 知识卡片结构
包含：id、title、original_question、insights[]、outputs[]、tags[]、source、raw_messages、clean_messages、created_at、updated_at

### 存储
- Demo：JSON 文件存储
- 正式版本：SQLite（Tauri plugin），通过 `appDataDir()` 确定路径
