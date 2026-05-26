# 项目阶段进度

> 记录项目开发里程碑与关键变更。每次更新时追加到末尾。

---

## 当前阶段

| 阶段 | 状态 | 说明 |
|------|------|------|
| Tauri 客户端核心功能 | ✅ | HTTP API + SQLite + AI Pipeline + 清洗模块 |
| 前端 UI/UX | ✅ | 列表/详情/收藏/统计/设置/导出 |
| Chrome 扩展 | ✅ | 悬浮球 + 9 平台自动检测 + 抓取 |
| 意图识别 Pipeline | ✅ | 4 步流水线（切分→分类→生成→去重） |
| 数据库路径迁移 | ✅ | `%APPDATA%/com.memora.app/` |
| 富文本编辑（narrative + unresolved_questions） | ⬜ | TipTap 方案待开发 |

---

## 关键里程碑

### 2026-05-27 — 数据库路径迁移 + 筛选计数修复 + 富文本编辑方案

**数据库路径**：从 `target/debug/knowledge_base.db` 迁移到 `%APPDATA%/com.memora.app/knowledge_base.db`，首次启动自动迁移旧数据。以后 `cargo clean` 不影响用户数据。

**筛选计数修复**：`http_get_cards` / `get_cards` 的 COUNT 查询缺少参数绑定，筛选意图分类时计数始终为 0。改为 `sqlx::query` + `bind_json` 绑定参数后正常。

**富文本编辑方案（待开发）**：详情页 narrative 和 unresolved_questions 字段支持所见即所得编辑。

| 事项 | 内容 |
|------|------|
| 技术选型 | TipTap（`@tiptap/react` + starter-kit + extension-underline + extension-highlight） |
| 存储格式 | narrative → HTML string；unresolved_questions → JSON string[] |
| 编辑器功能 | 加粗 / 斜体 / 下划线 / 2/3 荧光侧标 / 换行 / 增删文字 |

**前端数据字段（CardDetail 概览 Tab）**：

| 字段 | 类型 | 当前 | 修改后 |
|------|------|------|--------|
| card_type | string | 下拉切换编辑 | 不变 |
| original_question | string | 只读显示 | 不变 |
| narrative | string | 只读显示 `<div>` | TipTap `<Editor>` 可编辑 |
| unresolved_questions | string[] | 未显示 | 新增显示 + TipTap `<Editor>` 可编辑 |
| tags | string[] | 只读显示 | 不变 |
| source | object | 只读显示 | 不变 |

**保存数据链路**：

```
用户编辑 → TipTap onUpdate 捕获 HTML
  → updateCard(id, { narrative: "<p>html</p>", unresolved_questions: [...] })
    → PUT /api/cards/:id
      → http_update_card: UPDATE knowledge_cards SET narrative=?, unresolved_questions_json=?
        → 前端刷新 → DOMPurify.sanitize() 安全渲染
```

**后端需改动**：

| 位置 | 改动 |
|------|------|
| `http_update_card` (Rust) | 新增 `unresolved_questions` 字段处理（JSON serialize） |
| `update_card` Tauri command | 新增 `narrative` + `unresolved_questions` 参数 |

**前端需改动**：

| 文件 | 改动 |
|------|------|
| `package.json` | + `@tiptap/react` `@tiptap/starter-kit` `@tiptap/extension-underline` `@tiptap/extension-highlight` |
| `App.tsx` CardDetail | narrative / unresolved_questions 用 `<Editor>` 替换 `<div>`，加格式工具栏 |
| `index.css` | 编辑器工具栏样式（`.tiptap-editor` / `.tiptap-toolbar`） |

**完成标准**：详情页 narrative 和 unresolved_questions 可编辑，工具栏含 B/I/U/高亮，保存后内容正确显示。

---

### 2026-05-26 — 客户端 3 列布局 + 实时反馈 + 质检兜底

**布局修复**：Tauri 窗口 1440px，侧边栏 260px，卡片网格 `minmax(230px, 1fr)`，3 列适配。

**收藏删除实时反馈**：局部状态覆写模式（P-010）解决 React 内联组件 remount 导致 local state 丢失。SVG 图标 + 自定义 ConfirmModal 弹窗。

**AI 输出质检**：`sanitizeContent()` 7 步正则在三层链路复用（capture → Pipeline → 前端），作为 Prompt 约束之外的兜底。

