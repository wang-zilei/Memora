# 当前架构 -- Memora

## 文件层级
```
llm-chat-knowledge-base/
├── CLAUDE.md                    # 项目规则与文档索引
├── docs/                        # 产品/技术文档
│   ├── PRD-v2.md                # 产品需求文档
│   ├── prompts/                 # 意图识别 Prompt 模板
│   └── 项目简报.md               # 给人看的项目总结
├── Guidance/                    # 项目管理文档
│   ├── knowledge/                # Bug修复 + 可复用范式 (E-xxx/P-xxx)
├── assets/                      # 品牌资产
│   ├── newlogo.png              # 原始 PNG logo (1254×1254, 含白底+四角框)
│   ├── newlogo.svg              # 原始 SVG logo (1254×1254)
│   ├── newlogo-cropped.svg      # 裁剪版 SVG (829×829 viewBox, 仅核心图形, 无白底)
│   └── icons/                   # 生成的各尺寸 PNG/ICO 图标
├── demo/                        # Demo 代码
│   ├── server/                  # Express 后端 (JSON存储)
│   ├── web/                     # React + Vite + TypeScript 前端
│   │   └── src/
│   │       ├── api.ts           # API适配层 (HTTP/Tauri双模式)
│   │       ├── types.ts         # 类型定义 (对齐PRD-v2)
│   │       ├── App.tsx          # 页面组件
│   │       ├── Logo.tsx         # Logo 组件 (引用 newlogo-cropped.svg)
│   │       ├── index.css        # 全局样式
│   │       └── assets/          # 前端静态资源 (含 newlogo-cropped.svg)
│   └── extension/               # Chrome 扩展 MV3
│       ├── icons/                # 扩展图标 (16/48/128, 透明底黑色羽毛)
├── scripts/                     # 工具脚本
│   └── convert-icon.cjs         # SVG→PNG/ICO 图标生成 (含白底+圆角)
├── src-tauri/                   # Tauri 2.0 桌面应用
│   ├── src/main.rs              # Rust后端 (axum + SQLite + AI Pipeline)
│   ├── db/schema.sql            # 6表 + FTS5全文搜索
│   ├── icons/                   # 桌面/窗口图标 (由 convert-icon.cjs 生成)
│   └── prompts/                 # Prompt副本 (打包发布用)
```

## 技术栈
| 层级 | 技术 | 为什么选它 |
|------|------|-----------|
| 前端 | React + Vite + TypeScript | 组件化UI，快速开发，Tauri WebView最佳搭配 |
| 后端 | Rust + axum | Tauri原生支持，高性能，与前端同进程 |
| 数据库 | SQLite (sqlx) | 嵌入式、零配置、用户数据私有 |
| AI | OpenAI 兼容 API | 用户自带Key，不依赖特定厂商 |
| 扩展 | Chrome Extension MV3 | 跨平台浏览器插件标准 |
| 通信 | HTTP localhost:17321 | Tauri HTTP mode，前端fetch直接通信 |

## 系统架构图
```
用户浏览器
  |-- LLM网页 (豆包/ChatGPT/...)
  |-- Chrome扩展 (悬浮球 + 9平台自动检测)
        |  HTTP POST /api/capture
        v
Tauri 2.0 桌面应用 (Memora)
  |-- React前端 (知识库UI/设置/导出)
  |-- Rust后端 (axum HTTP + AI Pipeline + SQLite)
        |
        v
SQLite (%APPDATA%/com.memora.app/knowledge_base.db)
  6表: raw -> clean -> knowledge_cards + settings + user_stats + cards_fts
```

## 数据流
```
扩展抓取 -> HTTP POST /api/capture (17321)
  -> Rust: clean_conversation() 4步清洗
    -> raw_conversations 表 (原始)
    -> clean_conversations 表 (清洗后)
    -> run_ai_pipeline() 4步流水线
      -> 话题切分 -> 意图分类 -> 卡片生成 -> 去重
        -> knowledge_cards 表 (卡片)
```
