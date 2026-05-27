# LLM 网页对话抓取方案调研

调研日期：2026-05-15

## 1. 结论先行

目前国内外主流 LLM 对话抓取方案主要分为四类：

1. 官方数据导出：可靠合规，但通常是全量、异步、不可单会话即时沉淀。
2. 网页 DOM 抓取：易上手，但最容易被 Shadow DOM、虚拟列表、DOM 改版打崩。
3. 浏览器登录态下调用内部接口：最干净、最完整，能天然拿到角色、顺序、分页和标题，但接口未公开，存在变更风险。
4. 剪贴板/编辑态/分享页等 UI 旁路：适合平台兜底，能保留格式，但自动化稳定性和用户打扰较大。

对本产品，推荐优先级是：

**平台内部接口读取 > 平台稳定语义选择器 > 通用 Shadow DOM 深遍历兜底 > OCR/截图兜底。**

豆包 MVP 尤其建议先验证内部接口读取。`ctxport` 的豆包插件已经证明：可在浏览器登录态下，通过会话 ID 调用豆包内部接口分页获取消息，再按 `index_in_conv` 排序、按 `user_type` 判定角色。这比纯 DOM 抓取稳定得多。

## 2. 官方导出能力现状

ChatGPT 官方支持从设置中的 Data Controls 发起数据导出，下载包内通常包含对话数据，但它偏“账号全量导出”，不适合当前页面一键沉淀。OpenAI 官方帮助文档说明导出入口在 Settings / Data Controls，并通过邮件发送下载链接。

Claude 官方支持导出账号数据，Anthropic 帮助中心明确数据导出包含 conversation data 和用户账号数据。它同样更偏“数据权利/备份”，不是即时单会话抓取。

Gemini 官方隐私中心说明 Gemini Apps 会收集用户对话、共享内容、反馈等，并可以导出信息。实际用户侧通常通过 Google Takeout 或活动数据处理，粒度和可读性不稳定，不适合做轻量沉淀主路径。

结论：官方导出适合作为“导入历史大包”的补充功能，不适合 MVP 的“一键抓当前会话”。

## 3. 开源项目样本

### 3.1 ChatGPT Exporter

`pionxzh/chatgpt-exporter` 是高 star 的 ChatGPT 导出 userscript/扩展，支持 Markdown、HTML、JSON、ZIP 等格式，也支持从 OpenAI 官方 `conversations.json` 导入再转换。它说明市场对“对话可携带、可导出”已有长期需求。

启示：导出格式要标准化，Markdown/JSON 是刚需；但单平台脚本长期需要跟随平台改版维护。

### 3.2 chat-export

`Trifall/chat-export` 支持 ChatGPT、Claude、Gemini AI Studio 导出为 Markdown、XML、JSON、HTML。

代码层面，它对 ChatGPT 使用 `data-testid^="conversation-turn-"`、`data-message-author-role` 等页面属性，逐 turn 滚动并提取内容；对 Gemini AI Studio 则会对每个 turn 先滚动到底部再滚回顶部，必要时进入编辑态读取 textarea 的 `data-value`；对 Claude 会优先点击消息复制按钮读取剪贴板，再回退 DOM 文本抽取。

启示：成熟扩展不是只做 `innerText`，而是混合使用语义选择器、局部滚动、复制按钮、编辑态和格式化清洗。但它仍明显依赖平台 DOM 标识。

### 3.3 CtxPort

`nicepkg/ctxport` 是更接近本需求的多平台“AI conversation to Context Bundle”项目，支持 ChatGPT、Claude、Gemini、DeepSeek、Grok、Doubao、GitHub 等。

最重要发现是它的豆包插件不是纯 DOM 抓取，而是：

- 从 URL 提取 `/chat/{conversationId}`
- 调用豆包 `/im/conversation/info` 获取标题
- 调用 `/im/chain/single` 按 `anchor_index`、`limit` 分页拉取消息
- 使用 `credentials: "include"` 复用浏览器登录态
- 通过 `index_in_conv` 排序
- 通过 `user_type === 1` 判定用户，其余为助手
- 从 `content_block.text_block.text` 或 JSON 字符串 `content.text` 提取文本

这对豆包 MVP 是当前最有价值的参考路线。

CtxPort 对 ChatGPT 也采用内部 API 思路：先请求 `/api/auth/session` 获取 access token，再请求 `/backend-api/conversation/{conversationId}`，解析 conversation mapping 并过滤 system、thoughts、redacted、reasoning 等隐藏或非正式内容。

