# Bug 记录与根因分析

> 完整记录项目中发现的 Bug、根因分析与修复方案。

---

## E-024 — 列表页时间与详情页不一致 + "回到原始对话"按钮在 Tauri 中无反应

- **日期：** 2026-05-26
- **位置：** `demo/web/src/App.tsx`、`demo/web/src/index.css`、`src-tauri/src/main.rs`、`demo/server/index.js`
- **现象：**
  1. 卡片列表页显示的时间与详情页不一致（列表页字段错了）
  2. Web 端的"回到原始对话"按钮可以打开外部链接，但 Tauri 客户端点击无反应
- **根因：**
  1. 列表页使用 `card.created_at`（数据库卡片创建时间），详情页使用 `card.source.captured_at`（对话抓取时间）。同一次抓取生成多张卡片时各卡片 `createdAt` 有先后，实际对话时间以此为记录
  2. 第一版修复使用 `@tauri-apps/plugin-opener` 前端调用 `openUrl()`，但 Tauri HTTP mode 下页面走 `http://localhost` 而非 `tauri://localhost`，WebView 不注入 `__TAURI_INTERNALS__`，前端 IPC 完全不可用
- **修复（最终方案）：**
  1. 列表页和收藏页日期字段从 `card.created_at` 改为 `card.source?.captured_at || card.created_at`
  2. 放弃前端 IPC 方案，改为后端端点：Rust `POST /api/open-url` 使用 `open::that(url)` 调系统浏览器；Express 同步添加 `POST /api/open-url` 使用 `child_process.exec(start/open/xdg-open)`；前端改为 `fetch('/api/open-url', {url})` 调用
- **产出文件：** `demo/web/src/App.tsx`、`demo/web/src/index.css`、`src-tauri/src/main.rs`、`src-tauri/Cargo.toml`、`demo/server/index.js`、`demo/web/package.json`

## E-025 — AI 输出中残留 markdown 格式符号（`\n`、`**粗体**`、`#标题`）+ 对话记录显示混乱

- **日期：** 2026-05-26
- **位置：** `demo/server/capture.js`、`demo/server/ai.js`、`src-tauri/src/main.rs`、`demo/web/src/App.tsx`
- **现象：**
  1. DeepSeek 等模型生成的卡片 narrative 中出现字面 `\n` 字符、`**粗体**` 标记、`## 标题` 等 markdown 格式
  2. 对话记录消息中同样存在大量 markdown 残留
  3. Prompt 中没有规范禁止 markdown 格式，也没有兜底清洗
- **根因：** 三层缺失：
  1. Prompt 未强制要求输出纯文本（无 markdown）
  2. Pipeline 产出后无质检环节
  3. 前端对话记录显示了原始消息未清洗 + 清洗版/原始版切换按钮增加复杂度
- **修复：**
  1. 新增 `sanitizeContent()` 质检函数（7 步正则：字面 \n→换行、去 # 标题标记、去 **粗体** 标记、去 *斜体* 标记、去 --- 分割线、去 AI 前缀、压缩空行），在三层链路中复用：
     - 消息清洗：`capture.js` / `main.rs` → clean messages
     - 卡片输出：`ai.js` / `main.rs` → title / narrative / original_question / tags / full_output
     - 前端兜底：`App.tsx` → 显示时对旧数据再洗一遍
  2. 对话记录 Tab：移除"查看清洗版/查看原始版"切换按钮，始终显示清洗版消息并过 sanitize
- **产出文件：** `demo/server/capture.js`、`demo/server/ai.js`、`src-tauri/src/main.rs`、`demo/web/src/App.tsx`

## E-026 — Tauri 客户端卡片列表 2 列，网页端 3 列（布局不一致）

- **日期：** 2026-05-26
- **位置：** `demo/web/src/index.css`、`src-tauri/tauri.conf.json`
- **现象：**
  1. 网页端卡片列表每行显示 3 张卡片，Tauri 客户端只显示 2 张
  2. 客户端卡片显得过大，观感不佳
  3. 多次调整窗口宽度（1200→1400→1440px）均无效
