/*
 * Gemini conversation capture probe.
 *
 * Usage:
 * 1. Open a Gemini conversation page, for example https://gemini.google.com/app/...
 * 2. Open DevTools Console.
 * 3. Paste this whole script and press Enter.
 * 4. Inspect window.geminiCaptureResult.
 *
 * This script first tries Gemini's batchexecute payload, then falls back to visible DOM.
 */
(async () => {
  const CONFIG = {
    copyToClipboard: true,
    includeRaw: false,
  };

  const log = (...args) => console.log('[GeminiCapture]', ...args);
  const warn = (...args) => console.warn('[GeminiCapture]', ...args);

  function extractConversationId(url = location.href) {
    const match = /^https?:\/\/gemini\.google\.com\/(?:u\/\d+\/)?app\/([a-zA-Z0-9]+)/.exec(url);
    return match?.[1] || null;
  }

  function extractPathPrefix(url = location.href) {
    const match = /^https?:\/\/gemini\.google\.com\/(u\/\d+)\//.exec(url);
    return match ? `/${match[1]}` : '';
  }

  function extractRuntimeParamsFromHtml(html, hl) {
    const extract = (patterns) => {
      for (const pattern of patterns) {
        const match = pattern.exec(html);
        if (match?.[1]) return match[1].trim();
      }
      return undefined;
    };
    const at = extract([/"SNlM0e":"([^"]+)"/, /\\"SNlM0e\\"\s*:\s*\\"([^"]+)\\"/]);
    const bl = extract([/"cfb2h":"([^"]+)"/, /\\"cfb2h\\"\s*:\s*\\"([^"]+)\\"/]);
    const fSid = extract([/"FdrFJe":"([^"]+)"/, /\\"FdrFJe\\"\s*:\s*\\"([^"]+)\\"/]);
    return bl && fSid ? { at, bl, fSid, hl } : null;
  }

  async function resolveRuntimeParams() {
    const hl = document.documentElement.lang || navigator.language.split('-')[0] || 'en';
    const inline = extractRuntimeParamsFromHtml(document.documentElement.outerHTML, hl);
    if (inline) return inline;
    const response = await fetch(location.href, { credentials: 'include', mode: 'cors' });
    const html = await response.text();
    const remote = extractRuntimeParamsFromHtml(html, hl);
    if (remote) return remote;
    throw new Error('Cannot find Gemini runtime params SNlM0e/cfb2h/FdrFJe.');
  }

  async function fetchConversationPayload(conversationId, runtimeParams, pathPrefix) {
    const rpcId = 'hNvQHb';
    const query = new URLSearchParams({
      rpcids: rpcId,
      'source-path': `${pathPrefix}/app/${conversationId}`,
      bl: runtimeParams.bl,
      'f.sid': runtimeParams.fSid,
      hl: runtimeParams.hl,
      _reqid: `${1000000 + Math.floor(Math.random() * 9000000)}`,
      rt: 'c',
    });
    const fReq = JSON.stringify([[[rpcId, JSON.stringify([`c_${conversationId}`, 10, null, 1, [0], [4], null, 1]), null, 'generic']]]);
    const body = new URLSearchParams({ 'f.req': fReq });
    if (runtimeParams.at) body.set('at', runtimeParams.at);
    const endpoint = `https://gemini.google.com${pathPrefix}/_/BardChatUi/data/batchexecute`;
    const response = await fetch(`${endpoint}?${query.toString()}`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      cache: 'no-store',
      referrer: `https://gemini.google.com${pathPrefix}/app/${conversationId}`,
      referrerPolicy: 'strict-origin-when-cross-origin',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        Origin: 'https://gemini.google.com',
        'X-Same-Domain': '1',
      },
      body: body.toString(),
    });
    if (!response.ok) throw new Error(`Gemini batchexecute responded with HTTP ${response.status}`);
    const text = await response.text();
    const payloadString = extractPayloadFromResponse(text, rpcId);
    if (!payloadString) throw new Error('Cannot locate Gemini payload in batchexecute response.');
    return JSON.parse(payloadString);
  }

  function extractPayloadFromResponse(responseText, rpcId) {
    const findRpcPayload = (node) => {
      if (!Array.isArray(node)) return null;
      if (node.length >= 3 && node[0] === 'wrb.fr' && node[1] === rpcId && typeof node[2] === 'string') return node[2];
      for (const child of node) {
        const payload = findRpcPayload(child);
        if (payload) return payload;
      }
      return null;
    };
    for (const line of responseText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === ")]}'") continue;
      try {
        const payload = findRpcPayload(JSON.parse(trimmed));
        if (payload) return payload;
      } catch {}
    }
    return null;
  }

  function normalizeText(content) {
    return String(content || '').replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
  }

  function findAllStrings(root) {
    const out = [];
    const stack = [root];
    while (stack.length) {
      const current = stack.pop();
      if (typeof current === 'string') out.push(current);
      else if (Array.isArray(current)) stack.push(...current);
      else if (current && typeof current === 'object') stack.push(...Object.values(current));
    }
    return out;
  }

  function isLikelyMessageText(content) {
    const text = normalizeText(content);
    if (!text) return false;
    if (/^https?:\/\//.test(text)) return false;
    if (/^(?:rc_|r_|c_)[a-zA-Z0-9_]+$/.test(text)) return false;
    if (/^[A-Za-z0-9+/=_-]{48,}$/.test(text)) return false;
    return /[A-Za-z0-9\u4e00-\u9fff]/.test(text);
  }

  function findFirstString(node) {
    const stack = [node];
    while (stack.length) {
      const current = stack.pop();
      if (typeof current === 'string' && isLikelyMessageText(current)) return normalizeText(current);
      if (Array.isArray(current)) stack.push(...current);
      else if (current && typeof current === 'object') stack.push(...Object.values(current));
    }
    return null;
  }

  function extractMessagesFromPayload(payload) {
    const collected = [];
    const stack = [payload];
    while (stack.length) {
      const node = stack.pop();
      if (!Array.isArray(node)) continue;
      if (node.length >= 3 && node[1] === 1 && node[2] === null && Array.isArray(node[0])) {
        const text = findFirstString(node[0]);
        if (text) collected.push({ role: 'user', content: text });
      }
      if (typeof node[0] === 'string' && /^rc_[a-zA-Z0-9]+$/.test(node[0])) {
        const text = findFirstString(node[1]);
        const imageUrls = findAllStrings(node).filter((value) => /^https:\/\/lh3\.googleusercontent\.com\/gg(?:-dl)?\//.test(value));
        if (text || imageUrls.length) collected.push({ role: 'assistant', content: [text, ...imageUrls.map((url) => `![Generated image](${url})`)].filter(Boolean).join('\n\n') });
      }
      stack.push(...node);
    }
    return dedupeMessages(collected);
  }

  function dedupeMessages(messages) {
    const out = [];
    for (const message of messages) {
      const content = normalizeText(message.content);
      if (!content) continue;
      const prev = out[out.length - 1];
      if (prev?.role === message.role && prev.content === content) continue;
      out.push({ role: message.role, content });
    }
    return out;
  }

  function groupConsecutiveMessages(messages) {
    const grouped = [];
    messages.forEach((message, index) => {
      const last = grouped[grouped.length - 1];
      if (last?.role === message.role) {
        last.content = `${last.content}\n\n${message.content}`.trim();
        last.indices.push(index);
      } else grouped.push({ role: message.role, content: message.content, indices: [index] });
    });
    return grouped;
  }

  async function fallbackDomMessages() {
    const selectors = ['user-query', 'model-response', '[data-test-id="user-query"]', '[data-test-id="model-response"]', '.query-text', '.response-content', 'main article'];
    const nodes = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const seen = new Set();
    return nodes
      .filter((node) => {
        if (seen.has(node)) return false;
        seen.add(node);
        return true;
      })
      .map((node) => {
        const tag = node.tagName.toLowerCase();
        const meta = `${tag} ${node.className || ''} ${node.getAttribute('data-test-id') || ''}`.toLowerCase();
        const role = /user|query/.test(meta) ? 'user' : 'assistant';
        const content = normalizeText(node.innerText || node.textContent || '');
        return { role, content };
      })
      .filter((message) => message.content);
  }

  async function copyResult(result) {
    if (!CONFIG.copyToClipboard) return false;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      return true;
    } catch (error) {
      warn('copy failed; inspect window.geminiCaptureResult instead', error);
      return false;
    }
  }

  if (!/^gemini\.google\.com$/i.test(location.hostname)) {
    throw new Error('Open a Gemini conversation page first: https://gemini.google.com/app/{conversationId}');
  }

  const conversationId = extractConversationId();
  if (!conversationId) throw new Error('Cannot extract Gemini conversation id from current URL.');

  log('start', { conversationId, url: location.href });
  let strategy = 'batchexecute';
  let payload;
  let messages = [];
  try {
    const runtimeParams = await resolveRuntimeParams();
    payload = await fetchConversationPayload(conversationId, runtimeParams, extractPathPrefix());
    messages = extractMessagesFromPayload(payload);
  } catch (error) {
    warn('batchexecute failed; falling back to visible DOM', error);
    strategy = 'visible-dom-fallback';
    messages = await fallbackDomMessages();
  }

  const groupedMessages = groupConsecutiveMessages(messages);
  const result = {
    platform: 'gemini',
    strategy,
    title: document.title || undefined,
    url: location.href,
    conversation_id: conversationId,
    captured_at: new Date().toISOString(),
    message_count: messages.length,
    grouped_message_count: groupedMessages.length,
    messages: messages.map((message, index) => ({ ...message, index })),
    grouped_messages: groupedMessages.map(({ role, content }) => ({ role, content })),
    ...(CONFIG.includeRaw && payload ? { raw: payload } : {}),
  };

  window.geminiCaptureResult = result;
  await copyResult(result);
  log(`done: ${messages.length} messages, ${groupedMessages.length} grouped`);
  console.log(result);
  return result;
})();