DeepSeek 插件则从 localStorage 取 token，调用 `/api/v0/chat/history_messages` 获取历史消息，并明确跳过 `thinking_content`。

启示：只要能合法复用用户登录态，内部接口读取通常比 DOM 读取得到更干净的数据结构，也更利于分页完整性。

### 3.4 Gemini Voyager

`gemini-voyager` 是 Gemini 增强扩展，提供导出、时间线、文件夹等能力。其 ContextCapture 代码采用 adapter 的 user/assistant 选择器配对，处理表格转 Markdown、图片转 base64、背景 fetch、页面上下文 fetch 等。

启示：富文本、图片、表格、代码块会显著增加清洗复杂度。MVP 可先支持纯文本和代码块，图片附件作为 P1。

### 3.5 ChatCollector / YourAIScroll 等商业扩展

公开页面显示 ChatCollector 支持 15+ AI 平台导出到 Markdown 或 Notion，并强调本地运行、隐私优先和可选 AI 总结。CtxPort 也强调 zero upload、本地处理、结构化 Markdown。

启示：市场上已有“导出器”，但本需求的差异点应是“沉淀知识库”而不是“下载聊天记录”：自动提炼、去冗余、标签化、复盘检索才是核心壁垒。

## 4. Shadow DOM 与浏览器扩展现实限制

Chrome 官方文档说明 content script 可以通过标准 DOM 读取和修改网页内容，但运行在 isolated world，与页面 JS 环境隔离。若要访问页面 JS 变量、hook fetch/XHR，通常需要注入 MAIN world 脚本，再通过 DOM event 或 `postMessage` 和 content script 通信。

MDN 说明 `Element.shadowRoot` 只能访问 open shadow root；如果 shadow root 是 closed，`shadowRoot` 返回 `null`。Playwright 文档也说明其 locators 默认可穿透 Shadow DOM，但不支持 closed shadow roots。

因此“递归穿透 Shadow DOM”只能覆盖 open shadow root。closed shadow root、canvas 渲染、跨域 iframe、虚拟列表未加载内容，仍需要其他路径：

- 内部 API
- 页面主世界 hook fetch/XHR
- 用户触发分享/复制
- 滚动加载后再抓 DOM
- OCR/截图作为极低优先级兜底

## 5. 抓取策略对比

| 策略 | 优点 | 缺点 | 适用 |
|---|---|---|---|
| 官方导出 | 合规、完整、历史全量 | 异步、全量、不可单会话即时 | 历史导入 |
| 内部接口读取 | 结构化、角色清晰、分页完整 | 未公开，接口可能变 | MVP 主路径，尤其豆包 |
| DOM 语义选择器 | 开发快，可保留页面渲染格式 | 易受改版影响 | 平台插件 |
| Shadow DOM 深遍历 | 跨平台兜底，少依赖 class | 垃圾文本多，角色难判 | fallback |
| MutationObserver | 适合按钮注入、等待页面渲染 | 不解决数据完整性 | 扩展交互层 |
| 编辑态/复制按钮 | 格式保真，适合 Claude/Gemini | 打扰页面，可能需权限 | 兜底 |
| 网络 hook | 可发现接口和响应结构 | 实现复杂，隐私风险更高 | 调研/高级插件 |

## 6. 推荐架构

### 6.1 浏览器扩展为主

MVP 建议采用 Chrome/Edge 扩展：

- content script：注入按钮、读取 DOM、触发抓取
- main world injected script：必要时 hook fetch/XHR 或访问页面 JS 上下文
- background/service worker：跨域 fetch、持久化协调、模型调用代理
- side panel/options page：知识库检索和设置
- IndexedDB：本地存储原始对话、清洗结果、总结卡片、标签

### 6.2 Provider 插件层

每个平台实现一个 Provider：

```ts
interface ChatProvider {
  id: string;
  match(url: string): boolean;
  extractCurrent(): Promise<RawConversation>;
  fetchById?(id: string): Promise<RawConversation>;
  injectButton?(): void;
}
```

豆包 Provider 优先实现 API 读取：

1. 从 URL 获取 conversationId。
2. 请求标题接口。
3. 分页请求 chain 消息。
4. 排序、去空、合并连续同角色消息。
5. 跳过思考过程、工具过程、不可见/撤回消息。

通用 Provider 作为兜底：

