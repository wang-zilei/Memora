/**
 * AI 总结模块 — 4 步流水线（PRD-v2）
 * 数据清洗 → 话题切分 → 意图分类 → 卡片生成
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Prompt 文件根目录
const PROMPTS_DIR = path.join(__dirname, '..', '..', 'docs', 'prompts');

// 意图英文 key → 中文值 + Prompt 目录映射
const INTENT_MAP = {
  concept_exploration: { zh: '概念理解', dir: 'concept-exploration' },
  fact_lookup: { zh: '事实查询', dir: 'fact-query' },
  skill_learning: { zh: '技能学习', dir: 'skill-learning' },
  how_to: { zh: '操作指南', dir: 'how-to' },
  content_creation: { zh: '内容创作', dir: 'content-creation' },
  text_processing: { zh: '文本处理', dir: 'text-processing' },
  planning_decision: { zh: '规划决策', dir: 'planning-decision' },
  brainstorming: { zh: '头脑风暴', dir: 'brainstorm' },
  interactive_companion: { zh: '交互陪伴', dir: 'interactive-companion' },
  other: { zh: '其他', dir: 'other' },
};

// =================== 核心 Pipeline 入口 ===================

/**
 * 4 步流水线：话题切分 → 意图分类 → 卡片生成
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} params.apiUrl
 * @param {string} params.model
 * @param {Array} params.messages - 清洗后的消息 [{role, content}]
 * @param {string} params.platform - 平台名称
 * @returns {Array} 多张知识卡片 [{title, card_type, original_question, narrative, tags, full_output?}]
 */
async function processPipeline({ apiKey, apiUrl, model, messages, platform }) {
  console.log(`[Pipeline] 开始处理，${messages.length} 条消息`);

  // Step 1: 话题切分
  let topicBlocks;
  try {
    topicBlocks = await splitTopics({ apiKey, apiUrl, model, messages });
  } catch (err) {
    console.error(`[Pipeline] 话题切分异常:`, err.message);
    throw new Error(`话题切分失败: ${err.message}`);
  }
  console.log(`[Pipeline] 话题切分完成，得到 ${topicBlocks.length} 个话题块`);

  if (topicBlocks.length === 0) {
    console.error(`[Pipeline] 警告: 话题切分返回 0 个话题块，检查 messages 中是否有 user 角色`);
    const roles = messages.map(m => m.role);
    console.error(`[Pipeline] 消息角色分布:`, roles);
    return [];
  }

  // Step 2 & 3: 对每个话题块做意图分类 + 卡片生成
  const cards = [];
  for (let i = 0; i < topicBlocks.length; i++) {
    const block = topicBlocks[i];
    const blockMessages = extractBlockMessages(messages, block, platform);
    console.log(`[Pipeline] 话题块 ${i + 1}: 提取 ${blockMessages.length} 条消息`);

    // 意图分类
    let intentKey;
    try {
      intentKey = await classifyIntent({
        apiKey,
        apiUrl,
        model,
        messages: blockMessages,
        platform,
      });
    } catch (err) {
      console.error(`[Pipeline] 意图分类异常 (块 ${i + 1}):`, err.message);
      intentKey = 'other'; // 降级为"其他"
    }
    console.log(`[Pipeline] 话题块 ${i + 1} 意图: ${intentKey} (${block.topic_hint})`);

    // 卡片生成（路由到对应 Prompt）
    const intent = INTENT_MAP[intentKey] || INTENT_MAP.other;
    let card;
    try {
      card = await generateCard({
        apiKey,
        apiUrl,
        model,
        messages: blockMessages,
        platform,
        intentDir: intent.dir,
        cardTypeZh: intent.zh,
      });
    } catch (err) {
      console.error(`[Pipeline] 卡片生成异常 (块 ${i + 1}):`, err.message);
      // 降级：返回一张最小卡片，保留对话记录
      card = {
        title: block.topic_hint || '对话片段',
        card_type: '其他',
        original_question: '',
        narrative: `AI 卡片生成失败: ${err.message}。以下是原始对话记录：\n\n` + blockMessages.slice(0, 4).map(m => `${m.role === 'user' ? '【你】' : `【${platform}】`}${m.content.slice(0, 200)}...`).join('\n\n'),
        tags: [platform],
      };
    }
    console.log(`[Pipeline] 卡片已生成: "${card.title}" (${card.card_type}), narrative 长度: ${card.narrative?.length || 0}`);

    cards.push(card);
  }

  // 去重：同一 card_type 下讨论相同实质问题的卡片只保留一张
  const deduplicatedCards = deduplicateCards(cards);

  return deduplicatedCards;
}

