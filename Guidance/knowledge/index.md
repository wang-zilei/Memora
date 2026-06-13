<!-- idx: CSS截断 | Logo统一 | 本地启动 | 窗口图标缺失 | ICO多尺寸 | React组件remount | markdown质检 | 分类器误判 | Kimi DOM | Tauri清洗缺失 | FTS损坏 | 话题拆分+去重 | max_tokens截断 -->

# 知识库索引

> type: fix = Bug修复 | pattern = 可复用范式 | rule = 永久项目规则

| type | ID | 标题 | 关键词 | 日期 | 关联 |
|------|-----|------|--------|------|------|
| fix | E-029 | Tauri运行时窗口显示默认图标 | tauri, set_icon, 窗口图标, 任务栏 | 06-04 | <- P-013 |
| pattern | P-013 | Windows ICO 多尺寸 + Tauri 窗口图标设置 | ICO, DPI, 多尺寸, set_icon, include_bytes | 06-04 | -> E-029 |
| pattern | P-012 | CSS line-clamp 精确截断 | line-clamp, max-height, em | 06-04 | |
| pattern | P-011 | 品牌 Logo SVG 三处统一替换 | Logo, SVG, 图标, 侧边栏, 桌面 | 06-04 | <- R-001 |
| rule | R-001 | 本地测试启动方式 | tauri, npx, dev, 启动 | 06-04 | -> P-011 |
| fix | E-027 | React内联组件remount导致state丢失 | react, remount, local state | 05-26 | -> P-010 |
| fix | E-025 | AI输出残留markdown格式符号 | markdown, AI输出, 质检 | 05-26 | |
| fix | E-024 | 列表时间不一致+Tauri外部链接无反应 | 时间, Tauri, IPC | 05-26 | |
| fix | E-023 | 意图分类器误判为"其他"(三层根因) | 分类器, few-shot, prompt | 05-26 | -> P-007, P-008, P-009 |
| fix | E-022 | Kimi DOM变更导致抓取失败 | Kimi, DOM, 选择器, 回退 | 05-26 | |
| fix | E-021 | Tauri完全缺少对话清洗逻辑 | Tauri, 清洗, Rust | 05-26 | |
| fix | E-018 | FTS触发器导致数据库损坏 | FTS, SQLite, 触发器 | 05-26 | |
| fix | E-017 | 话题拆分过细+去重太弱 | 切分, 去重, Jaccard | 05-25 | -> P-005 |
| fix | E-016 | max_tokens导致长对话narrative为空 | max_tokens, JSON截断 | 05-25 | |
| pattern | P-010 | 局部状态覆写模式 | react, state, 覆写, optimistic | 05-26 | <- E-027 |
| pattern | P-007 | 分类决策树Prompt设计 | prompt, 分类, 决策树 | 05-26 | <- E-023 |
| pattern | P-008 | Prompt few-shot必须在提取范围内 | prompt, few-shot, 提取 | 05-26 | <- E-023 |
| pattern | P-009 | LLM分类输出多语言兼容 | LLM, 多语言, key匹配 | 05-26 | <- E-023 |
| pattern | P-005 | 语义去重(切分+去重双引擎) | 去重, 切分, Jaccard | 05-24 | <- E-017 |
| pattern | P-006 | topic与tags不冗余设计 | topic, tags, 字段冗余 | 05-24 | |
