# Bug 记录与根因分析

> 完整记录项目中发现的 Bug、根因分析与修复方案。

---

## E-027 — React 内联组件 remount 导致 local state 丢失

- **日期：** 2026-05-26
- **位置：** `demo/web/src/App.tsx` — CardList / FavoritesList / CardDetail
- **现象：** 点击收藏或删除按钮后，弹出菜单瞬间消失，操作无反馈
- **根因：** 子组件定义在父组件函数体内，handler 调用父组件 `setCards` 触发父重渲染 → React 为内联组件创建新函数引用 → reconciler 视为不同组件 → remount → `menuCardId` 等 local state 归 null
- **修复：** 局部状态覆写模式（P-010）：子组件维护 `starOverrides` Record + `hiddenIds` Set，渲染时优先读覆写值，不调用父 setter
- **教训：** `flushSync` 和 fire-and-forget 均无法解决时，问题在组件 identity 而非渲染时序

## E-025 — AI 输出残留 markdown 格式符号

- **日期：** 2026-05-26
- **位置：** `demo/server/capture.js`、`ai.js`、`src-tauri/src/main.rs`、`demo/web/src/App.tsx`
- **现象：** narrative 中出现字面 `\n` 字符、`**粗体**`、`## 标题` 等 markdown 残留
- **根因：** 三层缺失：Prompt 未禁止 markdown → 清洗未覆盖 → 前端未兜底
- **修复：** 新增 `sanitizeContent()` 7 步正则质检函数，在 capture → Pipeline → 前端三层复用

## E-024 — 列表页时间与详情页不一致 + Tauri 外部链接无反应

- **日期：** 2026-05-26
- **位置：** `demo/web/src/App.tsx`、`src-tauri/src/main.rs`
- **根因：** 1) 列表用 `created_at`（卡片创建），详情用 `captured_at`（对话抓取）；2) Tauri HTTP mode 下前端 IPC 不可用（页面走 `http://localhost` 不注入 `__TAURI_INTERNALS__`）
- **修复：** 1) 统一用 `source.captured_at`；2) 后端新增 `POST /api/open-url` 端点（Rust `open::that` / Express `child_process.exec`）

## E-023 — 意图分类器误判为"其他"（三层根因）

- **日期：** 2026-05-26
- **位置：** classifier prompt + `classify_intent()` + `extract_prompt_block()`
- **根因（三层）：**
  1. Prompt ~300 行 3500 tokens → LLM 偷懒选 "other"
  2. `intent_by_key()` 只匹配英文 key → 中文输出 fallback 到 "其他"
  3. **最关键**：few-shot 示例放在 `## 示例输出` 之下，`extract_prompt_block` 提取范围不含此节，13 个示例从未发送给 LLM
- **修复：** Prompt → 110 行决策树 + 中文反向匹配 + few-shot 移到 `## 典型范例`

## E-022 — Kimi DOM 变更导致抓取失败

- **日期：** 2026-05-26
- **位置：** `demo/extension/content.js`
- **根因：** Kimi 迁移到 `kimi.com`，选择器全部失效；`createVisibleDomProbe` 无回退机制
- **修复：** 新增 `collectReadableTextBlocks()` 回退 + `inferRole()` 增强（上查 4 层祖先），对所有平台生效

## E-021 — Tauri 完全缺少对话清洗逻辑

- **日期：** 2026-05-26
- **位置：** `src-tauri/src/main.rs`
- **根因：** `raw_json` 同时绑定到 raw 和 clean 表，AI Pipeline 接收原始消息（含 `<think>` 标签、平台垃圾）
- **修复：** 新增 4 个清洗函数（`normalize_role`/`clean_content`/`merge_consecutive`/`clean_conversation`），数据流改为先清洗后存储+传入 Pipeline

## E-020 — 数据库 file-level corruption（VACUUM INTO 期间进程未停）

- **日期：** 2026-05-26
- **教训：** 涉及 SQLite 文件级操作时必须确保无进程持有数据库连接，.db-journal/.db-wal/.db-shm 辅助文件也需一并清理

## E-018 — FTS 触发器导致数据库损坏

- **日期：** 2026-05-26
- **位置：** `src-tauri/db/schema.sql`
- **根因：** `content='knowledge_cards', content_rowid='rowid'` 与 TEXT PRIMARY KEY 表不兼容，UPDATE 触发器执行时数据库静默损坏
- **修复：** 改为独立 FTS 表 + `card_id` 字符串关联

## E-017 — 话题拆分过细 + 去重太弱

- **日期：** 2026-05-25
- **现象：** 4 条 user 消息的对话生成 13-30 张近似卡片
- **根因：** LLM 把同一主题子话题拆成独立块 + 去重只看标题/问题 Jaccard
- **修复：** Prompt 新增"同主题子话题不拆分" + Dedup 从 5 条扩展到 7 条规则（narrative 200 字 + 同 capture 特殊判断 + 兜底 0.65）

## E-016 — max_tokens 导致长对话卡片 narrative 为空

- **日期：** 2026-05-25
- **根因：** `max_tokens` 是输出限制不是输入限制，固定 2000 不够长对话输出完整 JSON
- **修复：** 差异化配置（切分 2000 / 分类 100 / 生成 6000）+ 7 层 JSON 修复
