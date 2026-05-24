# 会话记录

> 每次实质会话的简短总结。新记录追加到末尾。

---

## 2026-05-21 — 按用户级规范重构 Guidance 文档体系

**主题：** 工作区文档结构规范化
**关键结论：** 将 `docs/` 中的进度、Bug、架构文档迁移到 `Guidance/` 目录体系，与用户级 CLAUDE.md 规范对齐；`docs/` 原始文件保留作为归档。
**产出文件：** `Guidance/PROGRESS.md`、`Guidance/bug-log.md`、`Guidance/architecture.md`、`Guidance/project-log.md`

## 2026-05-21 — 优化 architecture.md 设计定义

**主题：** architecture.md 结合文件层级与系统架构
**关键结论：** 用户级 CLAUDE.md 中 architecture.md 的定义扩展为"文件层级 + 系统架构图 + 技术栈 + 关键接口"；`Guidance/architecture.md` 重写为五板块结构，合并了旧 `docs/架构.md` 的架构图和接口表，以及新文档的文件层级和变更历史。
**产出文件：** 更新 `C:\Users\Jackson lee\.claude\CLAUDE.md`、`Guidance/architecture.md`

## 2026-05-22 — 前后端启动 + inspire 文档创建

**主题：** 启动 demo 前后端 + 创建产品思路拓展文档
**关键结论：** demo 项目前后端可同时启动（`npm run dev:all`），后端 localhost:17321，前端 localhost:5173；创建 `docs/inspire.md` 记录5个思路拓展方法。
**产出文件：** `docs/inspire.md`

## 2026-05-22 — 5方向深度产品思考

**主题：** 5个Agent并行探索复杂内容抓取、意图识别、界面展示、用户管理、复习激活
**关键结论：**
- 复杂内容：图片只存URL、文件附件永远不做
- 意图识别：7大类26子类分类体系 + 4套Prompt模板
- 界面设计：5条设计原则（找得到>好看、密度随深度递增等）
- 复习激活：艾宾浩斯+场景触发混合算法，MVP约5-7天
**产出文件：** `docs/inspire_result.md`

## 2026-05-22 — PRD-v2 产品需求文档产出

**主题：** 根据 PRD-v1 + inspire_result.md 融合产出 PRD-v2，意图 prompt 独立到子目录
**关键结论：**
- PRD-v2 融合 5 方向深度产品方案，排除不建议开发项，按最高版本采纳
- 意图识别 7 类 prompt 独立维护在 `docs/prompts/` 各子目录下
**产出文件：** `docs/PRD-v2.md`、`docs/prompts/` 下 7 个意图 prompt 文件

## 2026-05-22 — PRD-v2 意图分类重构 + 复习措辞优化

**主题：** 意图分类从"7大类+26子类"重构为"10大类+LLM自由主题"，全文替换压力感措辞
**关键结论：**
- 10个意图大类：概念理解/事实查询/技能学习/操作指南/内容创作/文本处理/规划决策/头脑风暴/交互陪伴/其他
- 新增 topic 字段（LLM提炼的简洁话题标签），删除 intent_code
- 全文替换"待复习/队列清空/超期/轰炸/推送"等制造压力感的表述
**产出文件：** `docs/PRD-v2.md`、`Guidance/PROGRESS.md`、`Guidance/project-log.md`

## 2026-05-23 — 意图识别 Pipeline 重构 + Prompt 全量重写

**主题：** 意图识别从单Prompt改为4步流水线，Prompt按叙事范式全量重写
**关键结论：**
- Pipeline: 数据清洗 → 话题切分(基于user消息序列) → 意图分类 → 卡片生成
- 删除所有旧 intent_code/insights/outputs/review_material，统一为 narrative 字段
- 10个意图各有不同的叙事风格（词典式/快答式/路线图/步骤式/全文式/对比式/聚类式/日记式/极简式）
- content_creation 和 text_processing 新增 full_output 存完整内容
**产出文件：** `docs/prompts/` 全部重写 + 新建 `card-design-spec.md`、`topic-split/prompt.md`