// =================== Step 1: 话题切分 ===================

/**
 * 调用话题切分器 Prompt，返回话题块分割索引
 */
async function splitTopics({ apiKey, apiUrl, model, messages }) {
  // 提取 user 消息序列（话题切分只看用户提问）
  const userMsgs = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user' && messages[i].content && messages[i].content.trim().length > 0) {
      userMsgs.push({ origIdx: i, content: messages[i].content });
    }
  }

  console.log(`[Pipeline] splitTopics: 总消息=${messages.length}, user消息=${userMsgs.length}`);

  if (userMsgs.length === 0) {
    console.log(`[Pipeline] 降级：没有 user 消息`);
    return [];
  }

  // 格式化为 prompt 要求的输入格式：[1]: 内容
  const inputText = userMsgs.map((m, i) => `[${i + 1}]: ${m.content}`).join('\n');
  console.log(`[Pipeline] 话题切分器输入预览:`, inputText.slice(0, 300));

  // 读取话题切分器 Prompt
  const promptPath = path.join(PROMPTS_DIR, 'topic-split', 'prompt.md');
  const promptRaw = fs.readFileSync(promptPath, 'utf-8');
  const systemPrompt = extractPromptBlock(promptRaw);

  // 替换 {{conversation}} 占位符（话题切分器 prompt 没有此占位符，追加输入）
  let finalPrompt;
  if (systemPrompt.includes('{{conversation}}')) {
    finalPrompt = systemPrompt.replace('{{conversation}}', inputText);
  } else {
    finalPrompt = systemPrompt + `\n\n### 输入数据\n\n${inputText}`;
  }

  const response = await callOpenAICompatible({
    apiKey,
    apiUrl,
    model,
    systemPrompt: finalPrompt,
    userPrompt: '请按 JSON 格式输出话题切分结果。',
  });
  console.log(`[Pipeline] 话题切分器原始返回:`, response.slice(0, 300));

  // 解析 JSON
  let jsonStr = response;
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);
  // 兼容多种返回格式：数组 / {topic_blocks: [...]} / 单个块对象
  let rawBlocks;
  if (Array.isArray(parsed)) {
    rawBlocks = parsed;
  } else if (parsed.topic_blocks) {
    rawBlocks = parsed.topic_blocks;
  } else if (parsed.start_idx || parsed.start || parsed.start_message || parsed.start_user || parsed.utterances) {
    // 单个块对象（如 {id: 1, start_user: 1, end_user: 2, topic: "..."}）
    rawBlocks = [parsed];
  } else {
    rawBlocks = [];
  }

  // 防御：如果 LLM 返回了 N 个话题块但没有 start_idx/end_idx，先做顺序推断
  const hasAnyIndex = rawBlocks.some(b => (b.start_idx ?? b.start ?? b.start_message) != null);
  if (!hasAnyIndex && rawBlocks.length > 1) {
    console.log(`[Pipeline] 话题块缺少索引，按顺序推断`);
    rawBlocks = rawBlocks.map((b, i) => {
      const startIdx = i === 0 ? 1 : 0; // 0 表示 "上一个块的 end_idx + 1"
      const endIdx = i === rawBlocks.length - 1 ? userMsgs.length : 0; // 0 同上
      return { ...b, _inferred: true, _startRaw: startIdx, _endRaw: endIdx };
    });
    // 重新计算：第一个块 start=1, end=start; 后续 start=前一个end+1, end=start; 最后一个 end=userMsgs.length
    for (let i = 0; i < rawBlocks.length; i++) {
      if (i === 0) {
        rawBlocks[i]._startRaw = 1;
      } else {
        rawBlocks[i]._startRaw = rawBlocks[i - 1]._endRaw + 1;
      }
      rawBlocks[i]._endRaw = i === rawBlocks.length - 1 ? userMsgs.length : rawBlocks[i]._startRaw;
    }
    console.log(`[Pipeline] 推断后话题块:`, JSON.stringify(rawBlocks.map(b => ({ start_idx: b._startRaw, end_idx: b._endRaw, topic: b.topic_hint }))));
  }

  // 兼容多种字段名和格式（包括 LLM 可能自由发挥的 utterances 格式）
  const blocks = rawBlocks.map(b => {
    let startIdx = b.start_idx ?? b.start ?? b.start_message ?? b.start_user ?? b._startRaw;
    let endIdx = b.end_idx ?? b.end ?? b.end_message ?? b.end_user ?? b._endRaw;

    // 如果 start_idx/end_idx 都缺失，尝试从 utterances 格式中提取
    if (startIdx == null && Array.isArray(b.utterances)) {
      const indices = b.utterances
        .map(u => {
          const m = u.match(/(?:User\[|Turn\[)?(\d+)\]?/);
          return m ? parseInt(m[1], 10) : null;
        })
        .filter(x => x != null);
      startIdx = Math.min(...indices);
      endIdx = Math.max(...indices);
    }

    return {
      start_idx: startIdx ?? 1,
      end_idx: endIdx ?? userMsgs.length,
      message_count: b.message_count ?? b.turn_count ?? 1,
      topic_hint: b.topic_hint ?? b.topic ?? '',
    };
  });
  console.log(`[Pipeline] 话题切分结果: ${blocks.length} 个话题块`, JSON.stringify(blocks));

  // Map from userMsgs 1-based index to actual messages array index
  const mappedBlocks = blocks.map((block) => {
    const startMsgIdx = userMsgs[block.start_idx - 1]?.origIdx ?? 0;
    const endMsgIdx = userMsgs[block.end_idx - 1]?.origIdx ?? messages.length - 1;
    return { ...block, startMsgIdx, endMsgIdx };
  });

  // Extend each block's end to include messages up to the next block's start
  for (let i = 0; i < mappedBlocks.length; i++) {
    if (i < mappedBlocks.length - 1) {
      const nextStart = mappedBlocks[i + 1].startMsgIdx;
      mappedBlocks[i].endMsgIdx = Math.max(mappedBlocks[i].endMsgIdx, nextStart - 1);
    } else {
      mappedBlocks[i].endMsgIdx = messages.length - 1;
    }
  }

  return mappedBlocks;
}

