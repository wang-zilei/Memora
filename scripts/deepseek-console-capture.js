/*
 * DeepSeek conversation capture probe.
 *
 * Usage:
 * 1. Open a DeepSeek conversation page, for example https://chat.deepseek.com/a/chat/s/...
 * 2. Open DevTools Console.
 * 3. Paste this whole script and press Enter.
 * 4. Inspect window.deepseekCaptureResult.
 *
 * This script uses the current browser login state and DeepSeek's web API.
 */
(async () => {
  const CONFIG = {
    apiBase: 'https://chat.deepseek.com/api/v0',
    copyToClipboard: true,
    includeRaw: false,
  };

  const log = (...args) => console.log('[DeepSeekCapture]', ...args);
  const warn = (...args) => console.warn('[DeepSeekCapture]', ...args);

  function extractSessionId(url = location.href) {
    const match = /^https?:\/\/chat\.deepseek\.com\/a\/chat\/(?:s\/)?([a-zA-Z0-9-]+)/.exec(url);
    return match?.[1] || null;
  }

  function extractAuthToken() {
    try {
      const stored = localStorage.getItem('userToken');
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && 'value' in parsed) return String(parsed.value);
      return typeof parsed === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }

  async function fetchHistory(sessionId, token) {
    const response = await fetch(`${CONFIG.apiBase}/chat/history_messages?chat_session_id=${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'x-app-version': '20241129.1',
        'x-client-locale': navigator.language || 'zh_CN',
        'x-client-platform': 'web',
      },
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`DeepSeek API responded with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response.json();
  }

  function normalizeRole(role) {
    const lower = String(role || '').toLowerCase();
    if (lower === 'user') return 'user';
    if (lower === 'assistant') return 'assistant';
    return null;
  }

  function normalizeMessages(data) {
    const rawMessages = data?.data?.biz_data?.chat_messages || [];
    const sorted = [...rawMessages].sort((a, b) => (a.message_id || 0) - (b.message_id || 0));
    const messages = [];
    for (const raw of sorted) {
      const role = normalizeRole(raw.role);
      if (!role) continue;
      const content = String(raw.content || '').trim();
      if (!content) continue;
      messages.push({
        role,
        content,
        message_id: raw.message_id,
        parent_message_id: raw.parent_message_id,
        create_time: raw.inserted_at || raw.created_at,
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
      warn('copy failed; inspect window.deepseekCaptureResult instead', error);
      return false;
    }
  }

  if (!/^chat\.deepseek\.com$/i.test(location.hostname)) {
    throw new Error('Open a DeepSeek conversation page first: https://chat.deepseek.com/a/chat/s/{sessionId}');
  }

  const sessionId = extractSessionId();
  if (!sessionId) throw new Error('Cannot extract DeepSeek session id from current URL.');

  const token = extractAuthToken();
  if (!token) throw new Error('Cannot find DeepSeek auth token in localStorage.userToken.');

  log('start', { sessionId, url: location.href });
  const data = await fetchHistory(sessionId, token);
  const messages = normalizeMessages(data);
  const groupedMessages = groupConsecutiveMessages(messages);
  const result = {
    platform: 'deepseek',
    strategy: 'internal-api',
    title: data?.data?.biz_data?.chat_session?.title || document.title || undefined,
    url: location.href,
    session_id: sessionId,
    captured_at: new Date().toISOString(),
    message_count: messages.length,
    grouped_message_count: groupedMessages.length,
    messages,
    grouped_messages: groupedMessages.map(({ role, content }) => ({ role, content })),
    ...(CONFIG.includeRaw ? { raw: data } : {}),
  };

  window.deepseekCaptureResult = result;
  await copyResult(result);
  log(`done: ${messages.length} messages, ${groupedMessages.length} grouped`);
  console.log(result);
  return result;
})();

