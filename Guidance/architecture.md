# 工作区文件层级 + 系统架构

> 记录项目目录结构、系统架构、技术栈、关键接口。

---

## 一、文件层级

```
h:\llm-chat-knowledge-base\
├── CLAUDE.md                    # 项目规则与文档索引
├── docs/                        # 产品/技术文档
│   ├── PRD-v2.md                # 产品需求文档（当前版本）
│   ├── prompts/                 # 意图识别 Prompt 模板（10 意图 + 分类器 + 话题切分）
│   │   ├── classifier/          # 意图分类器（~110 行决策树 + few-shot）
│   │   ├── topic-split/         # 话题切分器（合并优先原则）
│   │   ├── card-design-spec.md  # 10 类卡片叙事格式规范
│   │   └── <intent>/            # 各意图 prompt（概念理解/事实查询/...）
├── Guidance/                    # 项目协作文档
│   ├── PROGRESS.md              # 任务阶段进度 + 待办
│   ├── bug-log.md               # Bug 记录与根因分析
│   ├── architecture.md          # 本文件
│   ├── pattern-library.md       # 可复用解决范式
│   └── project-log.md           # 会话总结记录
├── app/web/                     # React + Vite + TypeScript 正式客户端前端
│   └── src/
│       ├── api.ts               # API 适配层（HTTP/Tauri 双模式）
│       ├── types.ts             # 类型定义（对齐 PRD-v2）
│       ├── App.tsx              # 页面组件（列表/详情/收藏/统计/设置）
│       ├── Logo.tsx             # Logo + 导航图标组件
│       ├── index.css            # 全局样式
│       └── assets/              # SVG 图标（like/liked/delete）
├── extension/                   # 浏览器扩展 MV3
├── src-tauri/                   # Tauri 2.0 桌面应用
│   ├── Cargo.toml
│   ├── tauri.conf.json          # 窗口 1440×860，资源 prompts/**/*.md
│   ├── src/main.rs              # Rust 后端（Tauri commands + axum HTTP + AI Pipeline + SQLite）
│   ├── db/schema.sql            # 6 表 + FTS5 全文搜索
│   └── prompts/                 # Prompt 副本（打包发布用，与 docs/prompts 同步）
├── scripts/                     # 独立探针脚本
└── chat-export/ ctxport/ gemini-voyager/  # 参考项目（独立 git 仓库）
```

## 二、系统架构

```
┌─────────────────────────────────────────────────┐
│                  用户浏览器                       │
│  ┌──────────────┐   ┌────────────────────────┐   │
│  │  LLM 网页     │   │  Chrome 扩展（MV3）     │   │
│  │  (豆包/GPT..) │   │  · 悬浮球 (SVG 魔法棒)  │   │
│  └──────────────┘   └───────────┬────────────┘   │
│                                 │ HTTP POST       │
└─────────────────────────────────┼─────────────────┘
                                  │
┌─────────────────────────────────┼─────────────────┐
│  Tauri 2.0 桌面应用 (Memora)    │ localhost:17321  │
│  ┌──────────────────┐  ┌───────▼──────────────┐   │
│  │  Frontend        │  │  Rust Backend         │   │
│  │  (React + Vite)  │  │  · axum HTTP Server   │   │
│  │  · 知识库 UI     │  │  · SQLite (app data)  │   │
│  │  · 设置/导出     │  │  · AI Pipeline (4步)  │   │
│  └──────────────────┘  └───────────────────────┘   │
└────────────────────────────────────────────────────┘
```

**数据分层**：Raw → Clean → KnowledgeCard  
**数据库**：`%APPDATA%/com.memora.app/knowledge_base.db`

## 三、技术栈

| 组件 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.0 |
| 前端 | React + Vite + TypeScript |
| 后端 | Rust（tauri commands + axum HTTP） |
| 数据库 | SQLite（sqlx），6 表 + FTS5 |
| AI | OpenAI 兼容 API（用户自带 Key） |
| 扩展 | Chrome Extension MV3 |
| 通信 | HTTP localhost:17321（`VITE_API_MODE=http`） |

## 四、HTTP API 路由表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/capture` | 接收扩展抓取数据 → Pipeline → 存储 |
| GET | `/api/cards` | 卡片列表（page/pageSize/card_type/tag/keyword） |
| GET | `/api/cards/{id}` | 卡片详情（含 narrative/unresolved_questions/对话） |
| PUT | `/api/cards/{id}` | 更新卡片（title/card_type/narrative/tags/starred） |
| DELETE | `/api/cards/{id}` | 删除卡片 |
| POST | `/api/cards/{id}/summarize` | 触发 AI 重新总结 |
| GET | `/api/tags` | 标签聚合（含 count） |
| GET | `/api/statistics` | 统计面板（total/byType/byPlatform/byTag） |
| GET | `/api/settings` | 获取设置 |
| PUT | `/api/settings` | 更新设置 |
| POST | `/api/settings/validate` | 测试 API 连接 |
| POST | `/api/open-url` | 系统浏览器打开外部链接 |
| GET | `/api/status` | 服务状态 |

## 五、SQLite Schema

```
raw_conversations        id, platform, messages_json, captured_at
clean_conversations      id, raw_id, messages_json
knowledge_cards          id, raw_id, clean_id, title, original_question,
                         card_type, narrative, full_output, summarize_error,
                         tags_json, unresolved_questions_json,
                         exploration_paths_json, review_schedule_json,
                         source_*, raw/clean_messages_json, starred, archived
settings                 key, value
user_stats               key, value_json
cards_fts                FTS5 全文搜索（独立表，card_id 关联）
```

## 六、变更历史

| 日期 | 变更 |
|------|------|
| 2026-05-15 | 项目初始化，创建 `docs/`、三个参考项目克隆 |
| 2026-05-22 | PRD-v2 产出，5 方向产品方案确立 |
| 2026-05-23 | 4 步 Pipeline + 10 意图 prompt 全量重写 + card_type 中文化 |
| 2026-05-24 | 切分+去重架构重构，topic 字段移除，全局叙事策略升级 |
| 2026-05-25 | 前端 UI 全面重构（侧边栏/列表/详情/设置/收藏/统计）+ Logo 组件 |
| 2026-05-26 | Tauri 1:1 复刻 Demo 数据链路（清洗模块 + HTTP 路由 + FTS 修复） |
| 2026-05-26 | 分类器三层修复（Prompt 精简 + few-shot 嵌入 + 中文值兼容） |
| 2026-05-26 | 质检兜底（sanitizeContent 三层复用）+ 外部链接后端方案 |
| 2026-05-26 | 组件 remount 根因修复（P-010 局部状态覆写）+ SVG 图标 + ConfirmModal |
| 2026-05-26 | 客户端 3 列布局（窗口 1440 + 侧边栏 260 + 网格 minmax 230） |
| 2026-05-27 | 筛选计数修复（COUNT 查询参数绑定）+ 数据库路径迁移到 `%APPDATA%` |
