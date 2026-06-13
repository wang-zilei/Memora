# 项目简报 -- Memora

> 给人看的。5 分钟理解这个项目是什么、能做什么、做到哪了。

## 这是什么？

Memora 是一个将 LLM 对话自动沉淀为结构化知识的桌面工具。

核心理念：你在豆包、ChatGPT、Kimi 等 AI 助手里学到的东西，不应该沉在聊天记录里。Memora 抓取对话 -> AI 自动清洗、分类、总结 -> 变成可检索、可编辑、可回顾的知识卡片。

三大优势：轻量私有（数据存本地 SQLite）、AI 全自动（4 步流水线处理）、9 平台覆盖（豆包/元宝/DeepSeek/Kimi/Qwen/ChatGPT/Gemini/Claude/通义千问）。

## 现在能做什么？

- **浏览器插件自动抓取**：悬浮球一键抓取 LLM 网页对话，支持 9 个平台自动检测。用 Chrome 扩展 MV3 实现，content script 注入 + 平台 Provider 策略模式匹配 DOM。

- **AI 自动生成知识卡片**：抓取后走 4 步流水线（对话清洗 -> 话题切分 -> 意图分类 -> 卡片生成），自动识别 10 类意图（概念理解/事实查询/技能学习/操作指南/内容创作/文本处理/规划决策/头脑风暴/交互陪伴/其他），每类有专门定制的 prompt。

- **知识库浏览与检索**：卡片列表支持按意图/标签筛选 + 关键词全文搜索（SQLite FTS5），详情页分概览和原始对话两个 Tab，支持收藏和删除。

- **富文本编辑**：详情页 narrative 和 unresolved_questions 字段支持所见即所得编辑（TipTap 编辑器，B/I/U/高亮），800ms 防抖自动保存。

- **桌面客户端**：Tauri 2.0 打包，数据存 `%APPDATA%/com.memora.app/knowledge_base.db`，完全本地隐私安全。自带 HTTP 服务（localhost:17321），浏览器扩展通过 HTTP POST 通信。

- **统计面板**：总数/意图分布/平台分布/标签 TOP，可视化了解知识库构成。

## 技术骨架

- 前端：React + Vite + TypeScript，跑在 Tauri WebView 里
- 后端：Rust + axum HTTP server（localhost:17321），与前端同进程
- 数据库：SQLite（sqlx），6 张表 + FTS5 全文搜索，数据文件在用户 AppData 目录
- AI：OpenAI 兼容 API（用户自带 Key），4 步流水线（切分/分类/生成/去重），每步独立 LLM 调用
- 扩展：Chrome Extension MV3，content script + background service worker
- 分发：GitHub Releases，Windows 和 macOS 两个 zip 包

为什么选 Rust？Tauri 原生支持，不需要额外安装运行时；性能高、内存占用小；与前端通过 HTTP 通信（非 IPC），开发和调试更直观。

为什么选 SQLite？嵌入式、零配置、用户数据完全私有。`cargo clean` 不会影响用户数据（数据库在 AppData 不在 target/）。

## 当前进展

**UI 视觉重设计 [进行中]** -- ins 简洁高级风。范围严格限定：只改 CSS 和 App.tsx 视觉层，不动 Rust 后端/SQLite schema/AI Pipeline/prompt/扩展抓取逻辑。设计参考 `design/ins-minimal-prototype/`。

**刚完成的**：
- 图标分辨率全面修复（ICO 8尺寸 + 窗口 set_icon + 扩展图标统一）
- 品牌 Logo 统一更换（侧边栏 + 桌面图标 + 窗口边框三处）
- 列表分页→无限滚动加载更多
- 卡片行间距收紧（30→20px，3行9张布局不变）
- 富文本编辑集成（TipTap B/I/U/高亮 + 800ms 防抖）

## 下一步

1. 悬浮球视觉重塑（方案选定 → 实施）
2. Tauri Release Build（生成安装包 .msi）
3. UI 重设计收尾 → 验收 → 打包新版本
4. macOS 版本完整适配测试
5. 用户文档（安装指南/快速开始/常见问题）

## 关键决策

- 图片只存 URL 不存 base64 -> 存储成本和隐私考虑，URL 引用够了
- 不做文件附件抓取 -> 场景太窄，ROI 为负
- 不做桌面端抓取 -> 浏览器插件已覆盖主流 LLM 平台，桌面抓取开发和维护成本高
- 10 类意图分类 -> 覆盖 AI 对话场景的完整分类体系，card_type 用中文值（全链路一致）
- topic 和 tags 不冗余 -> tags 支持层级+多值，信息量完全覆盖 topic，删除 topic 减少维护
- AI 输出三层质检 -> Prompt 约束 + sanitizeContent 代码兜底 + 前端渲染，多层防线

---
> 最后更新: 2026-06-04 | 更新触发: 图标修复 + 扩展图标 + UPDATE 全量盘点
