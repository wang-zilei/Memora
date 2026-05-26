/**
 * 对话清洗模块
 * 将原始抓取数据规范化为统一 Q&A 格式
 */

/**
 * 清洗原始对话数据，输出统一格式的 Q&A 对
 * @param {Object} raw - 原始抓取数据
 * @returns {Object} { messages: [{role, content}], title, platform, conversationId, url, capturedAt }
 */
function cleanConversation(raw) {
  // 1. 统一字段命名
  const platform = raw.platform || 'unknown';
  const conversationId = raw.conversation_id || raw.conversationId || raw.session_id || null;
  const title = raw.title || null;
  const url = raw.url || null;
  const capturedAt = raw.captured_at || raw.capturedAt || new Date().toISOString();

  // 2. 获取消息列表（优先 grouped_messages，其次 messages）
  let rawMessages = raw.grouped_messages || raw.messages || [];

  // 3. 规范化每条消息
  let messages = rawMessages.map(msg => {
    let role = normalizeRole(msg.role);
    let content = cleanContent(msg.content || '');
    content = sanitizeContent(content);

    return { role, content };
  }).filter(msg => msg.content.trim().length > 0);

  // 4. 合并连续相同角色的消息
  messages = mergeConsecutive(messages);

  // 5. 确保以 user 开头（如果第一条是 assistant，可能是系统提示，保留）
  // 不强制修改，保持原始结构

  return {
    platform,
    conversationId,
    title,
    url,
    capturedAt,
    messages,
  };
}

/**
 * 规范化角色标识
 */
function normalizeRole(role) {
  if (!role) return 'assistant';
  const r = String(role).toLowerCase().trim();
  if (r === 'user' || r === 'human' || r === '1') return 'user';
  return 'assistant';
}

/**
 * 清洗内容文本
 */
function cleanContent(content) {
  if (typeof content !== 'string') {
    content = JSON.stringify(content);
  }

  // === 0. 移除各平台思考/推理过程 ===
  // 先用简单标签移除（处理未闭合或嵌套过深的情况）
  content = content
    // 移除未闭合的思考标签
    .replace(/<think[^>]*>/gi, '')
    .replace(/<\/think>/gi, '')
    .replace(/<thinking[^>]*>/gi, '')
    .replace(/<\/thinking>/gi, '')
    .replace(/<reasoning[^>]*>/gi, '')
    .replace(/<\/reasoning>/gi, '')
    .replace(/<search[^>]*>/gi, '')
    .replace(/<\/search>/gi, '');

  // 再用非贪婪匹配移除完整标签块（处理正常嵌套）
  content = content
    .replace(/<div[^>]*class="[^"]*think[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/\[思考\][\s\S]*?\[\/思考\]/g, '')
    .replace(/\[深度思考\][\s\S]*?\[\/深度思考\]/g, '')
    .replace(/\[推理想法\][\s\S]*?\[\/推理想法\]/g, '');

  // === 1. 移除常见垃圾文本模式 ===
  content = content
    .replace(/【\d+†source】/g, '')
    .replace(/(编辑|复制|分享|重新生成|AI 搜索|已深度思考|内容由AI生成|仅供参考|已思考\(用时\d+秒\))/g, '')
    .replace(/已思考（用时\d+秒）/g, '')
    .replace(/内容由AI生成[，,，]?.*?/g, '')
    .replace(/(思考中|深度思考中|推理中|思维链|深度思考模式)[：:].*?/g, '')
    .replace(/思考用时[：:]\s*\d+秒/g, '')
    .replace(/推理用时[：:]\s*\d+秒/g, '')
    .replace(/深度思考用时[：:]\s*\d+秒/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return content;
}

/**
 * 质检清洗：移除 AI 输出中的 markdown 格式标识和转义字符
 * 作为 Prompt 约束之外的兜底机制
 */
function sanitizeContent(content) {
  if (!content || typeof content !== 'string') return content;

  let t = content;

  // 1. 字面 \n \r → 实际字符
  t = t.replace(/\\n/g, '\n');
  t = t.replace(/\\r/g, '');

  // 2. Markdown 标题标记 → 去掉 # 号，保留文字
  t = t.replace(/^#{1,6}\s+/gm, '');

  // 3. 粗体 **text** → text
  t = t.replace(/\*\*(.+?)\*\*/g, '$1');

  // 4. 行内斜体 *text*（非行首的 *，即不是列表标记）
  t = t.replace(/([^\n*])\*([^*\n]+?)\*([^\n*])/g, '$1$2$3');

  // 5. 水平分割线（单独一行的 *** 或 --- 或 ___）
  t = t.replace(/^[-*_]{3,}\s*$/gm, '');

  // 6. AI 常见输出前缀
  t = t.replace(/^(好的[，,]\s*|当然[，,]\s*|以下是我的[^：:]*[：:]\s*|以下是[^：:]*[：:]\s*)/gm, '');

  // 7. 压缩多余空行
  t = t.replace(/\n{3,}/g, '\n\n');

  return t.trim();
}

/**
 * 合并连续相同角色的消息
 */
function mergeConsecutive(messages) {
  if (messages.length === 0) return messages;

  const result = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const last = result[result.length - 1];
    const curr = messages[i];

    if (last.role === curr.role) {
      last.content += '\n\n' + curr.content;
    } else {
      result.push(curr);
    }
  }
  return result;
}

module.exports = { cleanConversation };