- **根因（多层叠加）：**
  1. **主要因素**：CSS grid 的 `repeat(auto-fill, minmax(320px, 1fr))` 中 min=320px 过大，3 列需 992px+，Tauri WebView2 CSS 视口实际可用宽度不足（可能受 DPI 缩放或窗口边框影响，CSS 视口 < 配置的物理像素）
  2. **次要因素**：侧边栏 `25%`（min 280px/max 380px）在 1440px 窗口下占约 360px，压缩了卡片可用空间
  3. **诊断阻塞**：Tauri dev 模式连 Vite dev server（非嵌入 dist），以为改 CSS 就生效，但用户需手动刷新；且端口冲突（TIME_WAIT）导致 Vite 多次切换端口号，增加了排查难度
- **修复：**
  1. Tauri 窗口默认宽度：1200→1440px
  2. 侧边栏改为固定宽度：260px（原 25% 百分比宽度）
  3. 卡片网格最小宽度：320→230px（3 列仅需 3×230+2×16=722px）
- **诊断方法**：用红色背景 + `repeat(3, 1fr)` 排除了"CSS 未加载"的可能，确认 CSS 通路正常
- **产出文件：** `src-tauri/tauri.conf.json`、`demo/web/src/index.css`

## E-018 — Tauri SQLite FTS 触发器导致数据库损坏（UPDATE 静默失败）
- **日期：** 2026-05-26
- **位置：** `src-tauri/db/schema.sql` — `cards_fts` 虚拟表 + 触发器
- **现象：** AI Pipeline 成功返回 JSON 结果，但 `UPDATE knowledge_cards` 写入 narrative/original_question 等字段时静默失败。数据库 `PRAGMA integrity_check` 返回 ok，但实际执行 UPDATE 时报错 `error 267/11: database disk image is malformed`
- **根因：** `cards_fts` 定义中使用 `content='knowledge_cards', content_rowid='rowid'` 的外部表模式，但 `knowledge_cards` 使用 **TEXT PRIMARY KEY (UUID)** 而非 INTEGER PRIMARY KEY。SQLite 对非 INTEGER PK 的表有隐式 rowid，但 FTS5 的 content-rowid 映射在这种表上行为不稳定——INSERT 时 FTS 记录写入正常，但 UPDATE 触发器执行时 rowid 不一致导致内部数据结构损坏
- **修复：** 将 `cards_fts` 从 content 外部表改为**独立 FTS 表**，新增 `card_id` 字段存储 UUID 字符串作为关联键。触发器从 `WHERE rowid = new.rowid` 改为 `WHERE card_id = new.id`。不再依赖任何 rowid 映射机制
- **附带修复：** `select_cols` 缺少 `narrative` 和 `summarize_error` 字段，导致卡片列表 API 返回空摘要

## E-019 — Tauri HTTP Server 缺少关键路由，前端无法获取卡片数据
- **日期：** 2026-05-26
- **位置：** `src-tauri/src/main.rs` — `start_http_server()` Router 配置
- **现象：** 浏览器扩展显示抓取成功，Tauri 数据库也有数据，但前端卡片列表显示为空
- **根因：** HTTP Router 只注册了 `/api/capture`（POST）和 `/api/status`（GET），缺少 `/api/cards`、`/api/cards/:id`、`/api/settings`、`/api/tags`、`/api/statistics` 等全部 CRUD 路由。前端 `api.ts` 在 `VITE_API_MODE=http` 模式下通过 fetch 调用这些端点，全部返回 404
- **修复：**
  1. 新增全部 HTTP handler 函数（`http_get_cards`、`http_get_card`、`http_update_card`、`http_delete_card`、`http_get_tags`、`http_get_statistics`、`http_get_settings`、`http_update_settings`、`http_validate_settings`），复用与 Tauri commands 相同的数据库查询逻辑
  2. Router 注册所有路由，支持 GET/POST/PUT/DELETE 方法
  3. 修复 axum 0.8 路径参数语法：`:id` → `{id}`
  4. 修复 axum 路由方法导入：新增 `put`、`delete`
  5. 修复 `http_get_cards` 查询参数提取：使用 `axum::extract::Query<HashMap>` 而非直接参数
  6. 修复 `json!()` 宏内嵌套 let 语句的编译错误：所有变量提取到宏调用之前
- **附带修复：** axum 0.8 `resp.status()` 在 `.text()` 后被 consume，需先保存 status 副本

