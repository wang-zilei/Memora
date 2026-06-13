# Ins Minimal UI Redesign Implementation Plan

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use `executing-plans` or equivalent step-by-step implementation discipline. Before touching code, use `frontend-design` for visual execution and treat this document as the source of truth.

**Goal:** 将 Memora 客户端从当前便签学习风调整为更接近 Instagram 简洁高级风的轻量视觉系统，同时不改变任何产品功能、数据链路、API、状态语义或用户操作结果。

**Architecture:** 本次只做 React 客户端视觉层改造。`demo/web/src/App.tsx` 仅允许做展示结构、品牌区、className 和非业务容器调整；`demo/web/src/index.css` 承载主要视觉系统、布局细节、颜色、字体、边框、阴影和状态样式。Tauri/Rust 后端、SQLite、AI Pipeline、浏览器扩展抓取逻辑和 API 适配层全部保持不变。

**Tech Stack:** React + TypeScript + Vite + TipTap + Tauri 2.0 + CSS。

---

## 0. 设计方向

### 目标气质

- Ins 简洁高级风：浅色、近白、轻暖、细线、克制阴影、统一卡片底色。
- 视觉像“内容收藏夹 / 灵感相册 / 高级个人知识库”，不要像营销页，也不要像厚重便签墙。
- 页面结构尽量继承当前产品，不做大幅 IA 改造。

### 已确认原型

- 首页原型：`design/ins-minimal-prototype/dashboard.html`
- 首页截图：`design/ins-minimal-prototype/dashboard.png`
- 详情页原型：`design/ins-minimal-prototype/detail.html`
- 详情页截图：`design/ins-minimal-prototype/detail.png`

### 视觉规则

- 侧边栏：更浅的奶油白/米白背景，保留 `Library / Intent / Tags` 优雅英文字体分组。
- 侧边栏 active：保留突出效果，但使用近白底、细边框、轻阴影、小色条，不用大面积橙黄块。
- Logo：当前左上角 Logo 可替换，允许自由发挥，但只能替换视觉资产/组件，不改变品牌区功能。
- 品牌文字：保留 `Memora` 大字和“微忆，让知识在对话里生长”。
- 主页面背景：保留轻微网格/浅暖背景，但降低存在感。
- 卡片预览：统一近白底，不要不同颜色，不要折角；只用细边框、圆角、轻阴影、留白建立层次。
- 字体：标题不要黑体，正文不要楷体。推荐标题用 serif 气质字体，正文用清爽 UI 字体。
- 详情页：保留现有信息结构，但减少黄色块和表单感，让它更像轻量阅读面板。

---

## 1. UX 逻辑审计底线

实现前必须先审核当前 UX 逻辑。以下任何一项都不允许因为 UI 修改失效。

### App 全局状态

不得改变：

- `Page = 'list' | 'detail' | 'settings' | 'favorites' | 'statistics'`
- `selectedCardId`
- `currentCardType`
- `currentTag`
- `searchKeyword`
- `cards`
- `totalCards`
- `currentPage`

不得改变：

- `handleCardClick(id)` 点击卡片进入详情。
- `handleBack()` 从详情/设置返回列表。
- `handleNavigate(p)` 切换首页、收藏、统计、设置。
- 搜索 Enter 和按钮触发 `handleSearch()`。
- 刷新按钮触发 `handleRefreshCards()`。

### 首页 CardList

必须保留并验证：

- 搜索输入框可输入。
- 按 Enter 搜索。
- 点击搜索按钮搜索。
- 当前意图分类筛选显示正确。
- 当前标签筛选显示正确，且可清除。
- 刷新按钮仍可见、可点击、loading 状态仍可见。
- 卡片点击进入详情。
- 卡片更多菜单可打开。
- 收藏/取消收藏不触发列表 remount 问题。
- 删除仍弹确认框，确认后卡片消失。
- 错误卡片 `summarize_error` 仍有错误提示和特殊状态。
- 分页上一页/下一页仍可用，disabled 状态仍可见。
- 空状态仍提示通过浏览器悬浮球生成卡片。

### 收藏 FavoritesList

必须保留并验证：

- 收藏页加载 starred 卡片。
- 卡片点击进入详情。
- 取消收藏后本地状态更新。
- 删除确认流程可用。
- 空状态可见。

### 统计 StatisticsPage

必须保留并验证：

- 总数显示。
- 意图分类分布显示。
- 平台分布显示。
- 热门标签 TOP 10 显示。
- 条形图不因颜色调整失去可读性。

### 详情 CardDetail

必须保留并验证：

- 返回按钮。
- 标题展示。
- 编辑标题、保存、取消。
- 导出菜单：txt / pdf / image。
- 更多菜单。
- 收藏/取消收藏。
- 删除确认。
- 总结失败提示。
- 重新总结按钮。
- Tab：概览 / 原始对话。
- `card_type` 下拉切换并保存。
- `original_question` 只读展示。
- `narrative` TipTap 编辑器：B/I/U/高亮按钮、800ms 防抖保存。
- `unresolved_questions` 如当前代码中存在展示/编辑，必须保留。
- tags 展示。
- source 平台、URL、captured_at 展示。
- 回到原始对话入口调用 `POST /api/open-url`。
- 原始对话按用户 / 平台分段展示。

