# 项目阶段进度

> 记录项目开发里程碑与关键变更。每次更新时追加到末尾。

---

## 2026-05-18 — Demo 开发完成

| 阶段 | 状态 | 说明 |
|------|------|------|
| 后端 Node.js + Express | ✅ | localhost:17321，JSON 存储，所有 API 通过测试 |
| 前端 React + Vite + TS | ✅ | 知识库界面（列表/详情/搜索/主题/设置） |
| Chrome 扩展 MV3 | ✅ | 悬浮球 + 9 平台自动检测 + 抓取脚本 |
| 爬取脚本规范化 | ✅ | 统一 `{role, content}` Q&A 输出 |
| 扩展 CSP 修复 | ✅ | 抓取逻辑从 background 迁移到 content script |

## 2026-05-16 — 豆包 Console 抓取探针

| 阶段 | 状态 | 说明 |
|------|------|------|
| Console 探针脚本 | ✅ | `scripts/doubao-console-capture.js`，验证内部接口 `/im/chain/single` 分页拉取路线 |

## 2026-05-15 — 项目启动

| 阶段 | 状态 | 说明 |
|------|------|------|
| 需求整理 | ✅ | 产出 `docs/product-requirements.md` |
| 技术调研 | ✅ | 产出 `docs/chat-capture-research.md` |
| 参考项目克隆 | ✅ | `chat-export/`、`ctxport/`、`gemini-voyager/` |

## 2026-05-22 — 5方向深度产品思考

**主题：** 用多Agent并行方式对5个产品方向做深度思考（复杂内容抓取、意图识别总结、界面设计、用户管理、复习激活）
**关键结论：**
- 内容抓取：图片只存URL，文件附件永远不做，桌面客户端抓取ROI为负
- 意图识别：7大类26子类分类体系 + 4套可直接使用的Prompt模板
- 界面设计：5条原则（找得到>好看、密度随深度递增、一个主视图等）
- 用户管理：层级标签+streak+分享图片，streak是ROI最高的黏性功能
- 复习激活：艾宾浩斯骨架+场景触发皮肤，MVP约5-7天
**产出文件：** `docs/inspire_result.md`、更新 `Guidance/architecture.md`、`Guidance/project-log.md`

## 2026-05-22 — PRD-v2 产品需求文档产出

**主题：** 融合 PRD-v1 + inspire_result.md 5方向成果，产出 PRD-v2
**关键结论：**
- PRD-v2 合并所有已确认产品方案（内容抓取矩阵、意图分类体系、界面设计、用户管理、复习机制），按最高版本采纳，不含版本迭代概念
- 意图识别 prompt 从 PRD 中剥离，独立维护在 `docs/prompts/` 下，按 7 大类各建子目录
- 明确排除项：图片 base64、文件附件抓取、桌面客户端抓取、OCR、标签云、虚拟货币统计等
**产出文件：** `docs/PRD-v2.md`、`docs/prompts/` 下 7 个意图 prompt 文件

## 2026-05-23 — PRD-v2 混合路线启动（Tauri + 前端打磨并行）

| 阶段 | 状态 | 说明 |
|------|------|------|
| 前端类型对齐 PRD-v2 | ✅ | `demo/web/src/types.ts` 追加 CardType、ReviewSchedule、ReviewHistoryEntry、unresolved_questions、exploration_paths、starred、archived 等字段 |
| Tauri 2.0 脚手架 | ✅ | `src-tauri/` 目录创建：Cargo.toml、tauri.conf.json、build.rs、src/main.rs、db/schema.sql |
| SQLite schema 设计 | ✅ | 6 张表（raw_conversations、clean_conversations、knowledge_cards、topics、settings、user_stats）+ FTS 全文搜索 + 复习调度 JSON 字段 |
| Rust commands 骨架 | ✅ | capture_conversation、get_cards、get_card、update_card、delete_card、search_cards、get_settings、update_settings |
| 前端 api.ts 适配层 | ✅ | 支持 HTTP/Tauri 双模式，通过 VITE_API_MODE 环境变量切换 |
| 前端 UI/UX 打磨（PRD-v2） | ⬜ | 统计面板、复习弹窗、收藏/归档、详情页增强 |
| Tauri 编译验证 | ⬜ | 待安装 Rust 后执行 |