## E-020 — Tauri 数据库 file-level corruption（VACUUM INTO 期间进程未停止）
- **日期：** 2026-05-26
- **位置：** `src-tauri/target/debug/knowledge_base.db`
- **现象：** 手动修复 FTS schema 后执行 `VACUUM INTO` 修复数据库，但 Tauri 进程仍在运行持有写锁，导致生成的新数据库从源头就损坏。后续即使删除重建，旧的 WAL/shm 文件残留也会导致新数据库被污染
- **根因：** 执行 `VACUUM INTO` 前未停止 Tauri 进程，SQLite 写锁未释放。同时 `knowledge_base.db-journal`、`knowledge_base.db-wal`、`knowledge_base.db-shm` 等辅助文件未清理
- **修复：** 执行数据库修复操作前必须先停止 Tauri 进程，然后删除所有 .db / .db-journal / .db-wal / .db-shm 文件，从头创建全新数据库
- **教训：** 涉及 SQLite 文件级操作（VACUUM / VACUUM INTO / 备份 / 迁移）时，必须确保没有任何进程持有该数据库的连接

## E-021 — Tauri 完全缺少对话清洗逻辑，原始消息直接当干净数据使用

- **日期：** 2026-05-26
- **位置：** `src-tauri/src/main.rs` — `do_capture()`、`http_capture()`
- **现象：** 浏览器扩展抓取成功但 AI Pipeline 生成的卡片内容混乱（标题不对、叙事截断），clean_conversations 表数据与 raw_conversations 完全一致，前端详情页消息角色未归一化
- **根因：** Tauri Rust 端完全没有端口 Demo 的 `cleanConversation()`。`raw_json` 被同时绑定到 raw 表和 clean 表，AI Pipeline 接收原始消息
- **修复：** 新增 4 个清洗函数（`normalize_role`/`clean_content`/`merge_consecutive`/`clean_conversation`），`do_capture` 和 `http_capture` 改为清洗后再存储和调用 Pipeline
- **编译结果：** `cargo check` 零 error 零 warning

## E-023 — 意图分类器 6/7+4 结果误判为"其他"（三层根因）

- **日期：** 2026-05-26
- **位置：** `docs/prompts/classifier/prompt.md`、`src-tauri/src/main.rs` — `classify_intent()`、`intent_by_key()`、`extract_prompt_block()`
- **现象（第一批 6/7）：** 日志显示 6/7 的对话被意图分类器判为"其他"（天气→事实查询 ✓，其余全部→其他 ✗）
- **现象（第二批 4 个 badcase）：** 修复后 4 个场景仍被判为其他 — Obsidian介绍/说明书guidance辨析/AI产业链分析/短剧市场
- **根因（三层）：**
  1. **Prompt 过长导致 LLM 偷懒**（第一层）：classifier prompt 约 300 行 ~3500 tokens，"输出 1 个词"的任务 LLM 默认选最后一个类别 "other" → 精简到 55 行决策树
  2. **代码不识别中文输出**（第二层）：`intent_by_key()` 只匹配英文 key → 新增中文标签反向匹配 + `classify_intent` 规范化
  3. **few-shot 示例从未进入 system prompt**（第三层 — 最关键）：`extract_prompt_block()` 提取范围是 `## 角色设定` → `## 示例输出`（不含），而 13 个 few-shot 示例全部放在 `## 示例输出` 之下，从未发送给 LLM！LLM 收不到任何示例，分类完全靠文字描述，容易误判
- **修复（三层）：**
  1. **Prompt 重构**：从 300 行压缩到 ~110 行，改为决策树格式（1→10 顺序判断）+ 强制反 other 兜底规则 + 关键边界表
  2. **intent_by_key 中文化**：新增中文标签反向匹配；`classify_intent` 规范化输出为英文 key
  3. **few-shot 嵌入 system prompt**：将 13 个范例从 `## 示例输出` 移到其前面的 `## 典型范例` 节中，确保 LLM 收到示例
  4. **调试增强**：`classify_intent` 新增 raw response 日志
- **修复文件：** `docs/prompts/classifier/prompt.md`（两次重写）、`src-tauri/prompts/classifier/prompt.md`（同步）、`src-tauri/src/main.rs`（`intent_by_key` + `classify_intent` + 日志）、`demo/server/ai.js`（`classifyIntent`）、`demo/web/src/App.tsx`（卡片类型手动切换）
- **验证结果：** 9/9 测试通过 — 概念理解/REST-GraphQL ✓ / Rust学习 ✓ / Docker报错 ✓ / 群运营 ✓ / Python特性 ✓ / Obsidian ✓ / 说明书guidance ✓ / AI产业链 ✓ / 短剧市场 ✓

