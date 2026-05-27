/*
 * Claude / Claude Code conversation capture probe.
 *
 * Usage:
 * 1. Open a Claude conversation page, for example https://claude.ai/chat/...
 * 2. Open DevTools Console.
 * 3. Paste this whole script and press Enter.
 * 4. Inspect window.claudecodeCaptureResult.
 *
 * This script uses the current browser login state and Claude's web API.
 * Note: Claude Code CLI terminal sessions are not available from a browser page;
 * this script targets claude.ai chat conversations, including code-heavy chats.
 */
(async () => {
  const CONFIG = {
    apiBase: 'https://claude.ai/api/organizations',
    copyToClipboard: true,
    includeRaw: false,
  };

  const log = (...args) => console.log('[ClaudeCodeCapture]', ...args);
  const warn = (...args) => console.warn('[ClaudeCodeCapture]', ...args);

  function extractConversationId(url = location.href) {
    const match = /^https?:\/\/claude\.ai\/chat\/([a-zA-Z0-9-]+)/.exec(url);
    return match?.[1] || null;
  }

  function extractOrgId(cookie = document.cookie) {
    const match = /(?:^|;\s*)lastActiveOrg=([^;]+)/.exec(cookie);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }

  async function fetchConversation(orgId, conversationId) {
    const response = await fetch(`${CONFIG.apiBase}/${orgId}/chat_conversations/${conversationId}?tree=True&rendering_mode=messages&render_all_tools=true`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      referrer: `https://claude.ai/chat/${conversationId}`,
      referrerPolicy: 'strict-origin-when-cross-origin',
      mode: 'cors',
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`Claude API responded with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response.json();
  }

  function normalizeArtifactToCodeBlock(text) {
    return text.replace(/<antArtifact\s+([^>]+)>([\s\S]*?)<\/antArtifact>/gi, (_full, attributes, body) => {
      const languageMatch = /language="([^"]+)"/i.exec(String(attributes || ''));
      const language = languageMatch?.[1] || 'plaintext';
      return `\n\`\`\`${language}\n${String(body || '').trim()}\n\`\`\`\n`;
    });
  }

  function extractClaudeMessageText(message) {
    const contentText = Array.isArray(message.content)
      ? message.content
          .filter((item) => item?.type === 'text' && item.text)
          .map((item) => String(item.text).trim())
          .filter(Boolean)
          .join('\n')
      : '';
    const fallbackText = String(message.text || '').trim();
    return normalizeArtifactToCodeBlock((contentText || fallbackText).trim());
  }

  function getSortValue(message) {
    if (message.created_at) {
      const parsed = Date.parse(message.created_at);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return (message.index || 0) * 1000;
  }

  function normalizeMessages(data) {
    const rawMessages = data.chat_messages || [];
    return [...rawMessages]
      .sort((a, b) => getSortValue(a) - getSortValue(b))
      .map((raw) => {
        const role = raw.sender === 'human' ? 'user' : 'assistant';
        const content = extractClaudeMessageText(raw);
        return {
          role,
          content,
          uuid: raw.uuid,
          index: raw.index,
          created_at: raw.created_at,
        };
      })
      .filter((message) => message.content);
  }

  function groupConsecutiveMessages(messages) {
    const grouped = [];
    for (const message of messages) {
      const last = grouped[grouped.length - 1];
      if (last?.role === message.role) {
        last.content = `${last.content}\n\n${message.content}`.trim();
        last.uuids.push(message.uuid);
      } else {
        grouped.push({ role: message.role, content: message.content, uuids: [message.uuid] });
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
      warn('copy failed; inspect window.claudecodeCaptureResult instead', error);
      return false;
    }
  }

  if (!/^claude\.ai$/i.test(location.hostname)) {
    throw new Error('Open a Claude conversation page first: https://claude.ai/chat/{conversationId}. Claude Code CLI sessions cannot be captured from a browser page.');
  }

  const conversationId = extractConversationId();
  if (!conversationId) throw new Error('Cannot extract Claude conversation id from current URL.');

  const orgId = extractOrgId();
  if (!orgId) throw new Error('Cannot find Claude organization id from cookie lastActiveOrg.');

  log('start', { conversationId, orgId, url: location.href });
  const data = await fetchConversation(orgId, conversationId);
  const messages = normalizeMessages(data);
  const groupedMessages = groupConsecutiveMessages(messages);
  const result = {
    platform: 'claudecode',
    source_platform: 'claude',
    strategy: 'internal-api',
    title: data.name || document.title || undefined,
    url: location.href,
    conversation_id: conversationId,
    captured_at: new Date().toISOString(),
    message_count: messages.length,
    grouped_message_count: groupedMessages.length,
    messages,
    grouped_messages: groupedMessages.map(({ role, content }) => ({ role, content })),
    notes: ['Targets claude.ai chat conversations. Claude Code CLI terminal history is outside browser page scope.'],
    ...(CONFIG.includeRaw ? { raw: data } : {}),
  };

  window.claudecodeCaptureResult = result;
  await copyResult(result);
  log(`done: ${messages.length} messages, ${groupedMessages.length} grouped`);
  console.log(result);
  return result;
})();