1. 自动寻找主滚动容器。
2. 顶部滚动直到高度/消息数稳定。
3. 底部滚动直到高度/消息数稳定。
4. 递归遍历 document、iframe、open shadowRoot。
5. 以 block 元素为单位收集候选文本，而不是逐 textNode 直接输出。
6. 依据位置、宽度、文本长度、相邻顺序、提问特征、回答特征做角色判定。

## 7. 清洗与结构化规则

清洗层应独立于抓取层：

- 短文本过滤：剔除 1-5 字按钮、菜单、图标标签
- 黑名单关键词：新建对话、历史记录、分享、复制、重新生成、展开思考、停止生成、登录、升级、会员等
- 正式内容过滤：默认不保留 thinking/reasoning/tool/debug 内容，除非用户显式开启
- 去重：使用 normalized text hash，避免同一消息被多个节点重复抓取
- 段落合并：同一 role 连续碎片合并；保留代码块、列表和表格
- 顺序恢复：优先用接口 index；DOM 兜底用 `getBoundingClientRect().top + scrollY`
- 输出标准：

```json
[
  { "role": "user", "content": "用户完整问题" },
  { "role": "assistant", "content": "AI 完整回答" }
]
```

## 8. 知识库沉淀模板

每次抓取后，建议保存三层数据：

1. Raw：原始接口响应或 DOM 抓取结果，便于调试
2. Clean：纯净问答数组，便于复处理
3. KnowledgeCard：AI 总结后的知识卡片

知识卡片字段：

```json
{
  "title": "对话主题",
  "original_question": "自身原始疑惑",
  "insights": ["学习收获与见解"],
  "outputs": ["可复用落地产出"],
  "tags": ["标签"],
  "source": {
    "platform": "doubao",
    "url": "https://www.doubao.com/chat/xxx",
    "captured_at": "ISO datetime"
  }
}
```

## 9. MVP 开发路线

### 第 1 阶段：豆包抓取验证

- 建扩展骨架
- 注入“一键沉淀”按钮
- 实现豆包 API 抓取
- 保存 raw/clean JSON
- 做 20 条真实会话测试：短对话、长对话、多轮问答、含代码、含思考、含搜索来源

### 第 2 阶段：清洗与总结

- 实现清洗 pipeline
- 接入总结模型
- 输出知识卡片
- 本地 IndexedDB 保存
- 支持 Markdown 导出

### 第 3 阶段：知识库页面

- 列表、搜索、标签筛选
- 详情页显示原始对话与总结
- 支持重新总结、删除、导出

### 第 4 阶段：多平台扩展

优先顺序建议：

1. DeepSeek：内部接口相对清晰
2. ChatGPT：内部 API 可获取完整 mapping，但 token/权限更敏感
3. Gemini：可参考 runtime token + batchexecute 或编辑态兜底
4. Claude：复制按钮/DOM/官方导出组合
5. Kimi、通义：先抓包确认是否有稳定会话 API，再决定

## 10. 风险与合规边界

- 只抓取用户自己登录后可见的对话。
- 默认本地处理，不上传原文到第三方，除非用户主动配置总结模型。
- 明确提示：内部接口是非官方接口，平台改版可能失效。
- 不绕过登录、不突破 closed shadow root、不采集他人共享链接以外的私有内容。
- 扩展权限最小化：仅申请目标平台 host permissions。
- 对敏感对话提供“本地不总结/不入库/仅导出”选项。

## 11. 参考来源

- OpenAI Help Center: How do I export my ChatGPT history and data? https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data
- Anthropic Help Center: How can I export my Claude data? https://support.anthropic.com/en/articles/9450526-how-can-i-export-my-claude-data
- Google Gemini Apps Privacy Hub: https://support.google.com/gemini/answer/13594961
- Chrome Developers: Content scripts https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome Developers: chrome.scripting ExecutionWorld https://developer.chrome.com/docs/extensions/reference/scripting/
- MDN: Element.shadowRoot https://developer.mozilla.org/docs/Web/API/Element/shadowRoot
- Playwright: Locators in Shadow DOM https://playwright.dev/docs/locators
- GitHub: pionxzh/chatgpt-exporter https://github.com/pionxzh/chatgpt-exporter
- GitHub: Trifall/chat-export https://github.com/Trifall/chat-export
- GitHub: nicepkg/ctxport https://github.com/nicepkg/ctxport
- CtxPort product page https://ctxport.xiaominglab.com/
- GitHub: Nagi-ovo/gemini-voyager https://github.com/Nagi-ovo/gemini-voyager
- Gemini Voyager export guide https://voyager.nagi.fun/en/guide/export
- ChatCollector product page https://www.chatcollector.com/