## E-022 — Kimi DOM 结构变更导致抓取失败

- **日期：** 2026-05-26
- **位置：** `demo/extension/content.js` — `captureKimi()` + 共享 `createVisibleDomProbe`
- **现象：** 其他 6 个平台抓取正常，Kimi 报错 "未能从 Kimi 页面提取对话内容"
- **根因：** Kimi 迁移到新域名 `kimi.com` 后 DOM 结构完全变了，现有 CSS 选择器（`[data-testid*="message"]`、`[class*="message"]` 等）全部无法匹配对话元素。共享 `createVisibleDomProbe` 的 `collectTurnCandidates()` 在 turnElements 和 roleElements 均为空时直接返回空数组，没有回退机制
- **修复：**
  1. `collectTurnCandidates()` 新增 fallback：当选择器全部失效时调用 `collectReadableTextBlocks()` 扫描页面所有可见文本块
  2. `inferRole()` 增强：向上查 4 层祖先元素找角色签名
  3. 新增 `isVisibleTextBlock()`、`extractOwnReadableText()` 辅助函数
  4. `containsDescendant()` 防御：回退模式 item 无 element 引用时返回 false
  - 回退逻辑对所有平台生效，任一平台 DOM 变更导致选择器失效时自动降级

- **日期：** 2026-05-18
- **位置：** `demo/extension/background.js`
- **根因：** MV3 CSP 策略禁止在 background service worker 中使用 `new Function()` 动态执行代码
- **修复：** 将抓取逻辑从 background 迁移到 content script 中执行

## E-002 — Windows 环境无法编译 better-sqlite3

- **日期：** 2026-05-18
- **位置：** `demo/server/`
- **根因：** 开发环境缺少 Rust 和 VS Build Tools，better-sqlite3 原生模块编译失败
- **修复：** Demo 阶段改用 JSON 文件存储，正式迁移 Tauri 2.0 时再上 SQLite

## E-003 — Pipeline 话题切分 origIdx 映射错误导致消息切片错位
- **日期：** 2026-05-23
- **位置：** `demo/server/ai.js` — `splitTopics()`
- **现象：** 多话题测试中，话题块 1 收到的是 user 问题，话题块 2 收到的是另一个话题的 assistant 回复；所有话题块的消息数都是 1 条
- **根因：** `messages.filter().map((m, originalIdx) => ...)` 中 `originalIdx` 是 filter 后的 0,1,2，不是 messages 数组中的真实位置。例如 user 消息实际在 messages[0]、messages[2]、messages[4]，但 `origIdx` 存成了 0,1,2
- **修复：** 改用 `for` 循环遍历 messages 数组，`origIdx` 取循环变量 `i`，保证是 messages 数组中的真实索引

## E-004 — extractPromptBlock 只提取了 JSON 模板，丢失角色设定和约束
- **日期：** 2026-05-23
- **位置：** `demo/server/ai.js` — `extractPromptBlock()`
- **现象：** 卡片标题全部返回示例中的内容（"贝叶斯定理""Q1 技术债务汇报 PPT""英语面试模拟"），而不是基于实际对话生成
- **根因：** `extractPromptBlock` 原逻辑提取第一个 ```` ``` ```` 代码块内容，而 prompt 中第一个代码块是 JSON 输出模板。LLM 只收到 JSON 模板，没有角色设定、叙事规则和约束，直接返回了示例中的标题
- **修复：** 改为提取 `## 角色设定` 到 `## 示例输出`（不含）之间的内容，包含完整的角色设定、输出格式和约束

## E-005 — 话题切分器 LLM 返回字段名不稳定
- **日期：** 2026-05-23
- **位置：** `demo/server/ai.js` — `splitTopics()`
- **现象：** 话题块全部映射为 startMsgIdx=0, endMsgIdx=5（覆盖所有消息），3 个话题块都收到同样的 6 条消息
- **根因：** LLM 返回的字段名在不同调用中变化：`start/end/topic`、`start_idx/end_idx/topic_hint`、`start_message/end_message`。代码只处理了 `start_idx/end_idx`，其他变体 fallback 到默认值 0 和 messages.length-1
- **修复：** 添加兼容映射，`start_idx` 兼容 `start`/`start_message`，`end_idx` 兼容 `end`/`end_message`

