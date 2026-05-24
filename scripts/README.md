# Console Capture Scripts

这些脚本用于在各平台网页对话页的 DevTools Console 中验证抓取可行性。每个脚本都是自包含文件，直接整段复制执行即可。

## 已验证

| 平台 | 脚本 | 结果变量 | 策略 |
| --- | --- | --- | --- |
| 豆包 | `doubao-console-capture.js` | `window.doubaoCaptureResult` | 登录态内部接口 |

## 新增待实测

| 平台 | 脚本 | 结果变量 | 策略 |
| --- | --- | --- | --- |
| Kimi | `kimi-console-capture.js` | `window.kimiCaptureResult` | 可见 DOM + open Shadow DOM |
| 腾讯元宝 | `yuanbao-console-capture.js` | `window.yuanbaoCaptureResult` | 可见 DOM + open Shadow DOM |
| Qwen / 通义千问 | `qwen-console-capture.js` | `window.qwenCaptureResult` | 可见 DOM + open Shadow DOM |
| DeepSeek | `deepseek-console-capture.js` | `window.deepseekCaptureResult` | 登录态内部接口 |
| MiniMax / 海螺 | `minimax-console-capture.js` | `window.minimaxCaptureResult` | 可见 DOM + open Shadow DOM |
| ChatGPT | `chatgpt-console-capture.js` | `window.chatgptCaptureResult` | 登录态内部接口 |
| Gemini | `gemini-console-capture.js` | `window.geminiCaptureResult` | batchexecute 接口，失败后回退 DOM |
| Claude Code / Claude | `claudecode-console-capture.js` | `window.claudecodeCaptureResult` | Claude 登录态内部接口 |

## 使用方式

1. 打开对应平台的某个对话页面。
2. 打开浏览器 DevTools Console。
3. 复制对应脚本的全部内容并执行。
4. 在 Console 输入结果变量，例如：

```js
window.chatgptCaptureResult
```

5. 复制漂亮 JSON：

```js
copy(JSON.stringify(window.chatgptCaptureResult, null, 2))
```

## 注意

- 内部接口脚本通常能拿到更完整、更干净的数据，但依赖平台未公开接口，平台改版可能失效。
- DOM 脚本更通用，但只能读取页面已加载的可见 DOM 和 open Shadow DOM；如果平台使用虚拟列表，可能需要先手动滚动加载历史内容。
- `claudecode-console-capture.js` 面向 `claude.ai` 网页会话。Claude Code CLI 的本地终端会话不在网页页面上下文里，不能用浏览器 Console 脚本直接抓取。

