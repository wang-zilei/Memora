---
name: project-overview
description: 项目定位、产品形态、MVP范围
metadata:
  type: project
---

## 项目：LLM 对话自动沉淀知识库工具

### 产品定位
将用户与大模型（豆包/GPT/DeepSeek 等）的对话，自动提炼为结构化知识卡片，归入本地私有知识库，随时可检索、可复盘、可导出。

### 核心痛点
高频使用多个 LLM 的知识工作者，对话产出大量知识但不会手动整理；各平台历史记录杂乱、不可跨平台检索，有价值的内容持续沉没。

### 产品形态
**Tauri 2.0 桌面应用 + 浏览器扩展（MV3）**
- 扩展：轻量抓取探头，负责识别平台 + 抓取对话 + 通过 HTTP localhost:17321 传给桌面应用
- 桌面应用：知识库主界面（React + TS）、本地 HTTP 服务、SQLite 持久化、系统托盘

### MVP 范围（Phase 1）
仅支持豆包单平台，手动点击悬浮球触发抓取→AI 总结→入库。详见 [[architecture-decisions]]

### 分阶段策略
- Phase 1：手动点击悬浮球 → 抓取+总结+入库
- Phase 2：智能提醒（检测到新对话，悬浮球提示确认）
- Phase 3：全自动发现+沉淀（默认关闭，用户主动开启）
- 核心原因："对话结束"是模糊概念，分阶段让用户有控制感

### 参考项目
- `ctxport/` — 豆包内部接口实现已验证可行
- `chat-export/` — ChatGPT/Claude/Gemini 导出扩展（参考多平台抓取实现）
- `gemini-voyager/` — Gemini 增强扩展（参考扩展架构）
