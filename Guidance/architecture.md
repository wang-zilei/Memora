# 工作区文件层级 + 系统架构

> 记录项目目录结构（每个目录/文件的作用 + 变更历史）以及系统架构（数据流、技术栈、关键接口）。

---

## 一、文件层级

```
h:\llm-chat-knowledge-base\
├── CLAUDE.md                    # 项目规则与文档索引
├── README.md                    # 项目入口说明
├── docs/                        # 产品/技术文档（原始产品需求、调研文档）
│   ├── PRD-v1.md                # 产品需求文档 v1
│   ├── PRD-v2.md                # 产品需求文档 v2（意图分类/复习/统计/用户管理）
│   ├── product-requirements.md  # 早期产品需求简报
│   ├── chat-capture-research.md # 抓取方案调研
│   ├── inspire.md               # 产品思路拓展方法与框架
│   ├── inspire_result.md        # 产品思路拓展深度研究结果
│   ├── prompts/                 # 意图识别 Prompt 模板
│   │   ├── classifier/          # 意图分类器（只做意图判断）
│   │   ├── topic-split/         # 话题切分器（独立模块，基于完整对话对 Turn pairs）
│   │   ├── card-design-spec.md  # 10 类卡片叙事格式规范
│   │   ├── concept-exploration/ # 概念理解 Prompt
│   │   ├── fact-query/          # 事实查询 Prompt
│   │   ├── skill-learning/      # 技能学习 Prompt
│   │   ├── how-to/              # 操作指南 Prompt
│   │   ├── content-creation/    # 内容创作 Prompt（含产出内容概览）
│   │   ├── text-processing/     # 文本处理 Prompt（含处理后内容概览）
│   │   ├── planning-decision/   # 规划决策 Prompt
│   │   ├── brainstorm/          # 头脑风暴 Prompt
│   │   ├── interactive-companion/ # 交互陪伴 Prompt（叙事式单段落）
│   │   └── other/               # 其他型 Prompt
│   └── 架构.md                   # 旧架构文档（内容已合并到本文件）
├── Guidance/                    # 项目协作文档（用户级规范要求）
│   ├── PROGRESS.md              # 任务阶段进度
│   ├── bug-log.md               # Bug 记录与根因分析
│   ├── architecture.md          # 本文件：文件层级 + 系统架构
│   └── project-log.md           # 会话总结记录
├── demo/                        # Demo 代码（Node.js 后端 + React 前端 + 扩展）
│   ├── package.json             # monorepo root，concurrently 启动前后端
│   ├── server/                  # 后端：Express + JSON 存储
│   ├── web/                     # 前端：React + Vite + TypeScript（复用为 Tauri frontend）
│   │   └── src/
│   │       ├── api.ts           # API 适配层（HTTP/Tauri 双模式）
│   │       └── types.ts         # 类型定义（对齐 PRD-v2 数据模型）
│   └── extension/               # Chrome 扩展 MV3
├── src-tauri/                   # Tauri 2.0 桌面应用（PRD-v2 目标架构）
│   ├── Cargo.toml               # Rust 依赖配置
│   ├── tauri.conf.json          # Tauri 应用配置
│   ├── build.rs                 # Tauri build 脚本
│   ├── src/
│   │   └── main.rs              # Rust 后端主程序（Tauri commands + DB 初始化）
│   └── db/
│       └── schema.sql           # SQLite 数据库 schema（6 张表 + FTS）
├── scripts/                     # 独立脚本
│   └── doubao-console-capture.js # 豆包 DevTools Console 抓取探针
├── chat-export/                 # 参考项目（独立 git 仓库）：ChatGPT/Claude/Gemini 导出扩展
├── ctxport/                     # 参考项目（独立 git 仓库）：多平台对话复制/导出
└── gemini-voyager/              # 参考项目（独立 git 仓库）：Gemini 增强与导出扩展
```

## 二、系统架构

### 整体架构

```
┌─────────────────────────────────────────────────┐
│                  用户浏览器                       │
│  ┌──────────────┐   ┌────────────────────────┐   │
│  │  LLM 网页     │   │  浏览器扩展（MV3）       │   │
│  │  (豆包/GPT..) │   │  · 悬浮球 (content)      │   │
│  │              │   │  · Provider 抓取         │   │
│  └──────────────┘   └───────────┬────────────┘   │
│                                 │ HTTP POST       │
└─────────────────────────────────┼─────────────────┘
                                  │ localhost:17321
┌─────────────────────────────────┼─────────────────┐
│            桌面服务 / Demo 后端   │                  │
│  ┌──────────────────┐  ┌───────▼──────────────┐   │
│  │  知识库 Web UI   │  │  后端 API (Express)     │   │
│  │  (React + Vite)  │  │  · 接收扩展抓取数据      │   │
│  │  · 列表/搜索/详情 │  │  · AI 总结 (OpenAI)     │   │
│  │  · 标签筛选/导出 │  │  · JSON 存储           │   │
│  │  · 设置/API Key  │  │  · 文件导入导出         │   │
│  └──────────────────┘  └───────────────────────┘   │
└────────────────────────────────────────────────────┘
```

**数据分层：** Raw → Clean → KnowledgeCard

### 目标架构（Tauri 2.0）

