# 会话记录

> 每次实质会话的简短总结。新记录追加到末尾。

---

## 2026-05-27 — 数据库路径迁移 + 富文本编辑方案

**主题：** 筛选计数 Bug 修复 + DB 路径从 target/debug 迁移到 %APPDATA% + 详情页富文本编辑方案规划
**关键结论：**
- COUNT 查询 SQL 中 ? 占位符未绑定参数，筛选意图分类时计数为 0
- DB 路径改为 `%APPDATA%/com.memora.app/knowledge_base.db`，首次启动自动迁移旧数据
- `cargo clean` 清空 target/ 导致 DB 被删，迁移后不再受影响
- 富文本编辑选定 TipTap 方案，待下一个会话开发
**产出文件：** `src-tauri/src/main.rs`（3 处修改）、全部 5 个 Guidance 文档精简

## 2026-05-26 — 组件 remount 根因 + 3 列布局修复

**主题：** 收藏/删除实时反馈的 4 轮调试 → P-010 局部状态覆写模式 + 客户端卡片布局从 2 列改为 3 列
**关键结论：**
- React 内联组件 + 父 setter → remount → local state 丢失，非渲染时序问题
- 局部状态覆写模式：子组件维护 starOverrides + hiddenIds，不调用父 setter
- 3 列布局：窗口 1440 + 侧边栏 260 + 网格 minmax 230
**产出文件：** `demo/web/src/App.tsx`、`index.css`、SVG assets ×3、tauri.conf.json、4 份 Guidance

## 2026-05-26 — Tauri 1:1 复刻 Demo 数据链路

**主题：** Rust 对话清洗模块 + HTTP 路由补全 + FTS 触发器修复 + 时间对齐
**关键结论：**
- Tauri 缺少清洗逻辑是数据链路全错的根因，4 步清洗函数完整移植
- HTTP Router 从 2 条补全到 11 条，FTS 从 content 外部表改为独立表
- 外部链接走后端端点方案（`POST /api/open-url`），前端 IPC 在 HTTP mode 下不可用
- `sanitizeContent()` 三层链路复用作为 AI 输出兜底质检
**产出文件：** `src-tauri/src/main.rs`（~600 行新增）、`schema.sql`、`demo/extension/content.js`、5 份 Guidance

## 2026-05-26 — 分类器三层修复 + 卡片类型手动切换

**主题：** 发现 few-shot 从未进入 system prompt（最关键的第三层根因）
**关键结论：**
- `extract_prompt_block` 提取范围不含 `## 示例输出` 之后内容，13 个 few-shot 白写
- Prompt 300→110 行决策树 + intent_by_key 中英文双向匹配 + few-shot 移到 `## 典型范例`
- 前端详情页新增 card_type 下拉切换，误判可手动修正
**产出文件：** classifier prompt 二次重写、src-tauri main.rs、App.tsx

## 2026-05-25 — 前端 UI 全面重构

**主题：** 侧边栏 Material Symbols 导航 + 列表 narrative 摘要预览 + 详情页 Tab 式布局 + 设置页重构
**关键结论：**
- 侧边栏 Logo SVG + 10 个意图字体图标导航 + 标签云可点击筛选
- 列表卡片 narrative 前 120 字摘要 + ⋮ 菜单（收藏/删除）+ 意图 tint 配色
- 详情页 概览/原始对话 Tab + 可编辑标题 + 导出（TXT/PDF/图片）
- 设置页米色卡片 + 测试连接 + 动态模型预设
**产出文件：** `App.tsx`、`index.css`、`Logo.tsx`、`api.ts`、`types.ts`、`db.js`、`index.js`

## 2026-05-24 — 切分+去重重构 + 叙事策略升级

**主题：** topic 字段移除 + 去重 7 规则 + 10 个 prompt 叙事放宽
**关键结论：**
- topic 与 tags 语义重叠 → 彻底移除 topic；去重改为 original_question + title + narrative 多维度 Jaccard 比较
- 叙事从"严格 N 段"改为"N 到 M 段 + 追问与演进"，字数上限普遍上调 50-150
**产出文件：** 全 10 个 prompt + db.js + index.js + types.ts + App.tsx + main.rs + schema.sql

## 2026-05-23 — 4 步 Pipeline + Prompt 全量重写

**主题：** Demo 后端从单 Prompt 改为 4 步流水线 + 10 个意图 prompt 精细化结构
**关键结论：**
- Pipeline：数据清洗 → 话题切分 → 意图分类 → 卡片生成，3 次 LLM 调用
- Prompt 统一结构：角色设定 + 输出 JSON 逐字段描述 + 约束 + 多示例（含 `{{conversation}}` 占位符）
- card_type 从英文 key 改为中文值，全链路同步
**产出文件：** `demo/server/ai.js` 重写 + 全 10 个 prompt + classifier + topic-split + card-design-spec

## 2026-05-22 — PRD-v2 + 5 方向产品方案

**主题：** 5 个 Agent 并行深度思考 → PRD-v2 融合产出
**关键结论：**
- 图片只存 URL、文件附件不做、桌面抓取 ROI 为负
- 10 大类意图分类 + 层级标签 + streak 黏性 + 艾宾浩斯复习骨架
**产出文件：** `docs/PRD-v2.md`、`docs/inspire_result.md`、`docs/prompts/`