**主题：** 意图识别 Pipeline 重构 + Prompt 全量重写
**关键变更：**
- Pipeline 从"单 Prompt 意图识别+总结"改为 4 步流水线：数据清洗 → 话题切分 → 意图分类 → 卡片生成
- 新增独立话题切分模块（`docs/prompts/topic-split/`），基于清洗后的 user 消息序列判断话题转折
- 删除所有旧 Prompt 的 intent_code 和子类，旧结构化字段（insights/outputs/summary_confidence/review_material）全部删除
- 卡片主体统一为 `narrative` 字段，按意图采用不同的叙事风格（词典式/快答式/路线图式/步骤式/全文式/对比式/聚类式/日记式/极简式）
- content_creation 和 text_processing 新增 `full_output` 字段存完整内容，narrative 只写背景说明
- 删除 `review_material`，复习弹窗直接弹 `title`
- 人称统一：用户="你"，AI=模型平台名称（豆包/GPT/Claude等）
**产出文件：** 重写 `docs/prompts/` 下全部 Prompt 文件 + 新建 `docs/prompts/card-design-spec.md`、`docs/prompts/topic-split/prompt.md`
**关键变更（PRD-v2）：**
- 意图分类：去掉 26 个子类和 intent_code 字段，重新设计 10 个意图大类（概念理解/事实查询/技能学习/操作指南/内容创作/文本处理/规划决策/头脑风暴/交互陪伴/其他）
- 卡片模型：新增 `topic` 字段（LLM 自由提炼的简洁名词/短句，如"编程""Python并发"），删除 `intent_code`
- 总结策略表：与 10 个新大类对齐
- 实现架构：从"前置分类器+Prompt路由"改为"单 Prompt 同时完成意图识别+主题提炼"
- 复习措辞：全文替换"待复习/队列清空/超期/轰炸/推送"等词，改为"回顾/重温/展示/提醒"
**关键决策：**
- 编辑润色 + 信息加工 → 合并为"文本处理"（本质都是对已有文本的加工）
- 分析研判 + 决策辅助 + 规划策划 → 合并为"规划决策"（完整的分析-选择-计划链路）
- 模拟对话 + 情感陪伴 → 合并为"交互陪伴"（都是交互型、非产出型场景）
- 主题提炼方式：简洁概括性名词/短句，不是完整句子（`编程` 而非 "Python GIL 为什么限制多线程"）
**产出文件：** `docs/PRD-v2.md`

## 2026-05-23 — Prompt 精细化重构（concept_exploration 先行）

**主题：** concept_exploration prompt 全量重写 + 设计规范同步更新
**关键变更：**
- 角色定位从"知识卡片生成专家"改为"知识结构分析专家"，明确 LLM 职责是输出结构化数据
- 删除固定的"定义+机制"两段式，新增 5 种组织结构（金字塔型/3W1H型/因果链型/对比型/演进型）让 LLM 根据对话特点自主选择
- narrative 规则大幅细化：结构选择规则、定义段句式参考、展开段"认知增量"要求、人称/语气规则
- 示例输出从 1 个增加到 3 个，分别展示不同结构类型的实际效果
- prompt 中添加 `{{conversation}}` 占位符，标记对话数据拼接点
- 同步更新 `docs/prompts/card-design-spec.md` 的 concept_exploration 部分，保持与 prompt 一致
**产出文件：** 重写 `docs/prompts/concept-exploration/prompt.md`、更新 `docs/prompts/card-design-spec.md`

## 2026-05-23 — Demo Pipeline 重构：单 Prompt → 4 步流水线

**主题：** Demo 后端全面对齐 PRD-v2 的 4 步意图识别 Pipeline
**关键变更：**
- `demo/server/ai.js` 重写：新增 `processPipeline()` 入口，串联 3 个独立 LLM 调用（话题切分 → 意图分类 → 卡片生成），支持多卡片输出
- `demo/server/db.js` schema 更新：新增 `card_type`（中文意图值）、`narrative`（卡片叙事）、`full_output`（完整产出），删除旧 `insights/outputs`
- `demo/server/index.js` `/api/capture` 改为调用 `processPipeline()`，多话题自动切分为独立卡片
- `docs/prompts/concept-exploration/prompt.md` `card_type` 从英文 key 补全为中文"概念理解"
**产出文件：** `demo/server/ai.js`、`demo/server/db.js`、`demo/server/index.js`

