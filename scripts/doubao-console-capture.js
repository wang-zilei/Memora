/*
 * Doubao conversation capture probe.
 *
 * Usage:
 * 1. Open a Doubao conversation page, for example https://www.doubao.com/chat/...
 * 2. Open DevTools Console.
 * 3. Paste this whole script and press Enter.
 * 4. The cleaned result will be printed and copied to clipboard when possible.
 *
 * This script only reads the conversation visible to your current logged-in browser session.
 */
(async () => {
  const CONFIG = {
    apiBase: 'https://www.doubao.com',
    apiParams:
      'version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&samantha_web=1&use-olympus-account=1',
    fetchLimit: 20,
    maxPages: 100,
    copyToClipboard: true,
    includeRawMessages: false,
  };

  const log = (...args) => console.log('[DoubaoCapture]', ...args);
  const warn = (...args) => console.warn('[DoubaoCapture]', ...args);

  function extractConversationId(url = location.href) {
    const match = /^https?:\/\/www\.doubao\.com\/chat\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/i.exec(url);
    return match?.[1] ?? null;
  }

  function uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function postDoubao(path, body) {
    const response = await fetch(`${CONFIG.apiBase}${path}?${CONFIG.apiParams}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; encoding=utf-8',
        Accept: 'application/json, text/plain, */*',
        'agw-js-conv': 'str',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${path} failed: HTTP ${response.status} ${text.slice(0, 300)}`);
    }

    return response.json();
  }

  async function fetchConversationTitle(conversationId) {
    try {
      const data = await postDoubao('/im/conversation/info', {
        cmd: 1110,
        uplink_body: {
          get_conv_info_uplink_body: {
            conversation_id: conversationId,
            ext: {},
            bot_id: '',
            conversation_type: 3,
            option: { need_bot_info: false },
          },
        },
        sequence_id: uuid(),
        channel: 2,
        version: '1',
      });

      return (
        data?.downlink_body?.get_conv_info_downlink_body?.conversation_info?.name ||
        document.title ||
        undefined
      );
    } catch (error) {
      warn('读取标题失败，继续抓消息：', error);
      return document.title || undefined;
    }
  }

  async function fetchAllMessages(conversationId) {
    const allMessages = [];
    let anchorIndex = Number.MAX_SAFE_INTEGER;

    for (let page = 0; page < CONFIG.maxPages; page += 1) {
      const data = await postDoubao('/im/chain/single', {
        cmd: 3100,
        uplink_body: {
          pull_singe_chain_uplink_body: {
            conversation_id: conversationId,
            anchor_index: anchorIndex,
            conversation_type: 3,
            direction: 1,
            limit: CONFIG.fetchLimit,
            ext: {},
            filter: { index_list: [] },
          },
        },
        sequence_id: uuid(),
        channel: 2,
        version: '1',
      });

      const body = data?.downlink_body?.pull_singe_chain_downlink_body;
      const messages = body?.messages ?? [];
      const hasMore = body?.has_more !== false;

      log(`第 ${page + 1} 页：${messages.length} 条，has_more=${body?.has_more}`);
      if (!messages.length) break;

      allMessages.push(...messages);

      const indices = messages
        .map((message) => Number.parseInt(message.index_in_conv, 10))
        .filter((index) => Number.isFinite(index));

      if (!indices.length) break;
      const minIndex = Math.min(...indices);
      if (minIndex >= anchorIndex) {
        warn('分页 anchor 没有继续向前移动，停止以避免死循环。', { anchorIndex, minIndex });
        break;
      }

      anchorIndex = minIndex;
      if (!hasMore || messages.length < CONFIG.fetchLimit) break;
    }

    return allMessages;
  }

  function collectTextFromUnknownValue(value, output = []) {
    if (value == null) return output;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) output.push(trimmed);
      return output;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => collectTextFromUnknownValue(item, output));
      return output;
    }

    if (typeof value === 'object') {
      const record = value;
      for (const key of ['text', 'content', 'value', 'summary']) {
        if (typeof record[key] === 'string' && record[key].trim()) {
          output.push(record[key].trim());
        }
      }
      return output;
    }

    return output;
  }

  function extractMessageText(message) {
    const blockTexts =
      message.content_block
        ?.flatMap((block) => {
          const text = block?.content?.text_block?.text;
          return text && text.trim() ? [text.trim()] : [];
        })
        .filter(Boolean) ?? [];

    if (blockTexts.length) return blockTexts.join('\n\n');

    const raw = typeof message.content === 'string' ? message.content.trim() : '';
    if (!raw) return '';

    try {
      const parsed = JSON.parse(raw);
      const texts = collectTextFromUnknownValue(parsed);
      if (texts.length) return [...new Set(texts)].join('\n\n');
    } catch {
      // Plain text content is valid for some message shapes.
    }

    return raw;
  }

  function normalizeMessages(rawMessages) {
    const sorted = [...rawMessages].sort((a, b) => {
      const ai = Number.parseInt(a.index_in_conv, 10);
      const bi = Number.parseInt(b.index_in_conv, 10);
      return (Number.isFinite(ai) ? ai : 0) - (Number.isFinite(bi) ? bi : 0);
    });

    const messages = [];
    const seen = new Set();

    for (const raw of sorted) {
      const content = extractMessageText(raw).trim();
      if (!content) continue;

      const role = raw.user_type === 1 ? 'user' : 'assistant';
      const index = Number.parseInt(raw.index_in_conv, 10);
      const id = raw.message_id || `${role}-${index}-${content.slice(0, 24)}`;
      const dedupeKey = `${id}|${role}|${content}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      messages.push({
        role,
        content,
        index_in_conv: Number.isFinite(index) ? index : raw.index_in_conv,
        message_id: raw.message_id,
        create_time: raw.create_time,
      });
    }

    return messages;
  }

  function groupConsecutiveMessages(messages) {
    const grouped = [];
    for (const message of messages) {
      const last = grouped[grouped.length - 1];
      if (last?.role === message.role) {
        last.content = `${last.content}\n\n${message.content}`.trim();
        last.message_ids.push(message.message_id);
        last.indices.push(message.index_in_conv);
      } else {
        grouped.push({
          role: message.role,
          content: message.content,
          message_ids: [message.message_id],
          indices: [message.index_in_conv],
        });
      }
    }
    return grouped;
  }

  async function copyResult(result) {
    const text = JSON.stringify(result, null, 2);
    if (!CONFIG.copyToClipboard) return false;

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      warn('自动复制失败，可手动从 doubaoCaptureResult 变量复制。', error);
      return false;
    }
  }

  const conversationId = extractConversationId();
  if (!conversationId) {
    throw new Error('当前 URL 看起来不是豆包会话页：需要类似 https://www.doubao.com/chat/{conversationId}');
  }

  log('开始抓取', { conversationId, url: location.href });

  const [title, rawMessages] = await Promise.all([
    fetchConversationTitle(conversationId),
    fetchAllMessages(conversationId),
  ]);

  const messages = normalizeMessages(rawMessages);
  const groupedMessages = groupConsecutiveMessages(messages);

  const result = {
    platform: 'doubao',
    title,
    url: location.href,
    conversation_id: conversationId,
    captured_at: new Date().toISOString(),
    message_count: messages.length,
    grouped_message_count: groupedMessages.length,
    messages,
    grouped_messages: groupedMessages.map(({ role, content }) => ({ role, content })),
    ...(CONFIG.includeRawMessages ? { raw_messages: rawMessages } : {}),
  };

  window.doubaoCaptureResult = result;
  const copied = await copyResult(result);

  log(`完成：清洗消息 ${messages.length} 条，合并后 ${groupedMessages.length} 条。${copied ? '已复制到剪贴板。' : '结果已写入 window.doubaoCaptureResult。'}`);
  console.log(result);

  return result;
})();
