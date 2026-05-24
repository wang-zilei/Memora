/*
 * ChatGPT conversation capture probe.
 *
 * Usage:
 * 1. Open a ChatGPT conversation page, for example https://chatgpt.com/c/...
 * 2. Open DevTools Console.
 * 3. Paste this whole script and press Enter.
 * 4. Inspect window.chatgptCaptureResult.
 *
 * This script uses the current browser login state and ChatGPT's web API.
 */
(async () => {
  const CONFIG = {
    sessionEndpoint: 'https://chatgpt.com/api/auth/session',
    apiEndpoint: 'https://chatgpt.com/backend-api/conversation',
    copyToClipboard: true,
    includeRaw: false,
  };

  const log = (...args) => console.log('[ChatGPTCapture]', ...args);
  const warn = (...args) => console.warn('[ChatGPTCapture]', ...args);

  function extractConversationId(url = location.href) {
    const match = /^https?:\/\/(?:chat\.openai\.com|chatgpt\.com)\/c\/([a-zA-Z0-9-]+)/.exec(url);
    return match?.[1] || null;
  }

  async function getAccessToken() {
    const response = await fetch(CONFIG.sessionEndpoint, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`ChatGPT session API responded with HTTP ${response.status}`);
    const session = await response.json();
    if (!session.accessToken) throw new Error('Cannot retrieve ChatGPT access token from session API.');
    return session.accessToken;
  }

  async function fetchConversation(conversationId, token) {
    const response = await fetch(`${CONFIG.apiEndpoint}/${conversationId}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) throw new Error(`ChatGPT conversation API responded with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response.json();
  }

  function buildLinearConversation(mapping, currentNode) {
    const nodes = [];
    let cursor = currentNode;
    const seen = new Set();
    while (cursor && mapping[cursor] && !seen.has(cursor)) {
      seen.add(cursor);
      nodes.push(cursor);
      cursor = mapping[cursor].parent;
    }
    return nodes.reverse();
  }

  function shouldSkipNode(node) {
    const message = node?.message;
    if (!message?.content) return true;
    const role = message.author?.role;
    if (role === 'system') return true;
    const ct = message.content?.content_type;
    if (ct === 'thoughts') return true;
    const meta = message.metadata || {};
    if (meta.is_visually_hidden_from_conversation) return true;
    if (meta.is_redacted) return true;
    if (meta.is_user_system_message) return true;
    if (meta.reasoning_status) return true;
    return false;
  }

  function flattenContent(content) {
    if (!content) return '';
    const type = content.content_type;
    if (type === 'text') return (content.parts || []).filter((part) => typeof part === 'string').join('\n\n').trim();
    if (type === 'multimodal_text') {
      return (content.parts || [])
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part?.content_type === 'image_asset_pointer') return '[image]';
          if (part?.text) return String(part.text);
          return '';
        })
        .filter(Boolean)
        .join('\n\n')
        .trim();
    }
    if (type === 'code') return `\`\`\`\n${content.text || ''}\n\`\`\``.trim();
    if (Array.isArray(content.parts)) return content.parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('\n\n').trim();
    return content.text || '';
  }

  function normalizeMessages(data) {
    const mapping = data.mapping || {};
    const ids = buildLinearConversation(mapping, data.current_node);
    const messages = [];
    for (const id of ids) {
      const node = mapping[id];
      if (shouldSkipNode(node)) continue;
      const role = node.message.author?.role === 'user' ? 'user' : 'assistant';
      const content = flattenContent(node.message.content).replace(/【\d+†source】/g, '').trim();
      if (!content) continue;
      messages.push({
        role,
        content,
        node_id: id,
        message_id: node.message.id,
        create_time: node.message.create_time,
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
      } else {
        grouped.push({ role: message.role, content: message.content, message_ids: [message.message_id] });
      }
    }
    return grouped;
  }

  async function copyResult(result) {
    if (!CONFIG.copyToClipboard) return false;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      return true;
    } catch (error) {
      warn('copy failed; inspect window.chatgptCaptureResult instead', error);
      return false;
    }
  }

  if (!/^(chatgpt\.com|chat\.openai\.com)$/i.test(location.hostname)) {
    throw new Error('Open a ChatGPT conversation page first: https://chatgpt.com/c/{conversationId}');
  }

  const conversationId = extractConversationId();
  if (!conversationId) throw new Error('Cannot extract ChatGPT conversation id from current URL.');

  log('start', { conversationId, url: location.href });
  const token = await getAccessToken();
  const data = await fetchConversation(conversationId, token);
  const messages = normalizeMessages(data);
  const groupedMessages = groupConsecutiveMessages(messages);
  const result = {
    platform: 'chatgpt',
    strategy: 'internal-api',
    title: data.title || document.title || undefined,
    url: location.href,
    conversation_id: conversationId,
    captured_at: new Date().toISOString(),
    message_count: messages.length,
    grouped_message_count: groupedMessages.length,
    messages,
    grouped_messages: groupedMessages.map(({ role, content }) => ({ role, content })),
    ...(CONFIG.includeRaw ? { raw: data } : {}),
  };

  window.chatgptCaptureResult = result;
  await copyResult(result);
  log(`done: ${messages.length} messages, ${groupedMessages.length} grouped`);
  console.log(result);
  return result;
})();