**主题：** 9 个剩余意图 prompt 全量重写 + card_type 从英文 key 改为中文值 + 全链路同步更新
**关键变更：**
- **card_type 中文化**：`card_type` 字段值从英文 key（concept_exploration）改为中文（概念理解），同步更新 TypeScript `CardType` 类型定义
- **9 个 prompt 全量重写**（fact-query / skill-learning / how-to / content-creation / text-processing / planning-decision / brainstorm / interactive-companion / other），每个都采用与 concept_exploration 相同的精细化结构：角色设定 → 输出格式（JSON 每个字段逐字描述） → 约束 → 多示例
- 每个意图新增：角色设定段（明确该意图的核心能力和特点）、叙事规则（句式参考/人称/语气/字数）、2 个示例输出
- 统一添加 `{{conversation}}` 占位符，标记对话数据拼接点
- interactive-companion 删除已废弃的 `review_material` 字段
- 同步更新 `docs/prompts/classifier/prompt.md` 的意图分类表（新增中文输出值列，标注路由映射）
- 同步重写 `docs/prompts/card-design-spec.md`（10 个意图全部用中文值，叙事长度约束表对齐）
**产出文件：** 重写全部 10 个 prompt + `classifier/prompt.md` + `card-design-spec.md` + `demo/web/src/types.ts` + `Guidance/PROGRESS.md` + `Guidance/project-log.md`

## 2026-05-23 — 4 步 Pipeline Bug 修复 + Demo 验证通过

**主题：** 修复消息切片和 Prompt 提取的 4 个 Pipeline Bug，单/多话题验证全部通过
**修复的 Bug：**
- **E-003** `origIdx` 映射错误：`filter().map()` 的索引是过滤后位置，改用 `for` 循环保留真实索引
- **E-004** `extractPromptBlock` 只提取 JSON 模板：改为提取 `## 角色设定` 到 `## 示例输出` 之间的完整内容
- **E-005** LLM 返回字段名不稳定：兼容 `start/start_idx/start_message` 三种变体
- **E-006** 缺少 extend 逻辑：添加 extend 循环让每个话题块延伸到下一个话题块起点之前
**验证结果：**
- 单话题：Python GIL → "概念理解" ✓（叙事内容正确，非示例复述）
- 多话题：闭包→概念理解 ✓ | 快速排序→内容创作 ✓ | 情绪聊天→交互陪伴 ✓（每个话题块含完整 user+assistant 对话对）
**产出文件：** `demo/server/ai.js`、`Guidance/bug-log.md`

## 2026-05-23 — 抓取脚本 scripts/ 集成 + Qwen DOM 结构修复

**主题：** 将 extension 抓取逻辑全面替换为 scripts/ 已验证代码 + 修复 Qwen 消息角色/内容合并 Bug
**关键变更：**
- `demo/extension/content.js` **完整重写**：废弃原有 TreeWalker 框架，全面改用 `scripts/` 下经过验证的 `createVisibleDomProbe` 模式（cloneNode + junk filtering + Shadow DOM + 智能滚动）
- **DeepSeek**：修正 token 提取 `JSON.parse(stored).value`，补全 x-app-version / x-client-locale / x-client-platform headers
- **Qwen**：绕过通用框架，直接查询 `[class*="message-select-wrapper-question"]` / `[class*="message-select-wrapper-answer"]` 精确选择器，从 `[class*="message-select-content"]` 提取文本
- **scripts/ 探针增强**：kimi/qwen/minimax/yuanbao 控制台探针统一添加 `containsDescendant()` 嵌套去重逻辑
**发现的关键差异：**
- Qwen DOM 结构不是 `[class*="message"]` 直接对应消息，而是 `wrapper-question` / `wrapper-answer` 包裹 `message-select-content`
- DeepSeek token 存储格式为 JSON 对象，不是裸字符串
**产出文件：** `demo/extension/content.js`、`Guidance/bug-log.md`、`Guidance/PROGRESS.md`

## 2026-05-23 — 抓取脚本清洗增强 + DOM 策略改进

**主题：** 修复 DeepSeek/Kimi/Qwen/元宝 抓取内容混乱、包含思考过程的问题
**关键变更：**
- `demo/server/capture.js cleanContent()`：新增思考过程移除步骤，支持 HTML 标签（`<think>`/`<thinking>`/`<reasoning>`/`<search>`）和 Markdown 标记（`[思考]`/`[深度思考]`/`[推理想法]`）两种格式；新增"思考中"/"推理中"/"思考用时 X 秒"等状态提示的正则过滤
- `demo/extension/content.js` DeepSeek/Kimi/Qwen 的 `extractTextSafely` 系列函数：TreeWalker 增加对 think/thinking/reasoning/search HTML 标签的 FILTER_REJECT；skipClasses 增加 think/reason/source/reference 匹配
- `demo/extension/content.js` 元宝 `captureYuanbao` 重写：统一为 extractTextSafelyYuanbao + classifyAndCollectYuanbao 框架，引入 role/sender 属性优先策略，TreeWalker 过滤思考过程
**产出文件：** `demo/server/capture.js`、`demo/extension/content.js`、`Guidance/bug-log.md`