## 2026-05-23 — Prompt 精细化重构（concept_exploration）

**主题：** 重写 concept_exploration prompt，提升 narrative 输出质量
**关键结论：**
- 角色从"知识卡片生成专家"改为"知识结构分析专家"，明确 LLM 输出数据而非直接生成卡片
- 删除固定"定义+机制"两段式，新增 5 种组织结构让 LLM 自主选择（金字塔/3W1H/因果链/对比/演进）
- narrative 规则大幅细化：结构选择规则、定义段句式、展开段认知增量要求、人称/语气规则
- prompt 添加 `{{conversation}}` 占位符标记对话数据拼接点
**产出文件：** 重写 `docs/prompts/concept-exploration/prompt.md`、更新 `card-design-spec.md`、`Guidance/PROGRESS.md`

## 2026-05-23 — Prompt 全量精细化重构（10 意图全部完成）

**主题：** 9 个剩余意图 prompt 全量重写 + card_type 中文化 + 全链路同步
**关键结论：**
- 9 个意图（事实查询/技能学习/操作指南/内容创作/文本处理/规划决策/头脑风暴/交互陪伴/其他）全部采用与概念理解相同的精细化结构
- card_type 从英文 key 改为中文值，同步更新 TypeScript CardType 类型定义
- 每个意图都有角色设定、逐字段 JSON 描述、叙事规则、2 个示例
- 统一添加 {{conversation}} 占位符，删除 review_material 废弃字段
**产出文件：** 全部 10 个 prompt + classifier + card-design-spec + types.ts + 进度文档

## 2026-05-23 — 抓取脚本 scripts/ 集成 + Qwen 修复

**主题：** extension 抓取逻辑重写为 scripts/ 已验证代码 + Qwen DOM 结构发现与修复
**关键结论：**
1. extension 抓取代码从未使用 scripts/ 下已验证的脚本，是独立写的 TreeWalker 方案，存在大量未验证假设
2. 完整替换为 scripts/ 的 createVisibleDomProbe 框架（cloneNode + junk filtering + Shadow DOM + 智能滚动），所有平台共用统一模式
3. DeepSeek token 解析修正：`JSON.parse(stored).value` 而非 `.replace(/"/g, '')`；补全缺失的 API headers
4. Qwen Bug 根因：`[class*="message"]` 匹配了 17 个外层布局容器，不是单个消息。Qwen 真实 DOM 结构是 `message-select-wrapper-question/answer` 包裹 `message-select-content`
5. Qwen 修复：绕过通用框架，用精确选择器直接查询 wrapper 和 content 元素
6. scripts/ 探针增强：kimi/qwen/minimax/yuanbao 统一添加 containsDescendant() 嵌套去重
**产出文件：** `demo/extension/content.js`、`Guidance/bug-log.md`、`Guidance/PROGRESS.md`

**主题：** 修复 4 步流水线消息切片和 Prompt 提取的多个 Bug，demo 验证通过
**关键结论：**
1. `splitTopics` 中 `origIdx` 映射错误：`filter().map()` 的索引是 filter 后的 0,1,2，不是 messages 数组实际位置。改为 `for` 循环保留原始索引。
2. `extractPromptBlock` 只提取了第一个 JSON 模板代码块，丢了角色设定和约束。改为提取 `## 角色设定` 到 `## 示例输出` 之间的内容。
3. 话题切分器 LLM 返回格式不稳定（`start/end/topic` vs `start_idx/end_idx/topic_hint` vs `start_message/end_message`），添加兼容映射。
4. `extractBlockMessages` 索引映射修复后，每个话题块正确包含 user+assistant 完整对话对。
- 单话题测试：Python GIL → "概念理解" ✓
- 多话题测试：闭包→概念理解 ✓，快速排序→内容创作 ✓，情绪聊天→交互陪伴 ✓
**产出文件：** `demo/server/ai.js`

