# Memora Release Distribution

> 用户下载安装逻辑与 GitHub Release 资产结构约定。

## Release 资产

每次正式发布在 GitHub Releases 中提供两个 zip：

| 文件 | 目标用户 |
|------|----------|
| `Memora-windows.zip` | Windows 用户 |
| `Memora-mac.zip` | macOS 用户 |

不要让用户分别下载插件和客户端。用户只下载一个 zip，解压后即可看到插件和客户端两个主文件夹。

## Zip 顶层结构

两个平台的 zip 都保持相同顶层结构：

```text
Memora-<platform>/
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

macOS:

- 优先放 `.app`、`.dmg` 或平台约定的安装产物。
- 文件名带平台和版本，例如 `Memora-mac-x.y.z.dmg`。

## 用户安装流程

1. 在 GitHub Releases 下载自己系统对应的 zip。
2. 解压 zip。
3. 打开 `client/`，安装或启动 Memora 客户端。
4. 打开支持扩展的浏览器，进入扩展管理页面。
5. 开启开发者模式，选择加载已解压扩展，指向 `plugin/` 文件夹。
6. 在支持的 LLM 网页对话中点击悬浮球抓取，回到客户端查看知识卡片。

## 发布注意事项

- Windows 和 macOS 分开发布 zip，不混放平台二进制。
- zip 内顶层目录命名、`plugin/` 与 `client/` 两个主文件夹必须稳定。
- 不把 `.env`、本地数据库、测试 capture JSON、开发缓存、`node_modules` 打进 release。
- 客户端和插件必须来自同一次版本构建，避免 API 字段或支持平台说明不一致。