## 2026-05-24 — 意图识别 Pipeline 共性问题修复

**主题：** 修复话题拆分过细、卡片重复、格式混乱三个共性问题
**关键变更：**
- **话题切分（topic-split/prompt.md）**：新增"合并优先"核心原则，明确"宁可合不可分"；改写切分规则为"只有根本性转变才拆分"；调整示例顺序（不拆分的示例放第一个）；新增模棱两可但不拆的 Docker volume 示例；topic_hint 补充"即使只有 1 个话题块也正常"
- **操作指南（how-to/prompt.md）**：步骤统一用 `1. 2. 3.` 序号；步骤段内每个步骤独占一行（用 `\n` 分隔）；换行规则明确步骤 `\n` 属于格式分隔符
- **技能学习（skill-learning/prompt.md）**：路径步骤序号从 `① ② ③` 改为 `1. 2. 3.`；步骤独占一行；换行规则同上
- **设计规范（card-design-spec.md）**：技能学习和操作指南的示例同步更新为 `1. 2. 3.` 序号+换行格式
- **去重（ai.js）**：新增 `deduplicateCards()` 函数，基于 card_type + topic 一致性 + Jaccard 字符集相似度（阈值 0.6）+ 标题包含关系进行轻量去重
**产出文件：** `docs/prompts/topic-split/prompt.md`、`docs/prompts/how-to/prompt.md`、`docs/prompts/skill-learning/prompt.md`、`docs/prompts/card-design-spec.md`、`demo/server/ai.js`

## 2026-05-24 — 切分+去重架构重构 + topic 字段移除

**主题：** 解决话题拆分过细（DeepSeek 3 卡片问题）和 topic/tags 字段冗余的根本问题
**关键变更：**
- **话题切分 prompt 强化**：新增"不要从讨论角度/维度拆分"原则，新增"同一话题的不同讨论角度"示例（年龄差异→自律→快乐平衡 不拆分）
- **去重逻辑重写**：从 `card_type + topic + 标题 Jaccard` 改为 `card_type + original_question 语义相似度 + 标题相似度 + narrative 前 100 字重叠`，5 条综合判断规则，不再依赖 topic
- **移除 topic 字段**：从数据库 schema（SQLite + Tauri）、Rust struct、TypeScript 类型、前后端 API、全部 10 个意图 prompt 和 card-design-spec 中彻底移除
- **移除 Topics 功能**：删除 db.js 中的 getTopics/addTopic/deleteTopic，删除 index.js 中的 /api/topics 路由，删除 api.ts 中的相关 API 导出，删除 schema.sql 中的 topics 表和 FTS 中的 topic 字段
- **前端同步**：App.tsx 移除详情页"话题"显示，types.ts 移除 topic 和 TopicInfo 类型
**关键结论：**
- topic 和 tags 语义重叠，tags 的层级格式已足够承担"分类/筛选"功能
- 旧去重依赖 topic 做阈值调整，但 topic 是 LLM 自由生成、不可靠，是去重不准确的根因之一
- 新去重直接比较 original_question（核心判断）+ title + narrative 前 100 字，语义层面判断是否讨论同一实质问题
**产出文件：** `docs/prompts/topic-split/prompt.md`、`demo/server/ai.js`、`demo/server/db.js`、`demo/server/index.js`、`demo/web/src/types.ts`、`demo/web/src/api.ts`、`demo/web/src/App.tsx`、`src-tauri/db/schema.sql`、`src-tauri/src/main.rs`、全部 10 个意图 prompt、`docs/prompts/card-design-spec.md`

## 2026-05-24 — 全局 Prompt 叙事策略升级：放宽约束 + 追问与演进段落

