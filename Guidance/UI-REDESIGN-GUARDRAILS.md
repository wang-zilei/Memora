# UI 重设计护栏

> 目标：为 Memora 客户端做视觉层重设计，让界面更像 ins 简洁高级风的个人知识收藏夹，同时不改变既有功能逻辑、数据链路和用户流程。

---

## 一、当前功能流程和主要页面结构

### 1. 全局应用流程

```
Chrome 扩展抓取 LLM 对话
  -> POST /api/capture
    -> Rust 后端清洗 Raw -> Clean
      -> AI Pipeline 生成 KnowledgeCard
        -> SQLite 存储
          -> React 客户端展示、筛选、编辑、导出
```

客户端前端当前是单窗口桌面应用，主结构为：

```
App
  ├─ Sidebar
  │   ├─ 品牌区
  │   ├─ 首页 / 收藏 / 统计
  │   ├─ 10 个意图分类入口
  │   ├─ 标签筛选入口
  │   └─ 设置入口
  └─ MainContent
      ├─ CardList
      ├─ FavoritesList
      ├─ StatisticsPage
      ├─ CardDetail
      └─ SettingsPage
```

### 2. 首页 CardList

首页承载知识卡片检索和浏览：

- 搜索栏：输入关键词，按 Enter 或点击搜索触发 `getCards`。
- 筛选状态：支持当前意图分类、当前标签筛选、清除标签筛选。
- 卡片网格：展示 title、narrative 摘要、card_type、tags、captured_at。
- 卡片操作菜单：收藏 / 删除，使用本地覆写状态避免菜单 remount。
- 分页：上一页 / 当前页 / 下一页。
- 空状态：提示通过浏览器悬浮球生成知识卡片。

### 3. 收藏 FavoritesList

收藏页展示 `starred=true` 的卡片集合：

- 加载收藏卡片。
- 使用与首页一致的卡片结构。
- 支持取消收藏、删除、进入详情。
- 空状态提示用户从详情或卡片菜单收藏。

### 4. 统计 StatisticsPage

统计页展示正向反馈数据：

- 知识卡片总数。
- 按意图分类分布。
- 按平台分布。
- 热门标签 TOP 10。

### 5. 详情 CardDetail

详情页是重点阅读和人工策展区域：

- 顶部返回、标题、编辑标题、导出、更多菜单。
- 总结失败提示和重新总结入口。
- Tab：概览 / 原始对话。
- 概览 Tab：
  - card_type 可切换。
  - original_question 只读显示。
  - narrative 使用 TipTap 富文本编辑并自动保存。
  - unresolved_questions 使用 TipTap 富文本编辑并自动保存。
  - tags 只读展示。
  - source 信息和回到原始对话入口。
- 原始对话 Tab：
  - cleanMessages 按用户 / 平台分段显示。

### 6. 设置 SettingsPage

设置页管理 AI API 配置：

- API Key。
- API 地址。
- 模型名称。
- 测试连接。
- 保存设置。
- 快速开始步骤。

---

## 二、不应修改的业务逻辑、交互行为、图标资产、路由/API/状态管理

### 1. 不修改的数据链路

- 不修改 Chrome 扩展抓取逻辑。
- 不修改 Rust HTTP server。
- 不修改 SQLite schema、迁移策略、数据库路径。
- 不修改 Raw -> Clean -> KnowledgeCard 三层数据模型。
- 不修改 AI Pipeline、prompt 路由、分类器、去重逻辑。
- 不修改任何 `src-tauri/` 后端 API 实现。

### 2. 不修改的 API 和路由

以下接口路径、方法、参数语义保持不变：

- `POST /api/capture`
- `GET /api/cards`
- `GET /api/cards/{id}`
- `PUT /api/cards/{id}`
- `DELETE /api/cards/{id}`
- `POST /api/cards/{id}/summarize`
- `GET /api/tags`
- `GET /api/statistics`
- `GET /api/settings`
- `PUT /api/settings`
- `POST /api/settings/validate`
- `POST /api/open-url`
- `GET /api/status`

