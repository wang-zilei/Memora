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
| 富文本编辑（narrative + unresolved_questions） | ✅ | TipTap B/I/U/高亮，后端已就绪，前端已完成 |
| 客户端 UI 视觉重设计 | 🚧 | 便签学习风，仅改视觉层，不改业务逻辑/API/数据库 |

---

## 关键里程碑

### 2026-05-27 — 客户端 UI 重设计护栏

**范围约束**：新增 `Guidance/UI-REDESIGN-GUARDRAILS.md`，明确本轮只做客户端 UI 视觉优化。

**固定不变量**：

- 不修改 Rust 后端、SQLite schema、AI Pipeline、prompt、扩展抓取逻辑。
- 不修改 `api.ts` HTTP/Tauri 适配、API 路由、字段含义、页面状态语义。
- 不替换现有图标资产和图标含义；品牌名称从 SVG wordmark 改为文字 `Memora` 属于 UI 表现层。

**允许修改**：

- `demo/web/src/App.tsx` 中的展示结构、className、品牌文字和非业务视觉容器。
- `demo/web/src/index.css` 中的视觉系统、布局、颜色、字体、间距、边框、阴影与交互状态。

**设计方向**：浅色便签学习风。列表页更像知识便签墙，详情页更像重点阅读区；参考 `design/DESIGN.md` 的材质感、细边线、克制强调色与系列化组件语言，但不采用暗黑系。

### 2026-05-27 — 数据库路径迁移 + 筛选计数修复 + 富文本编辑方案

**数据库路径**：从 `target/debug/knowledge_base.db` 迁移到 `%APPDATA%/com.memora.app/knowledge_base.db`，首次启动自动迁移旧数据。以后 `cargo clean` 不影响用户数据。

**筛选计数修复**：`http_get_cards` / `get_cards` 的 COUNT 查询缺少参数绑定，筛选意图分类时计数始终为 0。改为 `sqlx::query` + `bind_json` 绑定参数后正常。

**富文本编辑方案（已完成）**：详情页 narrative 和 unresolved_questions 字段支持所见即所得编辑。

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

| 位置 | 改动 | 状态 |
|------|------|------|
| `http_update_card` (Rust) | 新增 `unresolved_questions` 字段处理（JSON serialize） | ✅ |
| `update_card` Tauri command | 新增 `narrative` + `unresolved_questions` 参数 | ✅ |

**前端需改动**：

| 文件 | 改动 | 状态 |
|------|------|------|
| `package.json` | + `@tiptap/react` `@tiptap/starter-kit` `@tiptap/extension-underline` `@tiptap/extension-highlight` | ✅ |
| `App.tsx` CardDetail | narrative / unresolved_questions 用 `<Editor>` 替换 `<div>`，加格式工具栏 | ✅ |
| `index.css` | 编辑器工具栏样式（`.tiptap-editor` / `.tiptap-toolbar`） | ✅ |

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

### 2026-05-27 — 卡片列表分页阈值修复

**根因**：列表页前端请求 `pageSize=20`，分页计算也硬编码为 20；当前数据库共 16 张卡片，因此 `totalPages=1`，分页按钮按条件隐藏，页面表现为一次展示全部卡片并继续向下滚动。

**修复**：新增 `CARD_LIST_PAGE_SIZE = 12` 作为统一分页常量，同时用于 `/api/cards` 请求和 `totalPages` 计算。当前 16 张卡片会显示为 2 页，保留原有后端 API、路由、状态语义和卡片交互逻辑。

### 2026-05-27 — 客户端桌面图标统一

**目标**：将 Windows/Tauri 客户端显示图标改为导航栏顶部同款折叠便签 Logo，并让图形在系统图标画布中显示得更大。

**修复**：更新 `scripts/convert-icon.cjs`，图标源从旧 orb 图形切换为 `assets/logo.svg`，使用更紧的裁切视窗生成 `src-tauri/icons` 下的 32/128/256 PNG、ICO 和 ICNS 资源。未修改导航、路由、API、状态管理或业务逻辑。

### 2026-05-27 — 图标尺寸与快速开始文案微调

**图标**：`scripts/convert-icon.cjs` 改为先 trim 透明留白，再按 98% 内容占比居中生成桌面图标，让折叠便签 Logo 在系统图标中更大。

**设置页**：快速开始第 2 步从限定 Chrome 改为“支持扩展的浏览器”，并补充当前支持平台：豆包、元宝、DeepSeek、Kimi、Qwen、ChatGPT、Gemini。

**文案约束**：快速开始第 3 步示例平台移除 Claude，保持与当前支持范围一致。

### 2026-05-27 — 桌面图标黑边修复

**根因**：上一版图标放大时裁切过紧，SVG 外层阴影和抗锯齿边缘贴近系统图标画布，Windows 缩放显示时容易形成黑色边框感。

**修复**：桌面图标生成脚本改为固定安全 viewBox、透明底板居中合成，并在图标导出时移除外层投影；32/128/256 三种尺寸最外圈像素均验证为完全透明。

### 2026-05-27 — 列表页抓取后刷新修复

**根因**：浏览器扩展抓取后直接 POST 到 Tauri HTTP 后端，前端列表页没有事件订阅，停留在列表页时不会主动重新拉取 `/api/cards`，因此总数变化和卡片列表可能短暂不同步。

**修复**：列表页新增“刷新”按钮，放在“全部/意图 · 共 X 条”旁边；列表页可见时每 6 秒静默刷新当前筛选/分页数据，让外部抓取生成的新卡片自动出现在列表中。

### 2026-05-27 — Release 分发结构约定

**分发逻辑**：GitHub Releases 提供 Windows 与 macOS 两个 zip，用户只下载自己系统对应的一个包。

**包结构**：每个 zip 顶层固定包含 `plugin/` 与 `client/` 两个主文件夹；`plugin/` 放浏览器扩展，`client/` 放对应平台桌面客户端。详细规则见 `Guidance/RELEASE-DISTRIBUTION.md`。

### 2026-05-27 — 插件发布前收口

**目标**：让用户下载 release zip 后，浏览器插件的提示和权限模型面向真实客户端安装流程，而不是开发态后端流程。

**修复**：插件 popup 从“运行 npm run server”改为“启动 Memora 客户端”；manifest 补充 `http://localhost/*` 与 `http://127.0.0.1/*` 权限，用于 popup/background 访问本地客户端 API；插件注入平台收口到当前对外支持的豆包、元宝、DeepSeek、Kimi、Qwen、ChatGPT、Gemini。未修改路由、数据库、状态管理或抓取入库/AI Pipeline 逻辑。

### 2026-05-27 — GitHub Release 自动打包

**发布方式**：新增 GitHub Actions release 工作流，tag push 或手动触发后分别在 Windows/macOS runner 构建客户端，并发布 `Memora-windows.zip`、`Memora-mac.zip` 两个 release 资产。

**包结构**：两个 zip 解压后的第一层均为 `plugin/` 与 `client/`。`plugin/` 仅复制扩展运行必需文件，`client/` 放对应平台 Tauri 构建产物；不打包 `node_modules`、`.env`、测试数据或本机开发缓存。

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