**主题：** 解决卡片叙事"过于保守、字数偏少、信息不密集"的根本问题
**关键变更：**
- **核心策略**：从"严格 N 段 + 低字数上限"改为"N 到 M 段 + 放宽字数上限 + 新增追问与演进可选段"
- **追问与演进指令**：10 个意图 prompt 的 narrative 规则全部增加"多轮对话的递进必须体现"指令，要求模型写出追问、修正、认知变化的过程，不要只给最终结论
- **字数调整**：概念理解 200-400 → 300-600 | 技能学习 200-350 → 350-500 | 操作指南 150-250 → 250-400 | 规划决策 200-350 → 300-500 | 头脑风暴 150-300 → 300-500 | 交互陪伴 100-250 → 150-300 | 事实查询/内容创作/文本处理/其他不变
- **示例全部更新**：每个示例都增加追问与递进的叙事（"你接着问了一个问题…""讨论后你意识到…"）
- **card-design-spec 同步**：设计规范全部对齐新叙事策略
**产出文件：** 全部 10 个 prompt + `docs/prompts/card-design-spec.md` + `Guidance/PROGRESS.md`

**主题：** API 调用失败时卡片静默停留在"待总结"状态，用户无法识别和重试
**根因：** DeepSeek API 余额耗尽返回 402，Pipeline 抛异常但卡片保持初始空值，前端条件渲染 `narrative &&` 导致总结字段不可见
**关键变更：**
- **数据模型**：新增 `summarize_error` 字段（string | null），记录失败原因
- **后端** `demo/server/db.js`：`saveKnowledgeCard` / `updateKnowledgeCard` / 列表返回均支持 `summarize_error`；成功总结时自动清除该标记
- **后端** `demo/server/index.js`：Pipeline 失败时写入 `summarize_error`；手动重新总结成功时清除该标记
- **前端** `demo/web/src/App.tsx`：列表页失败卡片加橙色边框 + "总结失败" badge + 显示错误原因；详情页顶部加橙色提示条 + 操作指引
- **前端** `demo/web/src/index.css`：`.card-item--error` + `.error-badge` 样式
- **历史数据回填**：25 张旧失败卡片批量补写 `summarize_error`
**产出文件：** `demo/web/src/types.ts`、`demo/web/src/App.tsx`、`demo/web/src/index.css`、`demo/server/db.js`、`demo/server/index.js`

## 2026-05-24 — 话题切分器 Prompt 与代码数据流对齐

**主题：** 修复话题切分器 prompt 与代码实际发送/接收数据格式不一致的根本问题
**关键变更：**
- **prompt.md 重写**：输入格式从 `Turn[idx]: User/Assistant` 改为 `[N]: 内容`（只发 user 消息，与代码一致）；输出 JSON 模板强化字段描述，4 个示例全部对齐新格式
- **ai.js 解析层**：兼容 5 种 LLM 返回格式（数组 / {topic_blocks} / 单个块对象 / utterances 格式 / 无索引格式），新增 `start_user/end_user` 字段兼容
- **ai.js 防御层**：LLM 返回 N 个话题块但无 start_idx/end_idx 时，自动按块顺序推断索引
- **验证结果：** 天气 × 2 + 余华 → 2 张卡片 ✓ | Docker × 3 + PPT × 2 → 2 张卡片 ✓ | test-pipeline.js 全部通过
**产出文件：** `docs/prompts/topic-split/prompt.md`、`demo/server/ai.js`、`Guidance/bug-log.md`

## 2026-05-25 — 设置页重构（视觉+交互+验证）

**主题：** 设置页全面重构 — 水墨/米色风格 + 齿轮图标 + 测试连接 + 动态模型预设
**关键变更：**
- **侧边栏设置按钮**：去掉边框，改用 Material Symbols `settings` 齿轮图标
- **返回按钮**：从 `← 返回` 改为 `icon-btn` + `arrow_back`（与详情页一致）
- **页面布局**：新增米色卡片容器（`settings-card`），表单内容不再空旷
- **API 配置**：API 地址下拉保留 OpenAI/DeepSeek/智谱GLM/自定义；模型下拉根据 API 地址动态切换预设模型（OpenAI → gpt 系列 / DeepSeek → deepseek 系列 / 智谱 → glm 系列），均支持自定义输入
- **测试连接**：新增"测试连接"按钮，调用 `POST /api/settings/validate`，返回成功/失败状态和分类错误信息
- **保存按钮**：紫色大方块 → 紧凑型水墨深色（`#5a4a42`）
- **快速开始指南**：从开发者模式改为用户模式（配置 API → 安装扩展 → 打开 LLM 对话 → 查看卡片）
- **后端 validate 修复**：从调用完整 AI Pipeline 改为直接调用 `callOpenAICompatible()` 做最低限度 API 验证，错误分类为连接失败/Key 无效/地址错误
**产出文件：** `demo/web/src/api.ts`、`demo/web/src/App.tsx`、`demo/web/src/index.css`、`demo/server/index.js`、`demo/server/ai.js`

