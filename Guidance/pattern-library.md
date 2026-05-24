# 可复用的解决范式

> 从实际开发中抽象出的可复用模式。避免重复踩坑。

---

## P-001 — Prompt 文件提取策略

**场景：** 从 markdown 格式的 prompt 文件中提取要发送给 LLM 的 system prompt。

**错误做法：** 提取第一个 ```` ``` ```` 代码块。prompt 中第一个代码块通常是 JSON 模板，不含角色设定和约束。

**正确做法：**
1. 优先提取 `## 角色设定` 到 `## 示例输出`（不含）之间的内容 — 这包含角色设定、输出格式描述、约束规则，是 LLM 需要的完整指令
2. 降级：`## System Prompt` 到下一个 `##`（兼容旧格式）
3. 再降级：第一个 ```` ``` ```` 代码块（极旧格式）
4. 再降级：整个文件

**代码：** `extractPromptBlock()` in `demo/server/ai.js`

---

## P-002 — 数组 filter 后保留原始索引

**场景：** 从一个消息数组中过滤出特定角色的消息，同时需要保留它们在原数组中的位置索引。

**错误做法：**
```js
const userMsgs = messages.filter(m => m.role === 'user')
  .map((m, i) => ({ origIdx: i, content: m.content }));
// i 是 filter 后的索引 (0,1,2)，不是 messages 中的真实位置
```

**正确做法：**
```js
const userMsgs = [];
for (let i = 0; i < messages.length; i++) {
  if (messages[i].role === 'user') {
    userMsgs.push({ origIdx: i, content: messages[i].content });
  }
}
// origIdx 是 messages 数组中的真实位置 (0,2,4)
```

---

## P-003 — LLM JSON 返回字段名兼容

**场景：** 同一 prompt 在不同调用中返回的 JSON 字段名不同（`start` vs `start_idx` vs `start_message`）。

**模式：** 使用 `??` 链式 fallback：
```js
blocks = rawBlocks.map(b => ({
  start_idx: b.start_idx ?? b.start ?? b.start_message,
  end_idx: b.end_idx ?? b.end ?? b.end_message,
  topic_hint: b.topic_hint ?? b.topic ?? '',
}));
```

**经验：** 如果某个字段名变体（如 `start_message`）在多次调用中频繁出现，考虑更新 prompt 中的 JSON 模板，强化该字段名的写法。

---

## P-004 — 话题块消息切片 extend 策略

**场景：** LLM 返回的话题切分只包含 user 消息的索引（如 start=1, end=1），需要扩展到包含中间的 assistant 回复和下一个话题之前的所有消息。

**模式：**
```js
// 1. 先将 LLM 的 user 消息 1-based 索引映射为 messages 数组的真实位置
const mappedBlocks = blocks.map(block => ({
  startMsgIdx: userMsgs[block.start_idx - 1]?.origIdx ?? 0,
  endMsgIdx: userMsgs[block.end_idx - 1]?.origIdx ?? messages.length - 1,
}));

// 2. Extend：每个话题块的 end 延伸到下一个话题块 start 之前
for (let i = 0; i < mappedBlocks.length; i++) {
  if (i < mappedBlocks.length - 1) {
    mappedBlocks[i].endMsgIdx = Math.max(
      mappedBlocks[i].endMsgIdx,
      mappedBlocks[i + 1].startMsgIdx - 1
    );
  } else {
    mappedBlocks[i].endMsgIdx = messages.length - 1;
  }
}
```

**要点：** extend 必须在映射之后做，否则 startMsgIdx 还没映射到正确位置。

---

## P-005 — 语义去重（切分+去重双引擎）

**场景：** 话题切分可能将同一话题的不同讨论维度切为多个话题块，产生重复卡片（如"年龄差异""自律""快乐选择"都是同一话题的不同角度）。

**根因：** 纯靠 LLM prompt 做话题切分不可靠，因为 LLM 容易把"不同讨论角度"当作"话题转变"。

**模式：切分 + 去重双引擎**
1. **切分端**：prompt 极度保守（合并优先、宁可合不可分、不要从讨论角度拆分）
2. **去重端**：多维度语义比较，不依赖 LLM 生成的 topic 字段
   - 核心：original_question Jaccard 相似度 >= 0.7 + 标题相似度 >= 0.3
   - 辅助：标题 Jaccard >= 0.6 + 问题相似度 >= 0.3
   - 兜底：标题包含 + 问题包含；问题极度相似 >= 0.9 + narrative 重叠 >= 0.2

**经验：** 去重判断维度越多，阈值就应该越宽松；如果只靠单一维度（如只看 topic），阈值必须很紧，但 LLM 输出不稳定会导致误杀。

---

## P-006 — topic 与 tags 不冗余设计

**经验：** 当两个字段都由 LLM 生成且语义有重叠时（如 topic="编程" 和 tags[0]="编程/Python"），保留更灵活的那个（tags，支持层级和多值），删除冗余字段（topic）。

**理由：**
- topic 是单一字符串，tags 是数组（2-5 个），tags 信息量更大
- tags 支持 parent/child 层级（如 "编程/Python"），比 topic 的扁平分类更精细
- 去重和筛选都可以用 tags 替代 topic 的功能
- 少一个 LLM 生成字段 = 少一个不一致的源头