## 2026-05-24 — 启动前后端踩坑记录 + 前端 build

**主题：** 本地前后端启动耗时排查
**问题：**
1. Claude Code 的 bash 环境缺少大量基础命令：`grep`、`cat`、`head`、`sleep`、`node`、`npm` 均不可用
2. Node.js 安装在 `F:/node.exe`，但不在环境变量 PATH 中
3. `concurrently` 内部也会调用 `node` 执行子进程，同样因 PATH 缺失失败
4. Vite 的 `.bin/vite` 是 bash shell 脚本（非纯 JS），调用 `node` 解析失败；必须用 `node ./node_modules/vite/bin/vite.js build` 直接执行
5. 需手动 `export PATH="/f:$PATH"` 才能让 node 在子进程中被正确找到
**教训：** 以后启动服务时，后端用 `node server/index.js`（直接指定 F:/node.exe 路径），前端 build 用 `node ./node_modules/vite/bin/vite.js build`。不要依赖 `npm run`、`concurrently` 等间接方式。
**产出文件：** 前端 build 到 `demo/web/dist/`，后端已在 localhost:17321 启动

## 2026-05-24 — 前端改为意图分类导航 + 详情展示主体内容

**主题：** 发现后端 4 步 Pipeline 已完整产出意图分类和主体内容，但前端未展示，完成前后端对齐
**关键结论：**
- 后端 `db.js` 新增 `cardType` 参数过滤，`index.js` 路由透传 `card_type` query
- 侧边栏从"主题分类"改为 10 个意图大类 + 计数（概念理解/事实查询/.../其他）
- 列表卡片加 `card_type` 标签（紫色 badge）
- 详情页标题旁显示意图类型 badge，新增"卡片叙事"区块展示各意图 prompt 的主体内容
- 用户确认"不要 full_output，详情页有 card_type 就行"
**产出文件：** `demo/server/db.js`、`demo/server/index.js`、`demo/web/src/App.tsx`

## 2026-05-24 — Pipeline 共性问题修复：拆分/去重/格式

**主题：** 修复话题拆分过细、卡片重复、格式混乱三个共性问题
**关键结论：**
- topic-split prompt 新增"合并优先"原则，示例顺序调整（不拆分案例放第一个），新增 Docker volume 模棱两可不拆示例
- ai.js 新增 deduplicateCards 函数，基于 card_type + topic + Jaccard 相似度轻量去重
- how-to / skill-learning prompt 统一序号格式为 `1. 2. 3.`，步骤段内用 `\n` 分隔独占一行
**产出文件：** `docs/prompts/topic-split/prompt.md`、`docs/prompts/how-to/prompt.md`、`docs/prompts/skill-learning/prompt.md`、`docs/prompts/card-design-spec.md`、`demo/server/ai.js`

## 2026-05-24 — 全局 Prompt 换行策略规范化

**主题：** 按意图类型统一 narrative 换行/分段规则，参考 skill-learning/how-to 的"格式分隔符"模式
**关键结论：**
- 短叙事类（fact-query、other）：全文强制一段，不可使用换行符
- 列表结构类（skill-learning、how-to、brainstorm）：段落 + 列表格式分隔（`1. 2. 3.` / 方向一/二/三），列表项独占一行用 `\n` 分隔
- 散文分析类（planning-decision、concept-exploration）：固定 N 段，段间 `\n`，每段内连续文本不可换行
- 自由叙事类（interactive-companion、content-creation、text-processing）：允许自然分段，段间用 `\n`
**产出文件：** 全部 10 个意图 prompt + 进度文档

## 2026-05-24 — 全局 Prompt 叙事策略升级：放宽约束 + 追问与演进

