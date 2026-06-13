# 项目状态 -- Memora

## 1. 当前阶段
客户端 UI 视觉重设计 [已收尾]
> 主体 UI 重设计已完成。剩余 2 项：悬浮球视觉重塑 + Tauri Release Build

## 2. 进行中
- 2026-06-04 悬浮球视觉重塑：方案待选（A毛玻璃/B微白底圆/C细线框），需匹配新品牌 ins 极简风
- 2026-06-04 Tauri Release Build（生成安装包 .msi）
- 本轮仅允许视觉层调整

## 3. 待解决
- [ ] 悬浮球方案选定并实施（A/B/C 三选一，在 `content.js` 中实现）
- [ ] Tauri Release Build → 生成可分发安装包
- [ ] 中文输入法在 TipTap 中的兼容问题 (E-028)

## 4. 当前约束
- 不修改 Rust 后端、SQLite schema、AI Pipeline、prompt、扩展抓取逻辑
- 不修改 `api.ts` HTTP/Tauri 适配、API 路由、字段含义、页面状态语义
- 设计方向：ins 简洁高级风，参考 `design/ins-minimal-prototype/`。不采用暗黑系，不采用便签折角和多色卡片

## 5. 最近完成
- 2026-06-04: 9 条 UI 重设计项全部完成（其他 Agent）：侧边栏滚动、全局禁止滚动、计数隐藏、搜索栏布局、serif 字体、active 提示、详情页布局、客户端验收、分页/无限滚动
- 2026-06-04: 任务栏图标修复：Rust 侧 `window.set_icon()` + `image-png` feature
- 2026-06-04: 扩展图标统一：icon16/48/128 替换为新羽毛 Logo（透明底）
- 2026-06-04: ICO 尺寸扩展：4→8 档（16/24/32/48/64/96/128/256），根除任务栏 DPI 模糊
- 2026-06-04: 品牌 Logo SVG 优化 + 卡片预览截断 + 无限滚动