## 2026-05-25 — 侧边栏视觉优化（纯视觉，不改交互）

**主题：** 侧边栏观感优化
**关键变更：**
- 背景从黑色改为浅灰分层色调（`#f4f5f7` 主背景 + hover/active 半透明叠加）
- Logo 图标放大至 56×56px，Wordmark SVG 高度 32px，占据 Logo 区域一半空间
- 字体基准从默认调至 15px，导航项间距加宽
- 导航项 emoji 图标全部移除，改用 Google Material Symbols Rounded 字体图标
- 10 个意图分类各有语义匹配图标：home / star / bar_chart / lightbulb / search / school / list_alt / edit_note / sync_alt / assignment / auto_awesome / forum / folder_open
- 底部用户头像与设置按钮改为同行排列（flex row + space-between）
- 头脑风暴图标调试：`bulb`（无效→文字）→ `sparks`（仍无效→文字"RKS"）→ `auto_awesome`（星星闪光，可用）
- "其他"图标从 `more_vert`（三个点，留给卡片操作按钮）→ `folder_open`（文件夹）
**产出文件：** `demo/web/src/Logo.tsx`、`demo/web/src/App.tsx`、`demo/web/src/index.css`、`demo/web/index.html`

## 2026-05-25 — 卡片列表页全面重构

**主题：** 列表卡片布局从"问题预览+平台在顶部"改为"narrative 预览+更多菜单+标签截断"的新设计
**关键变更：**
- 标题右侧增加「⋮」更多按钮，弹出菜单（收藏/删除），点击外部自动关闭
- 正文预览从 original_question 改为 narrative 摘要（取前 120 字，优先在标点处截断）
- 标签行：第一个是意图分类，其余是自定义标签；溢出标签自动隐藏
- 每个 tag 添加 display: inline-block 防止内部折行
- 意图标签颜色从高饱和白字改为柔和 tint 方案（低饱和背景 + 深色文字），不抢标题
- 底部仅保留日期，平台来源 badge 移除；footer 用 margin-top: auto 贴在卡片底部
- 日期格式：今天 HH:MM 或 x月x日，iOS 系统字体
- narrative 预览使用华文中宋（STZhongsong）
- 侧边栏底色改为 #f5f5f5（与页面背景一致），卡片页面底色改为白色
- 导航栏图标和文字放大 1.15 倍，间距加宽
- 后端 db.js 列表接口新增 narrative 字段返回，字段名从 createdAt 改为 created_at 对齐前端类型
**产出文件：** `demo/web/src/App.tsx`、`demo/web/src/index.css`、`demo/web/src/types.ts`、`demo/server/db.js`

## 2026-05-25 — 收藏 & 标签交互完善

**主题：** 完善收藏按钮和标签筛选的交互体验
**关键变更：**
- **收藏按钮变黄**：详情页三点菜单中收藏按钮添加 `dropdown-item--starred` class，`starred: true` 时五角星和文字变为琥珀色（`#f59e0b`）
- **标签可点击筛选**：侧边栏标签从纯展示改为可点击，点击后自动切换到列表页并筛选该标签，再次点击取消
- **标签激活态**：当前选中的标签芯片变为深色背景 + 白字（`tag-chip--active`）
- **筛选指示条**：卡片列表页搜索栏下方新增标签筛选指示条（`tag-filter-bar`），显示当前筛选标签和清除按钮
- **后端支持**：`/api/cards` 新增 `tag` 查询参数，`db.js` 中 `getKnowledgeCards` 支持按标签精确匹配筛选
**产出文件：** `demo/web/src/App.tsx`、`demo/web/src/index.css`、`demo/server/index.js`、`demo/server/db.js`

## 2026-05-25 — 卡片详情页全面重构（从头构建）

**主题：** 点击卡片后的详情页从头构建，Tab 式布局 + 干净排版
**关键变更：**
- **Header**：纯图标返回箭头（arrow_back）+ 可编辑标题（点击 edit 图标进入编辑模式）+ 三点菜单（more_vert，弹出收藏/删除）
- **Tab 栏**：概览 / 原始对话，激活态蓝色底线指示器
- **概览 Tab**：核心问题（15px STZhongsong 加粗）+ 关键结论（华文中宋正文，行高 1.8）+ 标签行（仅 pill 文字）+ 来源（模型平台斜体 + 日期）+ 回到原始对话按钮
- **原始对话 Tab**：去掉 emoji，用户消息标签为"用户"，AI 消息标签为平台名称（ChatGPT/Claude/DeepSeek 等）
- **标题样式**：STZhongsong 28px / 900 字重 / letter-spacing 2px
- **视觉**：卡片 #fefefe 背景 + subtle box-shadow 区分页面底色
- 三点菜单收藏/删除复用现有 `updateCard()` API（PUT /cards/:id 传 `{starred: true/false}` 或 `{title: newValue}`）
**产出文件：** `demo/web/src/App.tsx`、`demo/web/src/index.css`

