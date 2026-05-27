# LLM 对话自动沉淀知识库 - Demo

> 快速验证产品核心逻辑的 Demo 版本，不讲究设计，只追求功能跑通。

## 🚀 快速开始

### 1. 启动后端

```bash
cd demo
npm install
npm run server
```

后端运行在 `http://localhost:17321`

### 2. 启动前端（开发模式）

```bash
cd demo/web
npm install
npm run dev
```

前端运行在 `http://localhost:5173`，自动代理 API 到后端

### 3. 安装 Chrome 扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `demo/extension` 文件夹
5. 扩展安装完成

### 4. 配置 API Key

1. 打开知识库界面 `http://localhost:5173`
2. 点击左下角「⚙️ 设置」
3. 填入你的 API Key（支持 OpenAI / DeepSeek / 智谱 GLM）
4. 选择对应模型，保存

### 5. 开始使用

1. 打开任意 LLM 对话页面（豆包/ChatGPT/DeepSeek/Claude/Gemini 等）
2. 页面右侧出现 🧠 悬浮球
3. 点击悬浮球 → 自动检测平台 → 抓取对话 → AI 总结 → 生成知识卡片
4. 回到知识库界面查看结果

## 📁 项目结构

```
demo/
├── server/               # Node.js 后端
│   ├── index.js          # Express 服务器 + API 路由
│   ├── db.js             # JSON 文件存储（替代 SQLite）
│   ├── ai.js             # AI API 调用（OpenAI 兼容格式）
│   └── capture.js        # 对话清洗和规范化
├── web/                  # React 前端
│   ├── src/
│   │   ├── App.tsx       # 主应用（含所有页面组件）
│   │   ├── api.ts        # API 客户端
│   │   ├── types.ts      # 类型定义
│   │   ├── main.tsx      # 入口
│   │   └── index.css     # 样式
│   ├── package.json
│   └── vite.config.ts    # Vite 配置（含 API 代理）
├── extension/            # Chrome 浏览器扩展
│   ├── manifest.json     # MV3 配置
│   ├── content.js        # 悬浮球 + 平台检测
│   ├── background.js     # 抓取逻辑（含9个平台脚本）
│   ├── popup.html/js     # 扩展弹窗
│   └── icons/            # 扩展图标
├── data/                 # 数据存储（自动创建）
│   └── db.json           # 所有数据
└── package.json
```

## 🎯 核心功能

### 已实现

| 功能 | 说明 |
|------|------|
| ✅ 悬浮球抓取 | 在 LLM 页面点击悬浮球，一键抓取对话 |
| ✅ 平台自动检测 | 自动识别 ChatGPT/Claude/DeepSeek/豆包/Gemini/Kimi/MiniMax/通义千问/元宝 |
| ✅ 对话清洗 | 统一为 user/assistant Q&A 格式，合并连续同角色消息 |
| ✅ AI 总结 | 调用 GPT-4.1 nano / DeepSeek V3 等模型，生成知识卡片 |
| ✅ 主题分类 | AI 自动归入主题（编程开发、产品设计、学习笔记等），用户可自定义 |
| ✅ 知识库浏览 | 按主题分类展示，支持关键词搜索 |
| ✅ 知识卡片详情 | 展示核心问题、见解、产出、标签、原始对话 |
| ✅ 原始对话链接 | 点击可回到原始 LLM 对话页面 |
| ✅ 设置页 | 配置 API Key、API 地址、模型选择 |
| ✅ 重新总结 | AI 失败或想换模型时，可重新触发总结 |
| ✅ 主题管理 | 新增/删除自定义主题 |

### 抓取策略

| 平台 | 策略 | 可靠性 |
|------|------|--------|
| ChatGPT | 内部 API (backend-api) | ⭐⭐⭐ |
| Claude | 内部 API (organizations) | ⭐⭐⭐ |
| DeepSeek | 内部 API (v0/chat) | ⭐⭐⭐ |
| 豆包 | 内部 API (/im/chain/single) | ⭐⭐⭐ |
| Gemini | DOM 兜底 | ⭐⭐ |
| Kimi | DOM + Shadow DOM | ⭐⭐ |
| MiniMax | DOM + 位置推断 | ⭐ |
| 通义千问 | DOM + 位置推断 | ⭐ |
| 元宝 | DOM + 位置推断 | ⭐ |

### 数据流

```
浏览器 LLM 页面
    ↓ 点击悬浮球
扩展自动检测平台
    ↓ 运行对应脚本
抓取对话（统一 Q&A 格式）
    ↓ HTTP POST
后端接收 + 清洗
    ↓ 保存 Raw + Clean
AI 总结（标题/问题/见解/产出/标签/主题）
    ↓ 生成知识卡片
前端知识库展示
```

## ⚙️ API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/capture | 接收扩展抓取数据 |
| GET | /api/cards | 卡片列表（支持 topic/keyword/platform 筛选） |
| GET | /api/cards/:id | 卡片详情 |
| PUT | /api/cards/:id | 更新卡片 |
| DELETE | /api/cards/:id | 删除卡片 |
| POST | /api/cards/:id/summarize | 重新 AI 总结 |
| GET | /api/topics | 主题列表 |
| POST | /api/topics | 新增主题 |
| DELETE | /api/topics/:name | 删除主题 |
| GET | /api/settings | 获取设置 |
| PUT | /api/settings | 更新设置 |
| GET | /api/status | 服务状态 |

## 🔧 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 后端 | Node.js + Express | 轻量 HTTP 服务 |
| 存储 | JSON 文件 | Demo 用，后续迁移 SQLite |
| AI 总结 | OpenAI 兼容 API | 支持 GPT/DeepSeek/GLM |
| 前端 | React + Vite + TypeScript | SPA 知识库界面 |
| 扩展 | Chrome Extension MV3 | 悬浮球 + 平台抓取 |
| 通信 | HTTP localhost:17321 | 扩展 → 后端 |

## 📌 注意事项

1. **API Key 必须自己配置**，产品不提供 Key
2. **未配置 API Key 时**：对话仍然会被抓取和保存（状态为"待总结"），配置 Key 后可重新总结
3. **Gemini/Kimi/MiniMax/千问/元宝** 使用 DOM 抓取，可靠性不如 API 抓取，页面结构变化可能导致失败
4. **悬浮球可拖动**，避免遮挡页面内容
5. Demo 使用 JSON 文件存储，数据量大了会变慢，正式版会迁移到 SQLite

## 🔄 后续迁移计划

Demo 验证完成后，计划迁移到 Tauri 2.0 架构：

- Node.js 后端 → Tauri Rust 后端
- JSON 存储 → SQLite
- 手动启动后端 → 桌面应用一键启动
- 保留 Chrome 扩展作为抓取探头