### 设置 SettingsPage

必须保留并验证：

- API Key 输入。
- API 地址输入。
- 模型名称输入。
- 测试连接按钮。
- 保存设置按钮。
- 成功/失败提示。
- 快速开始步骤。

---

## 2. 禁止修改范围

以下文件和行为不属于本次 UI 重设计范围，除非用户另行明确要求：

- 不修改 `demo/web/src/api.ts`。
- 不修改 `demo/web/src/types.ts`。
- 不修改 `src-tauri/**`。
- 不修改 `src-tauri/db/schema.sql`。
- 不修改 `src-tauri/prompts/**`。
- 不修改 `docs/prompts/**`。
- 不修改 AI Pipeline、prompt 路由、分类器、去重逻辑。
- 不修改 HTTP API 路径、方法、参数、返回结构。
- 不修改 SQLite schema、迁移策略、数据库路径。
- 不修改浏览器扩展抓取逻辑。

---

## 3. 允许修改范围

主要允许修改：

- `demo/web/src/App.tsx`
  - 品牌区 Logo 展示。
  - 品牌文字容器。
  - className。
  - 必要的非业务包裹结构。
  - 图标尺寸/容器/可访问标题。

- `demo/web/src/index.css`
  - CSS variables。
  - 全局背景。
  - 侧边栏颜色、分组标题、active 状态。
  - 搜索栏、筛选条、刷新按钮。
  - 卡片预览边框、背景、字体、标签、菜单。
  - 详情页顶部栏、Tab、问题框、编辑器、元信息。
  - 收藏页、统计页、设置页的同风格适配。
  - hover/focus/active/disabled/loading/error/empty 状态样式。

可按需要修改：

- `demo/web/src/Logo.tsx`
  - 仅限 Logo 视觉替换，不改变外部使用方式。

文档记录：

- `Guidance/UI-REDESIGN-GUARDRAILS.md`
- `Guidance/status.md`
- `Guidance/logs/2026-06-03.md` 或后续日期日志

---

## 4. 施工任务

### Task 1: 建立视觉 token

**Files:**

- Modify: `demo/web/src/index.css`

**Steps:**

1. 在 `:root` 中整理新的 ins minimal token。
2. 使用近白/浅暖色作为主背景，例如：
   - page/base: `#fbf8f3`
   - sidebar: `#fbf6ef`
   - card: `rgba(255, 253, 250, 0.88)`
   - text: `#211d18`
   - muted: `#a1978b`
   - line: `#e0d6cc`
   - accent: `#c87972`
3. 移除或弱化旧便签风里过重的黄色、橙色、折角、纸张色块。
4. 保留明确 focus-visible 样式，不能牺牲键盘可访问性。

**Verify:**

- 页面主背景、侧边栏、卡片背景来自统一 token。
- 没有大面积黄色/橙色。
- 没有卡片折角。

### Task 2: 侧边栏视觉迁移

**Files:**

- Modify: `demo/web/src/App.tsx`
- Modify: `demo/web/src/index.css`
- Optional Modify: `demo/web/src/Logo.tsx`

**Steps:**

1. 保留 Sidebar 的所有导航和筛选行为。
2. 品牌区使用新 Logo 视觉，品牌名仍显示 `Memora`，副标题仍显示“微忆，让知识在对话里生长”。
3. 分组标题改为优雅英文：`Library`、`Intent`、`Tags`。
4. active 状态使用近白底、细边框、轻阴影、小色条。
5. 标签云保留可点击能力，只改边框、颜色、圆角和 hover。

**Verify:**

- 首页、收藏、统计、设置入口可点击。
- 10 个意图分类可点击并筛选。
- 标签可点击并筛选。
- active 状态清晰但不厚重。

### Task 3: 首页 CardList 视觉迁移

**Files:**

- Modify: `demo/web/src/App.tsx`
- Modify: `demo/web/src/index.css`

**Steps:**

1. 保留搜索栏、搜索按钮、筛选条、刷新按钮、卡片网格、分页。
2. 搜索栏和按钮只调整颜色、线条、圆角、字体。
3. 卡片统一近白底，不使用不同背景色。
4. 删除卡片折角视觉。
5. 标题改为高级但可读的标题字体；正文改为清爽 UI 字体，不使用楷体。
6. 标签样式更轻，主类型标签保留轻微 accent。
7. 更多菜单按钮保持可点击区域稳定，不要因 hover 改变布局。

**Verify:**

- `npm run build` 通过。
- 搜索、筛选、刷新、分页、更多菜单、收藏、删除全部可用。
- 卡片列表 1440x860 下仍为合理三列，不出现文字溢出。

### Task 4: 详情页 CardDetail 视觉迁移

**Files:**

- Modify: `demo/web/src/App.tsx`
- Modify: `demo/web/src/index.css`

**Steps:**