## E-006 — 多话题测试全部话题块意图分类为 interactive_companion
- **日期：** 2026-05-23
- **位置：** `demo/server/ai.js` — `splitTopics()` / `extractBlockMessages()`
- **现象：** E-005 修复后，3 个话题块都收到完整的 6 条消息（因为没有 extend 逻辑），意图分类全部返回 interactive_companion
- **根因：** 索引映射正确但缺少 extend 逻辑，话题块 endMsgIdx 没有延伸到下一个话题块的起点之前，导致切片范围过窄或重叠
- **修复：** 添加 extend 循环：`block[i].endMsgIdx = max(block[i].endMsgIdx, block[i+1].startMsgIdx - 1)`

## E-007 — DeepSeek/Kimi/Qwen/元宝 抓取内容混乱，包含思考过程
- **日期：** 2026-05-23
- **位置：** `demo/server/capture.js` + `demo/extension/content.js`
- **现象：**
  - DeepSeek/Kimi/Qwen API 接口失效，降级到 DOM 抓取后消息角色混乱（user/assistant 错位）
  - 元宝抓取包含完整的思考过程文本（推理链、思考链等）
  - 各平台消息中混入 UI 按钮文字、平台提示
- **根因（两部分）：**
  1. DOM 抓取的 `extractTextSafely` 系列函数没有过滤 thinking/reasoning/search 等 HTML 标签和 class，导致思考过程被完整抓取
  2. `cleanContent` 清洗模块的正则只处理了少数几种 UI 按钮文字，没有处理思考过程块（<think>...</think>、[思考]...[/思考] 等）
  3. 元宝的 `captureYuanbao` 直接用 textContent 读取整个元素内容，没有 TreeWalker 过滤
- **修复：**
  - `capture.js cleanContent()`：新增 0 号步骤，用正则移除 HTML thinking/reasoning/search 标签和 Markdown 标记的思考过程块，新增"思考中"/"推理中"/"思考用时"等状态提示的正则过滤
  - `content.js` DeepSeek/Kimi/Qwen 的 `extractTextSafely` 系列函数：TreeWalker 增加对 think/thinking/reasoning/search 标签的 FILTER_REJECT，skipClasses 增加 think/reason/source/reference 匹配
  - `content.js` 元宝 `captureYuanbao` 重写：引入 extractTextSafelyYuanbao + classifyAndCollectYuanbao 统一框架，增加 role/sender 属性优先策略，TreeWalker 过滤思考过程

## E-008 — 长对话抓取空/不完整，skipClasses 过宽误杀消息容器
- **日期：** 2026-05-23
- **位置：** `demo/extension/content.js` 各平台 DOM 降级抓取函数
- **现象：** 对话较长或包含思考过程时，抓取结果为空或不完整（只抓到一半）
- **根因（四个平台共性问题）：**
  1. **skipClasses 正则过宽**：`/think|reason/` 等子串会匹配消息容器的 className（如 `thinking-content`、`reasoning-done`），导致整个消息块被 TreeWalker 拒绝，而非仅拒绝思考部分
  2. **scrollTo 固定次数不足**：长对话 5-6 次 scrollTo 不够，大量消息块未渲染就被跳过
  3. **API 路径/认证方式过期**：DeepSeek token key 可能有多种存储方式；Kimi/Qwen API 路径和响应结构已变化
  4. **后端 cleanContent 正则**：`[\s\S]*?` 非贪婪匹配无法处理嵌套较深的多层 div 思考块
- **修复：**
  1. **统一抽取 `extractMessagesFromDOM()` 工具函数**：所有 DOM 降级平台共用，采用"滚动到稳定" + "精确定位消息容器" + "安全提取文本"三阶段架构
  2. **`scrollUntilStable()`**：替代固定次数 scrollTo，检测页面高度稳定后自动停止
  3. **`safeExtractText()`**：检查祖先链是否有思考标签（而非只检查直接父元素），skipClasses 使用 `^` 前缀匹配避免误杀
  4. **DeepSeek**：新增多种 token key 尝试（`deepseek_token`、`auth_token`），新增 `extractDeepSeekContent()` 处理多种 API 响应格式
  5. **Kimi**：更新 API 路径 `/api/chat/{convId}/messages`，新增 `extractKimiContent()` 函数
  6. **Qwen**：增强两个域名的 API 响应结构兼容，新增 `extractQwenContent()` 函数
  7. **元宝**：改用 `extractMessagesFromDOM()` 统一框架，基于容器属性精确判断角色
  8. **后端 cleanContent**：先移除思考标签本身（处理未闭合/嵌套过深），再用非贪婪匹配移除完整标签块

