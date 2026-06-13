# 可复用的解决范式

> 从实际开发中抽象出的可复用模式。避免重复踩坑。

---

## P-010 — 局部状态覆写模式

**场景：** React 子组件在父组件函数体内定义，需要更新 UI 但调用父 setter 会导致重渲染 → remount → local state 丢失。

**错误做法：** 子组件 handler 中调用 `setCards(prev => ...)` → 父重渲染 → React 为内联组件创建新引用 → remount → `menuCardId` 归 null

**正确做法：** 子组件维护覆写层（`starOverrides` Record + `hiddenIds` Set），渲染优先读覆写值，操作更新覆写 + fire-and-forget API，不调用父 setter。

**核心原则：**
1. 子组件本地 UI 状态不依赖父组件 setter
2. 乐观更新通过本地覆写层实现，API 失败时回滚
3. `visibleCards` = props 数据 filter 覆写，不从父 setter 中 splice
4. 父 `setCards` 仅用于：首次加载、外部数据变更（如首页 vs 收藏页切换）

---

## P-001 — Prompt 文件提取策略

从 markdown 提取要发送给 LLM 的 system prompt。**提取范围: `## 角色设定` → `## 示例输出`（不含）**，含角色设定、输出格式、约束、few-shot 示例。

降级链：角色设定→示例输出 → `## System Prompt` → 下一 `##` → 第一个代码块 → 整个文件。

**关键教训**（P-008）：few-shot 示例必须放在 `## 示例输出` **之前**的节中，否则会被 `extract_prompt_block` 丢弃。

---

## P-002 — 数组 filter 后保留原始索引

`filter().map((m, i) => ...)` 中 `i` 是过滤后索引。需用 `for` 循环保留真实位置。

---

## P-003 — LLM JSON 返回字段名兼容

同一 prompt 的不同调用返回不同字段名（`start` vs `start_idx` vs `start_message`）。使用 `??` 链式 fallback 兼容所有变体。

---

## P-004 — 话题块消息切片 extend 策略

LLM 返回的话题切分只有 user 消息的 1-based 索引，需：1) 映射为 messages 数组真实索引；2) extend 到下一个话题块起点之前。

---

## P-005 — 语义去重（切分+去重双引擎）

话题切分不可靠（LLM 易把"不同讨论角度"当"话题转变"），必须搭配去重引擎：
- 核心：original_question Jaccard >= 0.7 + 标题相似度 >= 0.3
- 辅助：标题 Jaccard >= 0.6 + 问题相似度 >= 0.3
- 兜底：标题包含 + 问题包含；narrative 重度重叠 >= 0.65

---

## P-006 — topic 与 tags 不冗余设计

当两个字段语义重叠时，保留更灵活的（tags 支持层级+多值），删除冗余的（topic 是单一扁平字符串）。

---

## P-007 — 分类决策树 Prompt 设计

需要 LLM 归入 N 个类别时：按优先级 1→N 逐条匹配，每条 1 行 + 关键词。总长 ~110 行以内。兜底规则明确"犹豫时选 X"。

---

## P-008 — Prompt few-shot 示例必须在提取范围内

`extract_prompt_block` 提取到 `## 示例输出` 为止。few-shot 放在 `## 示例输出` 之后 = 白写 = LLM 收不到。

**正确布局：** `## 角色设定` → `## 典型范例`（few-shot）→ `## 输出格式` → `## 示例输出`

---

## P-009 — LLM 分类输出多语言兼容（双语 key 匹配）

LLM 可能自作主张输出中文而非要求的英文 key。代码须两步匹配：先英文 key → 再中文反向查找 → 兜底值。规范化后统一用英文 key 做下游路由。
