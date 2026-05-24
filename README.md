# LLM Chat Knowledge Base

本目录用于开发“LLM 对话自动沉淀知识库工具”。

## 当前产物

- `docs/product-requirements.md`：根据已有对话整理出的产品需求简报
- `docs/chat-capture-research.md`：国内外主流 LLM 网页对话抓取方案调研
- `chat-export/`：参考项目，ChatGPT / Claude / Gemini 导出扩展
- `ctxport/`：参考项目，多平台对话复制/导出，包含豆包、DeepSeek、Gemini 等插件思路
- `gemini-voyager/`：参考项目，Gemini 增强与导出扩展

## 推荐技术方向

MVP 优先做浏览器扩展。豆包端优先尝试“登录态内部接口分页读取”，同时保留 DOM/Shadow DOM 通用抽取作为兜底。