// =================== Step 2: 意图分类 ===================

/**
 * 调用意图分类器 Prompt，返回意图英文 key
 */
async function classifyIntent({ apiKey, apiUrl, model, messages, platform }) {
  // 格式化为对话文本
  const conversationText = messages
    .map((m) => `${m.role === 'user' ? '【用户】' : `【${platform}】`}${m.content}`)
    .join('\n\n');

  // 读取意图分类器 Prompt
  const promptPath = path.join(PROMPTS_DIR, 'classifier', 'prompt.md');
  const promptRaw = fs.readFileSync(promptPath, 'utf-8');
  const systemPrompt = extractPromptBlock(promptRaw);

  const response = await callOpenAICompatible({
    apiKey,
    apiUrl,
    model,
    systemPrompt,
    userPrompt: `请判断以下对话的意图：\n\n${conversationText}`,
    temperature: 0.1, // 分类需要确定性输出
  });

  // 提取英文 key（去除可能的空白和 markdown）
  const key = response.trim().replace(/`/g, '').split('\n')[0].toLowerCase();
  return INTENT_MAP[key] ? key : 'other';
}

// =================== Step 3: 卡片生成 ===================

/**
 * 根据意图路由到对应 Prompt，生成知识卡片
 */
async function generateCard({ apiKey, apiUrl, model, messages, platform, intentDir, cardTypeZh }) {
  // 格式化为对话文本
  const conversationText = messages
    .map((m) => `${m.role === 'user' ? '【用户】' : `【${platform}】`}${m.content}`)
    .join('\n\n');

  // 读取对应意图的 Prompt
  const promptPath = path.join(PROMPTS_DIR, intentDir, 'prompt.md');
  const promptRaw = fs.readFileSync(promptPath, 'utf-8');
  const systemPrompt = extractPromptBlock(promptRaw);

  // 替换 {{conversation}} 占位符
  const finalPrompt = systemPrompt.replace('{{conversation}}', conversationText);

  const response = await callOpenAICompatible({
    apiKey,
    apiUrl,
    model,
    systemPrompt: finalPrompt,
    userPrompt: '请按 JSON 格式输出知识卡片。',
  });

  // 解析 JSON（处理可能嵌套代码块的情况）
  let jsonStr = response;

  // 如果返回被 markdown 包裹，找到第一个 { 和最后一个 }
  const firstBrace = response.indexOf('{');
  const lastBrace = response.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = response.slice(firstBrace, lastBrace + 1);
  } else {
    // 降级：尝试正则
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
  }

  const parsed = JSON.parse(jsonStr);

  // 统一 card_type 为中文值
  const cardType = normalizeCardType(parsed.card_type, cardTypeZh);

  // 提取字段（兼容旧格式的 insights/outputs，转为 narrative）
  const card = {
    title: parsed.title || '未命名对话',
    card_type: cardType,
    original_question: parsed.original_question || parsed.originalQuestion || '',
    narrative: parsed.narrative || '',
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  };

  // content_creation 和 text_processing 额外有 full_output 字段
  if (parsed.full_output) {
    card.full_output = parsed.full_output;
  }

  return card;
}

// =================== 去重 ===================

/**
 * 语义去重：同 card_type 下讨论相同实质问题的卡片只保留一张
 *
 * 策略：
 * 1. 不同 card_type 不比较
 * 2. 比较 original_question 的语义相似度（核心判断）
 * 3. 辅助：比较 narrative 前 100 字的关键词重叠
 * 4. 如果标题已经高度相似 + 问题相似度高 → 去重
 * 5. 如果标题不同但问题几乎一样 → 去重
 */
function deduplicateCards(cards) {
  if (cards.length <= 1) return cards;
  const result = [];
  for (const card of cards) {
    const isDuplicate = result.find((existing) => {
      // 不同 card_type 不比较
      if (existing.card_type !== card.card_type) return false;

      // 问题相似度（核心判断）
      const q1 = (existing.original_question || '').replace(/\s/g, '');
      const q2 = (card.original_question || '').replace(/\s/g, '');
      const questionSimilar = q1 && q2 ? jaccardSimilarity(q1, q2) : 0;
      const questionContains = (q1 && q2) ? (q1.includes(q2) || q2.includes(q1)) : false;

      // 标题相似度（辅助判断）
      const t1 = (existing.title || '').replace(/\s/g, '');
      const t2 = (card.title || '').replace(/\s/g, '');
      const titleJaccard = jaccardSimilarity(t1, t2);
      const titleContains = t1.includes(t2) || t2.includes(t1);

      // narrative 前 100 字关键词重叠（辅助判断）
      const n1 = (existing.narrative || '').slice(0, 100);
      const n2 = (card.narrative || '').slice(0, 100);
      const narrativeSimilar = n1 && n2 ? jaccardSimilarity(n1, n2) : 0;

      // 综合判断：
      // 情况 1：问题高度相似（>=0.7）且标题也有一定相似度 → 去重
      if (questionSimilar >= 0.7 && titleJaccard >= 0.3) return true;
      // 情况 2：标题高度相似（>=0.6）且问题也有一定重叠 → 去重
      if (titleJaccard >= 0.6 && questionSimilar >= 0.3) return true;
      // 情况 3：标题包含关系且问题也包含 → 去重
      if (titleContains && questionContains) return true;
      // 情况 4：标题包含 + 问题高度相似（>=0.6） → 去重
      if (titleContains && questionSimilar >= 0.6) return true;
      // 情况 5：问题完全一样 + narrative 有一定重叠 → 去重
      if (questionSimilar >= 0.9 && narrativeSimilar >= 0.2) return true;

      return false;
    });

    if (!isDuplicate) {
      result.push(card);
    } else {
      console.log(`[Pipeline] 去重: 丢弃卡片 "${card.title}"，与现有卡片 "${isDuplicate.title}" 近似重复`);
      console.log(`[Pipeline] 去重详情: title相似度=${jaccardSimilarity((isDuplicate.title||'').replace(/\s/g,''), (card.title||'').replace(/\s/g,'')).toFixed(2)}, question相似度=${jaccardSimilarity((isDuplicate.original_question||'').replace(/\s/g,''), (card.original_question||'').replace(/\s/g,'')).toFixed(2)}`);
    }
  }
  return result;
}

/** 计算两个字符串的 Jaccard 相似度 */
function jaccardSimilarity(a, b) {
  const s1 = new Set(a.replace(/\s/g, ''));
  const s2 = new Set(b.replace(/\s/g, ''));
  const intersection = [...s1].filter((c) => s2.has(c)).length;
  const union = new Set([...s1, ...s2]).size;
  return union > 0 ? intersection / union : 0;
}

// =================== 工具函数 ===================

/**
 * 根据话题块的范围，提取完整消息切片（含 user + assistant）
 * block.startMsgIdx / block.endMsgIdx 已经是 allMessages 数组的索引
 */
function extractBlockMessages(allMessages, block, platform) {
  const startMsgIdx = block.startMsgIdx ?? 0;
  const endMsgIdx = block.endMsgIdx ?? allMessages.length - 1;
  return allMessages.slice(startMsgIdx, endMsgIdx + 1);
}

/**
 * 从 Prompt markdown 中提取 System Prompt（第一个 ``` 代码块内容，不含代码标记行）
 */
function extractPromptBlock(markdown) {
  // 策略 1：提取 ## 角色设定 到 ## 示例输出（不含）之间的内容
  const roleMatch = markdown.match(/##\s*角色设定\s*\n+([\s\S]*?)(?=##\s*示例输出|$)/i);
  if (roleMatch) {
    // 还需要包含 ## 输出格式 和 ## 约束 部分
    const fullMatch = markdown.match(/##\s*角色设定\s*\n([\s\S]*?)(?=##\s*示例输出)/i);
    if (fullMatch) {
      return fullMatch[1].trim();
    }
    return roleMatch[1].trim();
  }

  // 策略 2：提取 ## System Prompt 到下一个 ## 之间的内容（旧格式兼容）
  const systemMatch = markdown.match(/##\s*System Prompt\s*\n+([\s\S]*?)(?=##\s+|$)/);
  if (systemMatch) {
    return systemMatch[1].trim();
  }

  // 策略 3：提取第一个 ``` 代码块（极旧格式）
  const firstBlock = markdown.match(/```\s*([\s\S]*?)```/);
  if (firstBlock) {
    return firstBlock[1].trim();
  }

  // 降级：返回整个文件
  return markdown.trim();
}

/**
 * 统一 card_type 为中文值
 */
function normalizeCardType(cardType, fallback) {
  if (!cardType) return fallback;
  // 如果是中文值直接返回
  if (/[一-龥]/.test(cardType)) return cardType;
  // 如果是英文 key，映射为中文
  return INTENT_MAP[cardType]?.zh || fallback;
}

// =================== 向后兼容（旧版单步调用） ===================

/**
 * @deprecated 旧版单 Prompt 总结，保留以兼容。新代码请使用 processPipeline()
 */
async function summarizeConversation({ apiKey, apiUrl, model, messages, platform }) {
  const cards = await processPipeline({ apiKey, apiUrl, model, messages, platform });
  // 兼容旧版返回格式：返回第一张卡片
  if (cards.length > 0) {
    return {
      title: cards[0].title,
      originalQuestion: cards[0].original_question,
      insights: cards[0].narrative ? [cards[0].narrative] : [],
      outputs: cards[0].full_output ? [cards[0].full_output] : [],
      tags: cards[0].tags,
      _cards: cards, // 附加完整卡片列表
    };
  }
  return {
    title: '未生成卡片',
    originalQuestion: '',
    insights: [],
    outputs: [],
    tags: [],
    _cards: [],
  };
}

// =================== HTTP 调用 ===================

function callOpenAICompatible({ apiKey, apiUrl, model, systemPrompt, userPrompt, temperature = 0.3 }) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${apiUrl}/chat/completions`);

    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: 2000,
    });

    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`API error ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.message?.content;
          if (!content) {
            reject(new Error('Empty response from API'));
            return;
          }
          resolve(content);
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { summarizeConversation, processPipeline };
