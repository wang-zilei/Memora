# 数据清洗模块规范

**职责：** 接收扩展抓取的原始对话，清洗为纯文本问答序列（带索引），供下游话题切分模块使用。

---

## 输入格式

来自浏览器扩展的 `RawConversation`：

```json
{
  "platform": "doubao",
  "conversationId": "xxx",
  "title": "对话标题",
  "url": "https://...",
  "messages": [
    { "role": "user", "content": "原始内容（可能含HTML/Markdown/图片等）" },
    { "role": "assistant", "content": "原始内容" },
    ...
  ],
  "capturedAt": "2026-05-23T..."
}
```

---

## 清洗规则

### 1. 过滤
- 只保留 `role: "user"` 和 `role: "assistant"` 的消息
- 过滤 `system`、`tool`、`error` 等类型的消息
- 过滤内容为空或仅含空白字符的消息

### 2. 内容清洗
- 移除 HTML 标签（如 `<div>`, `<span>`, `<br>` 等）
- 保留 Markdown 代码块（`` ```...``` ``）和行内代码（`` `...` ``）
- 移除图片标签 `<img>`，保留 `alt` 文本（如有）
- 保留 LaTeX 公式标记（如 `$$...$$`, `$...$`）
- 将 `&nbsp;`, `&amp;` 等 HTML 实体还原为普通字符

### 3. 索引
- **user 消息**：按出现顺序从 1 开始连续编号 `User[1], User[2], ...`
- **assistant 消息**：按出现顺序从 1 开始连续编号 `Assistant[1], Assistant[2], ...`
- user 和 assistant 独立编号，用于输出 B 时按 Turn 索引配对；同一轮次的 user 和 assistant 共享同一个 index

### 4. 去噪
- 移除平台自带的 UI 文本（如"正在思考中..."、"已复制到剪贴板"等）
- 合并同一 role 的连续重复消息（如用户分 3 次发送的空格/换行）

---

## 输出格式

### 输出 A：清洗后的完整消息列表（供话题切分后提取对话块使用）

```json
{
  "raw_id": "原始conversationId",
  "platform": "doubao",
  "url": "https://...",
  "clean_messages": [
    { "index": 1, "role": "user", "content": "清洗后的纯文本" },
    { "index": 1, "role": "assistant", "content": "清洗后的纯文本" },
    { "index": 2, "role": "user", "content": "..." },
    { "index": 2, "role": "assistant", "content": "..." }
  ],
  "captured_at": "2026-05-23T..."
}
```

**索引说明：**
- user 和 assistant 共享同一个 idx（同一轮对话）
- 多条连续 user 追问各分配下一个连续 idx，不做子索引
- assistant 与触发它的 user 消息共享 idx

### 输出 B：完整对话对序列（直接输入 topic-split 模块）

```
Turn[1]:
  User: Python的GIL是什么？
  Assistant: GIL（全局解释器锁）是 CPython 中的一个互斥锁...
Turn[2]:
  User: 那多线程爬虫应该用什么方案？
  Assistant: 对于爬虫场景，推荐使用 asyncio + aiohttp...
Turn[3]:
  User: 换个话题，帮我写一篇产品介绍
  Assistant: 以下是一份产品介绍的大纲：...
```

**格式说明：**
- 每条 Turn 代表一轮完整的 User + Assistant 对话对
- Turn 索引与 `clean_messages` 中的 `index` 一一对应
- 话题切分模块需要同时看 User 的问题和 Assistant 的回答，才能准确判断话题转折

---

## 平台去噪关键词表

各平台需要过滤的系统消息：

| 平台 | 过滤关键词/模式 |
|------|----------------|
| 豆包 | "正在思考中"、"已停止生成"、"重新生成" |
| ChatGPT | "Regenerate response"、"Continue" |
| Claude | "Claude is thinking..." |
| Gemini | "Generating..."、"Regenerate" |
| Kimi | "正在生成"、"重新回答" |
| DeepSeek | "正在思考"、"深度思考模式" |
| 通义千问 | "思考中"、"深度思考" |
| MiniMax | "生成中" |
| 腾讯元宝 | "思考中" |

---

## 与下游模块的接口

```
数据清洗模块
    │
    ├── 输出A: clean_messages → 存入 raw_conversations 表
    │
    └── 输出B: 完整对话对序列（Turn pairs） → 输入 topic-split 模块
                    │
                    │ 结合 User + Assistant 内容判断话题转折
                    │ 输出话题块索引 → 从 clean_messages 提取话题块对话
                              │
                              └── 输入 classifier → 意图判断
                                        │
                                        └── 输入专用 Prompt → 卡片生成
```