## 2026-05-25 — 悬浮球魔法棒图标 + 状态动画 + 闲置提醒 + 简洁报错

**主题：** 悬浮球视觉全面升级 — emoji 改为 SVG 魔法棒 + 4 种状态反馈 + 3 分钟定时提醒
**关键变更：**
- `content.js`：悬浮球图标从 🧠 改为 SVG 魔法棒（Material Symbols auto_fix Rounded 风格），零依赖纯内联 SVG
- **4 种状态反馈**：
  - 默认态：紫色渐变 + 魔法棒 SVG，hover 放大 1.1x
  - 抓取中：琥珀色渐变 + 魔法棒旋转动画（0.8s 一圈循环）
  - 成功：绿色渐变 + ✓ 对勾 SVG，tooltip 显示"已生成 N 张卡片"
  - 失败：红色渐变 + ✕ 叉号 SVG，tooltip 显示简洁报错
- **闲置提醒**：页面停留 3 分钟触发弹跳动画 + tooltip 提醒保存对话，DOM 变化时自动重置计时器（MutationObserver），用户点击后重置
- **简洁报错分类**：额度不足 → "API 额度不足，请检查设置后刷新页面" | Key 无效 → "API Key 无效，请检查设置后刷新页面" | 后端未启动 → "后端未启动，请刷新页面" | DOM 异常 → "页面结构异常，请刷新页面重试"
**产出文件：** `demo/extension/content.js`

## 2026-05-25 — 卡片导出功能实现

**主题：** 详情页添加导出功能（TXT/PDF/图片三种格式）
**关键变更：**
- `App.tsx`：CardDetail 新增 `handleExport` 函数，支持导出为 TXT（纯文本拼接）/ PDF（jsPDF 生成）/ 图片（html2canvas 截图 `.detail-card` 元素）
- 按钮位置：编辑标题 / 导出 / 更多三点菜单三者从左到右排列，编辑模式下仅显示保存/取消
- 导出内容：标题 + 核心问题 + 关键结论 + 标签 + 来源，PDF 图片下载自动触发
- `package.json`：新增 `jspdf` + `html2canvas` 依赖
**产出文件：** `demo/web/src/App.tsx`、`demo/web/package.json`

## 2026-05-25 — 侧边栏用户区域移除

**主题：** 去掉侧边栏底部用户头像 + 用户名元素，设置按钮左对齐放在原本用户的位置
**关键变更：**
- `App.tsx` Sidebar 组件：删除 `user-profile` div（头像 + "用户"文字），设置按钮去掉"设置"文字标签
- `index.css`：`.sidebar-footer` 改为 `justify-content: flex-start` 左对齐；删除 `.user-profile`、`.avatar-placeholder`、`.user-name` 样式
**产出文件：** `demo/web/src/App.tsx`、`demo/web/src/index.css`

## 2026-05-25 — 收藏/统计页视觉优化 + 卡片导出方案

**主题：** 收藏页标题改黑体、统计页标题格式对齐 + 用户区功能取舍讨论
**关键变更：**
- 收藏页标题从华文中宋改为黑体，统计页改为相同样式（黑体 28px + 底部黑线）
- 用户区讨论：加账号/云存储=项目性质改变（需要云存储、账号验证、运营）；不加=用户没安全感。中间方案待定
**产出文件：** `demo/web/src/App.tsx`、`demo/web/src/index.css`

## 2026-05-25 — 卡片导出功能（待执行）

**主题：** 卡片详情页添加导出按钮（TXT/PDF/图片），所有实现需兼容 Tauri 客户端迁移
**方案要点：**
- 导出内容：仅详情页概览（标题 + 关键结论 + 标签 + 来源），不导原始对话
- 存储路径：Tauri 端用 `dialog.open` 让用户自选路径，demo 端用浏览器下载机制模拟
- 格式实现：TXT（纯文本拼接，零依赖）/ PDF（`jsPDF` 生成）/ 图片（`html2canvas` 截图 DOM）
- 迁移策略：demo 阶段用 `window.download` 触发下载，Tauri 迁移后替换为 `dialog.open` + `tauri-plugin-fs` 写入文件
- 依赖：`jspdf` + `html2canvas`，均通过 npm 安装，Tauri 端可直接复用
**待改文件：** `demo/web/src/App.tsx`（CardDetail 加导出按钮）、`demo/web/package.json`（添加 jspdf + html2canvas）