**主题：** 解决卡片叙事"过于保守、字数偏少、信息不密集"的根本问题
**关键结论：**
- 核心策略：从"严格 N 段 + 低字数上限"改为"N 到 M 段 + 放宽字数上限 + 新增追问与演进可选段"
- 追问与演进指令：10 个意图 prompt 全部增加"多轮对话的递进必须体现"指令
- 字数调整：概念理解 300-600 | 技能学习 350-500 | 操作指南 250-400 | 规划决策 300-500 | 头脑风暴 300-500 | 交互陪伴 150-300
- 示例全部更新：增加追问与递进的叙事
**产出文件：** 全部 10 个 prompt + `card-design-spec.md` + 进度文档

## 2026-05-25 — 前端侧边栏重构 + 新页面

**主题：** 侧边栏从 240px 白底 → 25% 灰底质感设计，新增收藏/统计页面
**关键变更：**
- 新增 Logo 内联 SVG 组件（名称.svg 图标 + logo.svg 文字标识）
- 侧边栏导航：首页/收藏/统计 + 意图分类（去掉数字）+ 全部标签云 + 用户区
- 新增收藏列表页（调用 getStarredCards API）
- 新增统计页（总数 + 意图分布 + 平台分布 + 标签 TOP10）
- 后端新增 3 个 API：/api/tags、/api/statistics、/api/cards?starred=true
- db.js 补全 starred/archived 字段持久化（之前只在 TS 类型中定义）
**产出文件：** `demo/web/src/Logo.tsx`、`demo/web/src/App.tsx`、`demo/web/src/index.css`、`demo/web/src/api.ts`、`demo/web/src/types.ts`、`demo/server/db.js`、`demo/server/index.js`
**后续：** 用户反馈设计视觉质量不达标，未正确使用 frontend-design skill，需要重做

## 2026-05-25 — 前端视觉重设计（frontend-design skill）

**主题：** 使用 frontend-design skill 全面重新设计前端 UI
**关键结论：** 上次设计未调用 frontend-design skill，视觉效果不佳，本次正式使用该 skill 指导设计

## 2026-05-25 — 卡片列表页全面重构

**主题：** 列表卡片布局从"问题预览+平台在顶部"改为"narrative 预览+更多菜单+标签截断"的新设计
**关键变更：**
- 标题右侧增加「⋮」更多按钮，弹出菜单（收藏/删除），点击外部自动关闭
- 正文预览从 original_question 改为 narrative 摘要（取前 120 字，优先在标点处截断）
- 标签行第一个是意图分类，其余是自定义标签；溢出标签自动隐藏（flex nowrap + overflow hidden）
- 每个 tag 添加 display: inline-block 防止内部折行
- 意图标签颜色从高饱和白字改为柔和 tint 方案（低饱和背景 + 深色文字），不抢标题
- 底部仅保留日期，平台来源 badge 已移除；日期/平台 footer 用 margin-top: auto 贴在卡片底部
- 日期格式：今天 HH:MM 或 x月x日，iOS 系统字体（SF Pro Display）
- narrative 预览使用华文中宋（STZhongsong），英文自动回退 sans-serif
- 侧边栏底色改为 #f5f5f5（与页面背景一致），卡片页面底色改为白色
- 导航栏图标和文字放大 1.15 倍，间距加宽
- 后端 db.js 列表接口新增 narrative 字段返回，字段名从 createdAt 改为 created_at 对齐前端类型
**产出文件：** `demo/web/src/App.tsx`、`demo/web/src/index.css`、`demo/web/src/types.ts`、`demo/server/db.js`

## 2026-05-25 — 卡片详情页全面重构

**主题：** 详情页从头构建，Tab 式布局 + 可编辑标题 + 三点菜单
**关键结论：** 废弃原有混乱布局，新增概览/原始对话 Tab，标题可编辑（STZhongsong 28px/900/letter-spacing 2px），收藏/删除复用 updateCard API
**产出文件：** `demo/web/src/App.tsx`、`demo/web/src/index.css`