1. 保留顶部返回、标题、编辑、导出、更多菜单。
2. 顶部栏改为近白内容卡，降低黄色/便签感。
3. Tab 保留 `概览 / 原始对话`，改为轻量 segmented control。
4. 核心问题框改为近白底、细边框、轻圆角。
5. TipTap 编辑器保留 toolbar 行为，只改 toolbar 背景、按钮、边框。
6. `narrative` 和 `unresolved_questions` 的保存逻辑不改。
7. 标签、来源、回到原始对话按钮改为同风格轻量样式。
8. 原始对话 Tab 保持消息角色区分，但降低背景块重量。

**Verify:**

- 编辑标题可保存。
- TipTap B/I/U/高亮可点击。
- 编辑内容后自动保存仍触发 `updateCard`。
- 导出菜单 txt/pdf/image 仍可打开并执行。
- 重新总结仍可执行。
- 回到原始对话仍可打开 URL。

### Task 5: 收藏、统计、设置页同风格适配

**Files:**

- Modify: `demo/web/src/App.tsx`
- Modify: `demo/web/src/index.css`

**Steps:**

1. 收藏页复用首页卡片样式。
2. 统计页使用近白统计卡、细线条、克制条形图。
3. 设置页使用近白表单卡、轻按钮、清晰输入框。
4. 空状态、loading、error、success 状态保持可读。

**Verify:**

- 收藏页取消收藏/删除可用。
- 统计页数据分布可读。
- 设置页测试连接、保存设置可用。

### Task 6: 本地客户端启动验收

**Files:** none unless bugs discovered.

**Commands:**

From repo root:

```powershell
cd H:\llm-chat-knowledge-base\demo\web
npm run build
```

Expected:

- TypeScript/Vite build passes.
- `demo/web/dist` is generated.

Start local Tauri client for user validation:

```powershell
cd H:\llm-chat-knowledge-base\src-tauri
cargo tauri dev
```

Notes:

- `tauri.conf.json` has `beforeDevCommand`: `cd /d h:\llm-chat-knowledge-base\demo\web && npm run dev`
- Tauri window should open at 1440x860.
- Rust HTTP server should remain on `localhost:17321`.

Manual validation checklist:

- 首页加载。
- 搜索可用。
- 意图筛选可用。
- 标签筛选可用。
- 卡片进入详情。
- 详情返回。
- TipTap 编辑。
- 收藏/取消收藏。
- 删除确认。
- 导出菜单。
- 设置测试连接。
- 统计页显示。

### Task 7: Git 检查与提交

**Commands:**

```powershell
git status --short
git diff -- demo/web/src/App.tsx demo/web/src/index.css demo/web/src/Logo.tsx Guidance/UI-REDESIGN-GUARDRAILS.md Guidance/status.md
```

Requirements:

- 确认没有误改 `api.ts`、`types.ts`、`src-tauri/**`、`schema.sql`、prompt 文件。
- 如果有用户或历史无关改动，不要 revert。
- 只 stage 本次 UI 改造相关文件和必要文档。

Commit:

```powershell
git add demo/web/src/App.tsx demo/web/src/index.css demo/web/src/Logo.tsx Guidance/UI-REDESIGN-GUARDRAILS.md Guidance/status.md Guidance/logs/2026-06-03.md
git commit -m "style: refresh Memora UI with minimal premium theme"
```

如果 `Logo.tsx` 或日志文件未改，不要强行 add。

### Task 8: 编译 release

Build web first:

```powershell
cd H:\llm-chat-knowledge-base\demo\web
npm run build
```

Build Tauri:

```powershell
cd H:\llm-chat-knowledge-base\src-tauri
cargo tauri build
```

Expected:

- Tauri uses `beforeBuildCommand` to build frontend.
- Windows bundle artifacts should appear under `src-tauri/target/release/bundle/**`.

Release packaging must follow:

- `Guidance/RELEASE-DISTRIBUTION.md`

Expected zip shape:

```text
Memora-windows/
  plugin/
  client/
```

Do not include:

- `.env`
- local SQLite database
- `node_modules`
- test capture JSON
- development cache

---

## 5. Acceptance Criteria

### Functional

- No API route changed.
- No database schema changed.
- No AI pipeline/prompt changed.
- No extension capture logic changed.
- All existing UI actions remain visible and usable.
- `npm run build` passes.
- Tauri client starts and user can validate manually.
- `cargo tauri build` passes before release packaging.

### Visual

- Sidebar lighter than current UI.
- Cards unified near-white, no mixed colors, no folded corners.
- Detail page less yellow, less form-like, more like a clean reading card.
- Typography no longer uses black-title + KaiTi-body combination.
- Borders are fine and consistent.
- Shadows are soft and minimal.
- Overall impression: ins minimal premium, not note-study sticky wall.

---

## 6. Important Reminder For The Next Session

The current `Guidance/UI-REDESIGN-GUARDRAILS.md` originally described “便签学习风”. This plan updates the direction to “ins 简洁高级风”. If there is any conflict, follow this plan and the latest user request:

> 只改颜色、线条、字体、边框、层次这些不影响产品功能的 UI 设计。不得因为修改 UX 导致任何功能失效。