## E-009 — 抓取脚本未使用已验证的 scripts/ 代码 + Qwen 消息角色/内容合并错误
- **日期：** 2026-05-23
- **位置：** `demo/extension/content.js` + `scripts/qwen-console-capture.js`
- **现象：**
  1. DeepSeek/Kimi/Qwen/元宝 长对话抓取为空或不完整
  2. DeepSeek API 认证失败（token 解析方式不对、缺少必要 headers）
  3. Qwen 第一条消息被错误标记为 AI，且内容包含所有对话轮次的合并文本
- **根因：**
  1. **extension 从未使用 scripts/ 的已验证代码**：插件内的 TreeWalker DOM 提取是独立写的，没有用上 `scripts/` 目录下经过验证的 `createVisibleDomProbe` 框架（cloneNode + junk filtering + Shadow DOM + 智能滚动）
  2. **DeepSeek token 解析错误**：`localStorage.getItem('userToken')?.replace(/"/g, '')` 返回 JSON 字符串而非有效 token，正确方式是 `JSON.parse(stored).value`
  3. **Qwen DOM 选择器错误**：`[class*="message"]` 匹配了 17 个外层布局容器（message-list-scroll-container 等），不是单个消息元素。通用 `createVisibleDomProbe` 框架无法区分 Qwen 的真实 DOM 结构
  4. **Qwen 真实 DOM 结构**：`message-select-wrapper-question` / `message-select-wrapper-answer` 包裹单个消息，内容在 `message-select-content` 子元素中
- **修复：**
  1. **content.js 完整重写**：将所有平台的抓取逻辑替换为 `scripts/` 目录下已验证的 `createVisibleDomProbe` 框架模式，统一使用 cloneNode 文本提取 + junk pattern 过滤 + Shadow DOM 查询 + `getScrollTargets()` 智能滚动
  2. **DeepSeek**：修正 token 提取为 `JSON.parse(localStorage.getItem('userToken')).value`，添加 x-app-version、x-client-locale、x-client-platform headers
  3. **Qwen**：绕过通用 `createVisibleDomProbe` 框架，直接查询 `[class*="message-select-wrapper-question"]` 和 `[class*="message-select-wrapper-answer"]` 选择器，从 `[class*="message-select-content"]` 提取文本
  4. **scripts/ 探针增强**：给 kimi/qwen/minimax/yuanbao 四个控制台探针脚本统一添加 `containsDescendant()` 嵌套去重逻辑

## E-010 — 元宝抓取报错 `url is not defined`
- **日期：** 2026-05-24
- **位置：** `demo/extension/content.js` — `captureYuanbao()`
- **现象：** 点击元宝悬浮球抓取，报错 `元宝抓取失败: url is not defined`
- **根因：** 上次完整重写 content.js 时，`captureYuanbao()` 函数开头漏了 `const url = window.location.href;` 声明，但第 970 行的返回对象中引用了 `url`。其他所有抓取函数都有这行声明，唯独元宝遗漏
- **修复：** 在 `captureYuanbao()` 的 try 块开头添加 `const url = window.location.href;`
- **教训：** 批量重写后应逐函数对比确认变量声明/返回值等公共结构，不可遗漏

## E-011 — Gemini 抓取所有消息被标记为 assistant，角色无法区分
- **日期：** 2026-05-24
- **位置：** `demo/extension/content.js` — `captureGemini()`
- **现象：**
  1. 抓取结果只有 1 条消息，角色全部为 "assistant"
  2. 前端卡片主题包含 "gemini" 而不是对话实际主题
  3. AI Pipeline 无总结字段生成（角色错误导致话题切分/意图分类失败）
