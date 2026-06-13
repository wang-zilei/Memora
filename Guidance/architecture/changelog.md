<!-- idx: 图标分辨率修复 | Logo SVG化 | 前端分页重构 | 工作区清理 | 数据库迁移+富文本 -->

# 架构变更历史

> 用自然语言记录每次重要的架构变化。

## 2026-06-04 -- 图标分辨率修复 + 运行时窗口图标 + 扩展图标统一

**改了什么**:
- `scripts/convert-icon.cjs`：ICO 尺寸从 4 档 `[32,64,128,256]` 扩展到 8 档 `[16,24,32,48,64,96,128,256]`；Tauri PNG 增加 `64x64.png`
- `src-tauri/Cargo.toml`：tauri 依赖加 `image-png` feature
- `src-tauri/src/main.rs`：setup 闭包中 `include_bytes!("../icons/128x128@2x.png")` + `window.set_icon()`
- `src-tauri/tauri.conf.json`：`bundle.icon` 增加 `icons/64x64.png`
- `demo/extension/icons/icon{16,48,128}.png`：从绿色背景图标替换为透明底黑色羽毛（来源 `newlogo-cropped.svg`）

**为什么**: 任务栏图标模糊的根因有两层：①ICO 缺少 16/24/48/96 中间尺寸，Windows 高 DPI 任务栏被迫拿 32px 放大；②Tauri 运行时窗口从未调用 `set_icon()`，一直显示默认齿轮图标。扩展图标用旧绿色背景与新产品 Logo 不一致。

**影响**: `bundle.icon` 只在打包时生效的认知纠正——运行时窗口图标需 Rust 侧显式设置；`include_bytes!` 使图标零文件依赖嵌入二进制；ICO 文件从 14KB→19KB（8 张内嵌 PNG）

## 2026-06-04 -- Logo SVG 化 + 卡片预览精确截断

**改了什么**:
- 品牌 Logo 从 PNG 改为双格式：侧边栏用裁剪版 SVG（`newlogo-cropped.svg`，透明底+仅核心图形，viewBox 829×829）；桌面图标用 SVG→PNG 渲染（白底+圆角，`flatten({ background: '#ffffff' })` + 圆角遮罩 `dest-in`）
- 新增 `assets/newlogo-cropped.svg` 和 `demo/web/src/assets/newlogo-cropped.svg`
- 所有 10 处 `.card-preview` CSS 块添加 `max-height: N_lines×line_height`，根除第 N+1 行像素外露的视觉瑕疵
- `Logo.tsx` 导入从 PNG 改 SVG

**为什么**: PNG 图标白底过大核心元素显小；SVG 透明底在侧边栏白色卡片上自然融合无需多余底板；card-preview 的 `flex: 1` 撑大容器导致行高外像素泄露

**影响**: Logo 源文件路径再次变更（`newlogo-cropped.png` → `newlogo-cropped.svg`）；`convert-icon.cjs` 的 `renderPng` 流程从一次 resize 改为 resize→flatten→mask 三步

## 2026-06-04 -- 前端分页重构 + 品牌 Logo 更换 + 卡片间距调整 + 桌面图标刷新

**改了什么**: 
- CardList 从数字分页改为无限滚动加载更多（`CARD_LIST_BATCH_SIZE=9`，距底部 <140px 自动触发 `onLoadMore`）；`currentPage` 重命名为 `cardListPage`
- 品牌 Logo 从旧羽毛 PNG 更换为新 logo（`assets/newlogo.png` → 裁剪为 `newlogo-cropped.png` 1629×1629 正方形）；侧边栏 `Logo.tsx` 导入新图；`scripts/convert-icon.cjs` 源图路径更新；`src-tauri/icons/` 下 5 个图标文件全部重生成
- 卡片行间距 `--list-row-gap: 30px → 20px`，`grid-auto-rows` 通过 CSS 变量联动重算，3 行 9 张/页布局不变

**为什么**: 分页控件在 ins minimal 风格下存在感过强；新品牌 Logo 统一三处展示（侧边栏 + 桌面图标 + 窗口边框）；卡片间隙过大压缩了内容区域