**外部链接**：`POST /api/open-url` 后端端点（Rust `open::that` / Express `child_process.exec`），解决 Tauri HTTP mode 下前端 IPC 不可用。

### 2026-05-26 — 分类器三层修复

**根因**：`extract_prompt_block()` 提取范围是 `## 角色设定` → `## 示例输出`（不含），few-shot 示例放在 `## 示例输出` 之下，从未发送给 LLM。

**修复**：1) Prompt 从 300 行压缩到 ~110 行决策树格式；2) `intent_by_key()` 新增中文标签反向匹配；3) few-shot 移到 `## 典型范例` 节（在 `## 示例输出` 之前）。

### 2026-05-26 — Tauri 1:1 复刻 Demo 数据链路

**对话清洗模块**：Rust 端完整移植 Demo 的 4 步清洗（normalize_role / clean_content / merge_consecutive / clean_conversation），数据流从"原始消息直存"改为"先清洗后存储+传入 Pipeline"。

**HTTP 路由补全**：9 个 handler + 11 条路由，axum 0.8 语法。FTS 触发器从 content 外部表改为独立表。

### 2026-05-25 — 前端 UI 全面重构

| 模块 | 关键设计 |
|------|---------|
| 侧边栏 | Logo SVG + Material Symbols 字体图标导航 + 标签云（可点击筛选） |
| 卡片列表 | narrative 摘要预览 + ⋮ 更多菜单 + 意图标签 tint 配色 + 标签截断 |
| 详情页 | Tab 式（概览/原始对话）+ 可编辑标题 + card_type 下拉切换 + 导出（TXT/PDF/图片） |
| 设置页 | 米色卡片容器 + 测试连接 + 动态模型预设 + 用户模式快速开始指南 |
| 收藏/统计 | 收藏列表 + 统计面板（总数/意图分布/平台分布/标签 TOP） |

### 2026-05-24 — 切分+去重架构重构 + topic 字段移除

topic 和 tags 语义重叠，tags 的层级格式已足够承担分类/筛选功能。从数据库 schema、Rust struct、TypeScript 类型、前后端 API、全部 10 个 prompt 中彻底移除 topic 字段。

去重逻辑改为：card_type + original_question 语义相似度 + 标题相似度 + narrative 前 200 字重叠，7 条综合判断规则。话题切分 prompt 新增"合并优先""同一主题下子话题不拆分"原则。

### 2026-05-23 — 4 步 Pipeline + PRD-v2 数据模型

Pipeline：数据清洗 → 话题切分 → 意图分类 → 卡片生成，3 个独立 LLM 调用。

10 个意图大类（全中文值）：概念理解/事实查询/技能学习/操作指南/内容创作/文本处理/规划决策/头脑风暴/交互陪伴/其他。每个意图有独立 prompt（角色设定 + 逐字段 JSON 描述 + 叙事规则 + 多示例）。

数据模型：Raw → Clean → KnowledgeCard 三层，card_type / narrative / full_output / unresolved_questions / tags 等字段对齐 PRD-v2。

### 2026-05-22 — PRD-v2 产品需求文档

融合 PRD-v1 + 5 方向深度产品思考，确立产品方案。明确排除：图片 base64、文件附件抓取、桌面客户端抓取、OCR、标签云、虚拟货币统计。

### 2026-05-15~18 — 项目启动 + Demo 开发

后端 Node.js + Express（localhost:17321，JSON 存储），前端 React + Vite + TS，Chrome 扩展 MV3（悬浮球 + 9 平台自动检测）。参考项目：chat-export / ctxport / gemini-voyager。

---

## Tauri 客户端架构（当前生效）

### 数据路径
```
扩展 content.js → HTTP POST /api/capture (17321)
  → Rust: clean_conversation() 清洗
    → raw_conversations 表（原始）
    → clean_conversations 表（清洗后）
    → run_ai_pipeline() 4 步流水线
      → knowledge_cards 表（卡片）
```

### 数据库
- 路径：`%APPDATA%/com.memora.app/knowledge_base.db`
- 6 表：raw_conversations / clean_conversations / knowledge_cards / settings / user_stats / cards_fts
- 前端通信：`VITE_API_MODE=http` → fetch → Tauri Rust HTTP server (17321)

### 前端模式
- HTTP (Demo)：Vite proxy `/api` → Express/Tauri HTTP server (17321)
- Tauri IPC：invoke Rust commands（当前未启用）
