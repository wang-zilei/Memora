# Memora

Memora（微忆）是一款浏览器插件 + 桌面客户端结合的 AI 知识沉淀工具。它可以抓取主流 LLM 网页版对话，在本地客户端中完成清洗、话题切分、意图路由和知识卡片生成。

## Project Structure

```text
app/web/      # Tauri 客户端前端
extension/    # 浏览器扩展
src-tauri/    # Tauri/Rust 本地客户端与 HTTP API
docs/         # 产品与技术文档
Guidance/     # 协作记录、架构与发布约定
assets/       # 品牌与通用图形资产
scripts/      # 辅助脚本
```

`demo/` 仅用于早期本地实验，不作为正式源码或 release 输入提交。

## Release Packages

当前正式发布先提供 Windows GitHub Release zip：

```text
Memora-windows.zip
```

用户下载 zip，解压后第一层直接包含：

```text
plugin/
client/
```

`plugin/` 是浏览器扩展目录，`client/` 是 Windows 桌面客户端。macOS 包暂时跳过，详细约定见 `Guidance/RELEASE-DISTRIBUTION.md`。