```
┌─────────────────────────────────────────────┐
│  Tauri 2.0 桌面应用                          │
│  ┌────────────────┐  ┌──────────────────┐   │
│  │  Frontend      │  │  Rust Backend     │   │
│  │  (React+Vite)  │  │  · HTTP 服务       │   │
│  │                │  │  · SQLite 存储     │   │
│  │  · 知识库 UI   │  │  · AI API 调用     │   │
│  │  · 设置/导出   │  │  · 系统托盘        │   │
│  └───────┬────────┘  └───────┬──────────┘   │
└──────────┼───────────────────┼──────────────┘
           │  tauri::command    │  localhost:17321
┌──────────┼───────────────────┼──────────────┐
│  浏览器扩展 (MV3)            │               │
│  ┌──────┴──────┐            │               │
│  │  Provider   │  抓取逻辑    │               │
│  │  · 豆包     │  ┌─────┐   │               │
│  │  · GPT     │  │CSP  │   │               │
│  │  · ...     │  │约束  │   │               │
│  └─────────────┘  └─────┘   │               │
└─────────────────────────────┘
```

## 三、Demo 阶段关键接口

### 后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/capture` | 接收扩展抓取的原始对话数据 |
| GET | `/api/cards` | 获取知识卡片列表 |
| GET | `/api/cards/:id` | 获取单条卡片详情 |
| POST | `/api/cards/:id/summarize` | 触发 AI 总结 |
| GET | `/api/topics` | 获取主题列表 |
| GET | `/api/settings` | 获取设置 |
| PUT | `/api/settings` | 更新设置（API Key 等） |
| GET | `/api/status` | 服务状态检查 |

### 前端组件

| 文件 | 职责 |
|------|------|
| `App.tsx` | 路由与页面布局 |
| `Logo.tsx` | LogoIcon / LogoWordmark SVG + NavIcon 字体图标组件 |
| `index.css` | 全局样式（侧边栏/卡片/页面布局） |
| `api.ts` | 对后端 API 的 fetch 封装 |
| `types.ts` | Card、Topic、Settings 等类型定义 |

## 四、技术栈

### Demo 阶段

| 组件 | 技术 |
|------|------|
| 后端 | Node.js + Express，JSON 文件存储 |
| 前端 | React + Vite + TypeScript |
| 扩展 | Chrome Extension MV3 |
| AI 总结 | OpenAI 兼容 API |
| 启动 | `concurrently` 同时启动前后端 |

### Tauri 2.0 目标架构

| 组件 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.0 |
| 前端 | React + TypeScript + Tailwind CSS（复用 Demo web/） |
| 后端 | Rust（Tauri commands） |
| 数据库 | SQLite（tauri-plugin-sql） |
| AI 总结 | GPT-4.1 nano / DeepSeek V3（用户自带 Key） |
| 构建 | pnpm + Vite |
| 跨平台 | Windows (.msi) + Mac (.dmg) |
| CI/CD | GitHub Actions |

### 前端通信适配层

| 模式 | 环境变量 | 说明 |
|------|---------|------|
| HTTP (Demo) | `VITE_API_MODE=http` | fetch 调用 Express 后端 |
| Tauri (Production) | `VITE_API_MODE=tauri` | invoke 调用 Rust commands |

同一份前端代码在两种模式下均可运行，减少调试成本。

## 五、SQLite Schema（PRD-v2）

```
raw_conversations        原始抓取结果（id, platform, messages_json, captured_at）
clean_conversations      清洗后对话（id, raw_id, messages_json）
knowledge_cards          知识卡片（id, raw_id, clean_id, title, card_type, topic,
                           insights_json, outputs_json, tags_json, review_schedule_json,
                           starred, archived）
topics                   主题分类（name, type, color）
settings                 设置（key, value）
user_stats               用户统计（key, value_json）
cards_fts                FTS5 全文搜索虚拟表
```

## 六、变更历史

| 日期 | 变更 |
|------|------|
| 2026-05-15 | 项目初始化，创建 `docs/` 目录存放产品与调研文档 |
| 2026-05-18 | 创建 Demo 项目（`demo/`），`scripts/` 存放探针脚本 |
| 2026-05-18 | 克隆三个参考项目：`chat-export/`、`ctxport/`、`gemini-voyager/` |
| 2026-05-20 | 从 WorkBuddy Agent 迁移至 Claude Code，创建 `CLAUDE.md`、`.claude/` |
| 2026-05-21 | 按用户级 CLAUDE.md 规范，新建 `Guidance/` 目录，合并文件层级与系统架构文档 |
| 2026-05-21 | 新建 `docs/inspire.md`，记录产品思路拓展方法与框架 |
| 2026-05-22 | 新建 `docs/inspire_result.md`，4个Agent并行产出5个方向的完整产品方案 |
| 2026-05-23 | Prompt 全量精细化重构：10 个意图 prompt 重写（角色设定+逐字段 JSON 描述+叙事规则+多示例），统一添加 `{{conversation}}` 占位符 |
| 2026-05-23 | `card_type` 中文化：TypeScript `CardType` 类型值从英文 key 改为中文，同步更新 classifier 路由表和全部 prompt |
| 2026-05-23 | `card-design-spec.md` 重写：10 个意图全部使用中文值，叙事长度约束表对齐，删除 `review_material` 引用 |
| 2026-05-24 | topic-split 输入从纯 User 序列改为完整对话对（Turn pairs），数据清洗 spec 输出 B 同步更新，同步修改 architecture.md 文件层级说明 |
| 2026-05-24 | content-creation / text-processing 移除 full_output 字段，改为在 narrative 中要求输出"产出内容概览" |
| 2026-05-25 | 侧边栏视觉优化：Logo 放大（56×56 + Wordmark 32px）、emoji 替换为 Material Symbols 字体图标、底部用户与设置按钮同行排列。新增 `Logo.tsx` 组件 |