- **根因：** Gemini 页面 DOM 结构发生迁移，从原有的 `data-role` 属性 / CSS 类名区分角色，改为使用自定义 HTML 标签 `<USER-QUERY>` 和 `<MODEL-RESPONSE>`。原有的 `createVisibleDomProbe` 通用框架中：
  1. `selectors.turns` 中的 `[class*="message"]` 匹配到了外层包装 `.conversation-container`（包含所有对话内容的单一元素），而非单个消息
  2. `selectors.user` / `selectors.assistant` 中的 `[data-role="user"]` / `[data-role="model"]` 在页面上不存在，全部为 null
  3. `inferRole()` 的 fallback 位置推断也失效（所有容器 left=16px，全宽布局），统一 fallback 为 "assistant"
- **修复：**
  1. 放弃 `createVisibleDomProbe` 通用框架，参考 Qwen 的做法直接查询自定义标签：`document.querySelectorAll('USER-QUERY')` 和 `document.querySelectorAll('MODEL-RESPONSE')`
  2. 新增 `extractGeminiText()` 函数：cloneNode + 移除 UI 噪音元素 + 用正则去掉 "你说" / "Gemini 说" 前缀 + junk pattern 过滤
  3. 按元素在页面中的垂直位置排序，去重后合并连续同角色消息

## E-012 — Gemini 抓取报错 `scrollPageForLazyContent is not defined`
- **日期：** 2026-05-24
- **位置：** `demo/extension/content.js` — `captureGemini()`
- **现象：** 点击 Gemini 悬浮球，立即报错 `scrollPageForLazyContent is not defined`，抓取失败
- **根因：** E-011 修复时将 `captureGemini` 改为不依赖 `createVisibleDomProbe`，但滚动逻辑仍然调用了 `scrollPageForLazyContent()` —— 该函数是 `createVisibleDomProbe` 内部的私有闭包函数，外部不可访问。这是批量重写时未仔细检查依赖关系的典型错误
- **修复：** 将滚动逻辑改为内联 `window.scrollTo(0, 0)` / `window.scrollTo(0, scrollHeight)` 循环，直接使用全局 `sleep()` 函数（已在 content.js 第 914 行定义），与 Qwen 的 `getQwenScrollTargets` 系列函数模式保持一致
- **教训：** 废弃通用框架改用自定义抓取时，必须逐行检查所有函数调用是否仍在作用域内。滚动/睡眠等工具函数要么用全局版本，要么内联实现，不可引用已废弃框架的内部私有方法

## E-013 — 话题拆分过细，不该拆的也拆
- **日期：** 2026-05-24
- **位置：** `docs/prompts/topic-split/prompt.md`
- **现象：** 一次抓取对话产生多张同样/近似的卡片，标题和标签略微不同
- **根因：** topic-split prompt 只强调"拆分条件"，没有"默认不拆"的强引导；示例全部是拆分案例，没有展示"不需要拆分"的情况；topic_hint 字段要求每块一个话题标签，给了模型"必须拆出多个块"的心理压力
- **修复：** 新增"合并优先"核心原则；改写切分规则；调整示例顺序（不拆分的放第一个）；新增模棱两可但不拆的示例

## E-014 — 卡片 narrative 没有换行分段，序号格式混乱
- **日期：** 2026-05-24
- **位置：** `docs/prompts/how-to/prompt.md`、`docs/prompts/skill-learning/prompt.md`
- **现象：** 操作指南和技能学习卡片的 narrative 所有内容连成一行，步骤之间用 `→` 连接而非换行；序号格式不统一（有的用 `①②③`，有的用 `1.2.3.`）
- **根因：** prompt 要求"段内不可换行" + "严格 N 段"，导致模型把所有内容塞进一段；不同 prompt 之间序号格式未统一
- **修复：** 允许步骤段内用 `\n` 分隔每个步骤（明确说明这属于格式分隔符不算段内换行）；统一序号格式为 `1. 2. 3.`；更新所有示例输出

## E-015 — 话题切分器 LLM 输出格式与 Prompt 不匹配，导致分块全部映射为全量消息
- **日期：** 2026-05-24
- **位置：** `demo/server/ai.js` — `splitTopics()`、`docs/prompts/topic-split/prompt.md`
- **现象：** 天气 × 2 + 余华 的对话应拆为 2 张卡片，只生成 1 张；Docker + PPT 应拆为 2 张卡片，也生成 1 张
- **根因（Prompt 与代码数据格式不一致）：**
  1. prompt 要求输入格式为 `Turn[idx]: User:... Assistant:...`，但实际代码发送的是 `User[N]: 内容`（只有 user 消息）
  2. prompt 要求输出字段为 `start_idx/end_idx`，但 LLM 自由发挥返回多种格式：`topic + utterances[]`、`start_user/end_user`、`id + topic`（无索引）、甚至单个对象而非数组
  3. 当 LLM 返回 `utterances` 或无索引格式时，fallback 链全部为 `undefined`，所有话题块映射到 `startMsgIdx=0, endMsgIdx=messages.length-1`（全量消息），内容完全一致被去重
