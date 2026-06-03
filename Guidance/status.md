# 项目状态 -- Memora

## 1. 当前阶段
客户端 UI 视觉重设计 [进行中]
> Ins 简洁高级风，仅改视觉层，不动 Rust 后端/SQLite/AI Pipeline/API

## 2. 进行中
- Tauri 客户端人工验收
- 验收通过后的 git 提交、release 编译与分发打包

## 3. 待解决
- [x] UI/UX 逻辑审计与视觉施工计划
- [x] 列表页 ins minimal 视觉迁移
- [x] 详情页、收藏页、统计页、设置页同风格适配
- [x] `npm run build` 通过
- [ ] Tauri 客户端人工验收
- [ ] 中文输入法在 TipTap 中的兼容问题 (E-028)
- [ ] ins minimal 风格在不同分辨率下的适配

## 4. 当前约束
- 不修改 Rust 后端、SQLite schema、AI Pipeline、prompt、扩展抓取逻辑
- 不修改 `api.ts` HTTP/Tauri 适配、API 路由、字段含义、页面状态语义
- 不替换现有图标资产和图标含义
- 设计方向：ins 简洁高级风，参考 `design/ins-minimal-prototype/`。不采用暗黑系，不采用便签折角和多色卡片

## 5. 最近完成
- 05-27: 插件发布前收口 (manifest 权限 + popup 文案 + 平台收口)
- 05-27: Release 分发结构约定 (Windows/macOS zip + plugin/client 结构)
- 05-27: 列表页抓取后刷新修复 (刷新按钮 + 6秒静默刷新)
- 05-27: 桌面图标黑边修复 (安全 viewBox + 透明底板)
- 05-27: 富文本编辑集成完成 (TipTap B/I/U/高亮 + 800ms防抖保存)