## 2026-05-25 — 话题拆分 Prompt 强化 + Dedup 联合修复

**主题：** 修复同一次 capture 产生大量近似卡片的问题（天气+余华→5张、效率→13张、年龄/自律→30张）
**关键变更：**
- **话题切分 Prompt 强化**（`docs/prompts/topic-split/prompt.md`）：新增"同主题下的子话题不拆分"原则，举例说明个人效率提升下的 PARA/时间块/习惯回路属于同一大主题不拆分；新增示例 4 展示具体不拆分场景
- **去重逻辑加强**（`demo/server/ai.js` `deduplicateCards()`）：narrative 比较从 100 字 → 200 字；新增情况 6（同一次 capture 的卡片 narrative 重叠 >= 0.5 去重）；新增情况 7（任意两张同类型卡片 narrative 重叠 >= 0.65 去重）；去重日志输出 narrative 相似度
**产出文件：** `docs/prompts/topic-split/prompt.md`、`demo/server/ai.js`、`Guidance/bug-log.md`

## 2026-05-25 — Tauri 客户端开发 + ZIP 一键分发方案（待执行）

**主题：** Demo 验证通过后，启动 Tauri 2.0 桌面客户端开发 + ZIP 一键分发
**分发方案：**
- 客户端 + 扩展一起打包为 `release-vX.X.zip`，用户下载解压后两步安装
- 扩展不走 Chrome Web Store，采用开发者模式加载本地 extension 目录
- 客户端首次启动引导用户配置扩展开发者模式加载
- 客户端内置扩展版本检查 + 更新提醒机制
**待办清单：**
1. Tauri 2.0 脚手架搭建 + SQLite 数据库迁移（JSON → SQLite）
2. 扩展与客户端通信方案选型（HTTP localhost vs Native Messaging）
3. 客户端功能对齐 demo 全部 API（卡片 CRUD / 筛选 / 统计 / 收藏）
4. 扩展打包脚本：自动从 extension/ 目录生成 ZIP + README 安装指引
5. Windows .exe 代码签名（解决 SmartScreen 拦截）
6. 安装引导页 + 扩展配置向导（首次启动）
7. 客户端自动更新机制（tauri-plugin-updater）
**产出文件：** `src-tauri/`、`demo/extension/`（需适配）、`Guidance/architecture.md`

## 2026-05-25 — Tauri 客户端 main.rs 编译修复 + AI Pipeline 基础版

**主题：** 修复 main.rs 全部编译错误，补齐缺失 API（tags/statistics/summarize/status），AI Pipeline 基础版就绪
**关键变更：**
- **main.rs 完全重写**：废弃 `tauri_plugin_sql::Database`（v2 不存在该类型），改用 `sqlx::SqlitePool` 直连，所有 SQL 语法统一为 SQLite `?N` 参数占位符
- **Cargo.toml**：新增 `sqlx`（runtime-tokio + sqlite + macros）、`indexmap`、`tokio`（rt-multi-thread）依赖
- **缺失 API 补齐**：新增 `get_tags`（标签聚合）、`get_statistics`（统计面板）、`get_status`（状态检查）、`summarize_card`（AI 总结触发）
- **schema.sql 更新**：新增 `narrative`（卡片叙事正文）、`full_output`（完整产出）、`summarize_error`（失败标记）字段；FTS 表同步加入 `narrative`
- **AI Pipeline 基础版**：`run_ai_pipeline()` 用 reqwest 调用 OpenAI 兼容接口，支持 JSON 提取/修复，返回 `PipelineCardResult`（待完善：prompt 文件加载、话题切分、意图分类、去重）
- **前端 api.ts**：补齐 Tauri 路由（/tags、/statistics、/cards/:id/summarize、/status），`summarizeCard` 支持传入 settings 参数
**验证结果：** `cargo check` 通过，0 errors 0 warnings
**产出文件：** `src-tauri/src/main.rs`（完全重写）、`src-tauri/Cargo.toml`、`src-tauri/db/schema.sql`、`demo/web/src/api.ts`