- **修复（三端同步）：**
  1. **prompt.md**：输入格式从 `Turn[idx]:` 改为 `[N]: 内容`（与代码实际发送一致）；输出 JSON 模板强化字段描述，示例全部对齐新格式
  2. **ai.js 解析层**：兼容 5 种返回格式（数组 / {topic_blocks} / 单个块对象 / utterances 格式 / 无索引格式）
  3. **ai.js 防御层**：当 LLM 返回 N 个话题块但没有 start_idx/end_idx 时，按块顺序自动推断索引（第 i 个块 start=前一个end+1，最后一个 end=userMsgs.length）
- **新增兼容字段名：** `start_user/end_user`、`id`、`utterances`（从中提取数字索引）、单块对象格式

## E-016 — 长对话生成卡片 narrative 为空或乱码
- **日期：** 2026-05-25
- **位置：** `demo/server/ai.js` — `callOpenAICompatible()`、卡片生成阶段
- **现象：** DeepSeek/元宝等平台对话较长时，生成卡片标题正常但 narrative 为空字符串或乱码截断
- **根因：** `callOpenAICompatible()` 的 `max_tokens` 参数固定为 2000，该参数限制 LLM **输出长度**而非输入长度。长对话需要 LLM 生成较长的 JSON（包含 title、narrative、tags、full_output 等），2000 token 不够导致输出被截断，JSON 不完整，修复后也无法解析
- **修复：** 
  1. 将 `callOpenAICompatible()` 参数从硬编码 `max_tokens: 2000` 改为 `maxTokens` 参数，默认 4000
  2. Pipeline 各步骤差异化配置：话题切分 2000 / 意图分类 100 / 卡片生成 6000
  3. 增强 JSON 修复层：新增 `tryRepairJSON()` 7 层修复（markdown 去除 → 花括号提取 → 字面换行修复 → 未闭合引号 → 尾部逗号 → 缺失逗号 → 未闭合花括号）
- **教训：** `max_tokens` 是输出限制不是输入限制，模型上下文窗口大 ≠ 可以输出同样长

## E-017 — 话题拆分过细 + 去重太弱，同一次 capture 产生大量近似卡片
- **日期：** 2026-05-25
- **位置：** `docs/prompts/topic-split/prompt.md`、`demo/server/ai.js` — `deduplicateCards()`
- **现象：**
  1. 天气+余华对话（3 user 消息）→ 生成 5 张卡（2 张天气 + 3 张余华）
  2. 个人效率对话（4 user 消息）→ 生成 13 张近似卡（习惯回路×3、时间块法×3、PARA×3 等）
  3. 年龄/自律对话（4 user 消息）→ 生成 30 张近似卡（"自律的本质与困境" vs "自律的底层逻辑" 等 29 张概念理解）
- **根因（两部分）：**
  1. **话题切分过细**：LLM 把同一生活主题下的子话题（20/30 岁区别、健康 vs 事业、自律困境）拆成独立话题块。Prompt 中只有抽象的"合并优先"原则，缺少具体示例告诉 LLM 什么是"同主题子话题"
  2. **去重太弱**：dedup 只比较标题/问题的字符集 Jaccard 相似度，narrative 只取前 100 字。"自律的本质与困境" vs "自律的底层逻辑" 字面重叠不够就放行
- **修复（两层）：**
  1. **Prompt 强化**：在 topic-split prompt 中新增"同主题下的子话题不拆分"原则 + 具体示例（个人效率提升下 PARA/时间块/习惯回路 → 不拆分）
  2. **Dedup 加强**：
     - narrative 比较长度从 100 字加大到 200 字，捕捉更多语义
     - 新增情况 6：同一次 capture 的卡片，narrative 重叠 >= 0.5 就去重
     - 新增情况 7：任意两张同类型卡片，narrative 重叠 >= 0.65 就去重（防止换标题但同内容）
     - 去重日志输出 narrative 相似度，方便排查