`demo/web/src/api.ts` 中的 HTTP / Tauri 双模式适配不属于本次 UI 重设计范围。

### 3. 不修改的状态管理和交互语义

- 不改变 `Page = list | detail | settings | favorites | statistics`。
- 不改变 `selectedCardId`、`currentCardType`、`currentTag`、`searchKeyword`、`cards`、`totalCards`、`currentPage` 的职责。
- 不改变卡片点击进入详情。
- 不改变返回详情页后的 `handleBack` 行为。
- 不改变搜索的 Enter 和按钮触发方式。
- 不改变意图分类、标签筛选、收藏、删除、分页、导出、编辑标题、切换 card_type、重新总结、回到原始对话等交互结果。
- 不改变 TipTap 编辑器的保存时机和 `updateCard` 字段。
- 不改变 P-010 局部状态覆写模式的意图。

### 4. 不修改的字段含义

以下字段只允许改变显示样式，不允许改变含义、来源或写入方式：

- `title`
- `original_question`
- `card_type`
- `narrative`
- `tags`
- `unresolved_questions`
- `source.platform`
- `source.url`
- `source.captured_at`
- `cleanMessages`
- `starred`
- `summarize_error`

### 5. 不替换的图标资产与图标含义

- 保留现有 `LogoIcon` 图形资产。
- 保留 Material Symbols 导航图标及其语义。
- 保留 `like.svg`、`liked.svg`、`delete.svg` 的语义。
- 可以调整图标尺寸、颜色、容器、hover/focus 状态。
- 品牌名称要求从 `LogoWordmark` 图片改为可选中文件中的文字 `Memora`。

---

## 三、UI 层允许修改的范围

### 1. 允许修改的文件范围

本轮 UI 视觉优化主要允许修改：

- `demo/web/src/App.tsx`：仅限展示结构、className、品牌文字和非业务文案容器。
- `demo/web/src/index.css`：视觉系统、布局、颜色、字体、间距、边框、阴影、状态样式。
- `Guidance/UI-REDESIGN-GUARDRAILS.md`：本护栏文档。
- `Guidance/PROGRESS.md`：记录本次结构性文档和 UI 变更。

除非另有明确需求，不修改：

- `demo/web/src/api.ts`
- `demo/web/src/types.ts`
- `src-tauri/**`
- `src-tauri/db/schema.sql`
- `docs/prompts/**`
- `demo/extension/**`

### 2. 允许调整的视觉系统

- 全局背景、侧边栏背景、主页面背景。
- 字体大小、字重、行高，中文字体组合最多三类用途：界面字体、阅读字体、品牌/标题字体。
- 卡片列表样式：便签感背景、边框、角标、纸张层次、hover 状态、标签样式。
- 详情页样式：重点区域氛围、阅读容器、Tab、标题、工具按钮、来源信息。
- 核心问题与关键结论文本框：边框、背景、标题样式、编辑器工具栏、焦点状态。
- 设置页、收藏页、统计页：保持同一系列的浅色学习工具风格。
- 所有可交互元素的 hover、focus、disabled、active、loading、empty、error 状态。

### 3. 本次设计方向

视觉主题：ins 简洁高级风。

设计关键词：

- 浅色、近白、轻暖、干净、细线、统一卡片、个人收藏夹。
- 用轻微阴影、细边框、留白和字体层次制造高级感。
- 避免暗黑系、避免营销站式大图、避免大面积单一紫蓝渐变。
- 避免便签折角、避免多色卡片、避免厚重黄色块。
- 详情页要比列表页更像干净阅读卡，而不是表单或便签。
- 系列化：列表卡片、详情面板、设置表单、统计卡片使用同一套近白底、墨色、细边线、轻标签语言。

### 4. 验收标准

- `npm run build` 通过。
- 客户端能启动并展示首页。
- 首页、收藏页、统计页、详情页、设置页视觉统一。
- 详情页与列表页有明确层级差异。
- 搜索、筛选、收藏、删除、分页、Tab、导出、编辑标题、TipTap 编辑、设置保存/测试连接入口仍可见。
- 视觉修改不引入 API、数据库、状态管理、路由、字段含义变化。
