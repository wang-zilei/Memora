# Memora Release Distribution

> 用户下载安装逻辑与 GitHub Release 资产结构约定。

## Release 资产

当前正式发布先在 GitHub Releases 中提供 Windows zip：

| 文件 | 目标用户 |
|------|----------|
| `Memora-windows.zip` | Windows 用户 |

macOS 包暂时跳过，恢复时再补 `Memora-mac.zip`。不要让用户分别下载插件和客户端。用户只下载一个 zip，解压后即可看到插件和客户端两个主文件夹。

## Zip 顶层结构

zip 保持稳定顶层结构。用户解压 zip 后，第一层直接看到 `plugin/` 和 `client/` 两个主文件夹：

```text
plugin/
client/
```

### `plugin/`

放浏览器扩展的已解压目录，用户在支持扩展的浏览器中加载该目录。

要求：

- 包含 `manifest.json`、content/background/popup 等扩展运行文件。
- 不包含开发缓存、测试数据、源码无关文件。
- 面向当前支持平台：豆包、元宝、DeepSeek、Kimi、Qwen、ChatGPT、Gemini。

### `client/`

放对应平台的桌面客户端安装或运行文件。

Windows:

- 优先放安装包或可直接运行的客户端文件。
- 文件名带平台和版本，例如 `Memora-windows-x.y.z.exe` 或安装器产物。

macOS 暂时不发布安装包。

## 用户安装流程

1. 在 GitHub Releases 下载 Windows zip。
2. 解压 zip。
3. 打开 `client/`，安装或启动 Memora 客户端。
4. 打开支持扩展的浏览器，进入扩展管理页面。
5. 开启开发者模式，选择加载已解压扩展，指向 `plugin/` 文件夹。
6. 在支持的 LLM 网页对话中点击悬浮球抓取，回到客户端查看知识卡片。

## 发布注意事项

- 当前只发布 Windows zip；恢复 macOS 后，Windows 和 macOS 分开发布 zip，不混放平台二进制。
- zip 内 `plugin/` 与 `client/` 两个主文件夹必须稳定。
- 不把 `.env`、本地数据库、测试 capture JSON、开发缓存、`node_modules` 打进 release。
- 客户端和插件必须来自同一次版本构建，避免 API 字段或支持平台说明不一致。