**影响**: CardList 不再接受 `totalCards`/`currentPage`/`onPageChange` props，改为 `hasMoreCards`/`loadingMore`/`onLoadMore`；`totalPages` 计算逻辑移除；Logo 源文件从 `app-logo-paper-feather-v3.png` 迁移到 `newlogo-cropped.png`

## 2026-06-03 -- 工作区清理：移除参考项目、测试文件、README

**改了什么**: 删除 3 个独立参考项目（chat-export/ ctxport/ gemini-voyager/），删除 9 个测试数据文件（test_bc*.json test_capture*.json），删除过时的 README.md；更新 CLAUDE.md 移除参考项目隔离规则；更新 architecture/overview.md 移除参考项目目录行

**为什么**: 参考项目已完成历史使命，测试文件为开发期临时数据，README 内容已过时。精简工作区聚焦产品功能

**影响**: 释放约 1.2GB 磁盘空间；CLAUDE.md 规则编号调整

## 2026-05-27 -- 数据库路径迁移 + 富文本编辑方案

**改了什么**: 数据库从 `target/debug/knowledge_base.db` 迁移到 `%APPDATA%/com.memora.app/knowledge_base.db`；详情页 narrative 和 unresolved_questions 字段支持 TipTap 富文本编辑（B/I/U/高亮）

**为什么**: `cargo clean` 会清空 target/ 导致用户数据丢失；用户需要所见即所得编辑卡片内容

**影响**: 首次启动自动迁移旧数据；前后端各加字段支持（Rust端 update_card 加2个参数，前端 TipTapEditor 组件）

## 2026-05-26 -- Tauri 1:1 复刻 Demo 数据链路 + HTTP 路由补全

**改了什么**: Rust 端新增 4 步对话清洗模块（normalize_role/clean_content/merge_consecutive/clean_conversation）；HTTP 路由从 2 条补全到 11 条；FTS 从 content 外部表改为独立表；外部链接走后端 `POST /api/open-url`

**为什么**: Tauri 缺少清洗逻辑导致数据链路全错；HTTP mode 下前端 IPC 不可用

**影响**: 数据链路从"原始消息直存"改为"先清洗后存储+传入Pipeline"

## 2026-05-25 -- 前端 UI 全面重构

**改了什么**: 侧边栏 Logo SVG + Material Symbols 导航 + 标签云；列表 narrative 摘要预览 + 意图 tint 配色；详情页 Tab 式（概览/原始对话）+ 可编辑标题 + 导出（TXT/PDF/图片）；设置页米色卡片 + 测试连接

**为什么**: 从基础功能 UI 升级为产品级界面

**影响**: App.tsx 大幅重写，index.css 新增完整设计系统

## 2026-05-24 -- 切分+去重重构 + topic 字段移除

**改了什么**: 数据库 schema、所有前后端类型、API 路由、全部 10 个 prompt 中彻底移除 topic 字段；去重从 5 条扩展到 7 条综合规则；话题切分 prompt 新增"合并优先"原则

**为什么**: topic 与 tags 语义重叠，tags 的层级格式已足够承担分类/筛选功能

**影响**: 数据模型简化，卡片重复率大幅下降

## 2026-05-23 -- 4 步 Pipeline + Prompt 全量重写

**改了什么**: 从单 Prompt 改为 4 步流水线（数据清洗 -> 话题切分 -> 意图分类 -> 卡片生成）；10 个意图各有独立 prompt；card_type 从英文 key 改为中文值

**为什么**: 单 Prompt 无法同时处理切分、分类、生成三种不同任务

**影响**: AI 输出质量和可控性大幅提升

## 2026-05-22 -- PRD-v2 产品方案确立

**改了什么**: 融合 PRD-v1 + 5 方向产品思考，确立数据模型三层架构（Raw -> Clean -> KnowledgeCard）；明确排除图片 base64、文件附件抓取、桌面客户端抓取

**为什么**: 5 个 Agent 并行深度思考后融合产出

**影响**: 产品边界确立，后续开发有明确方向
