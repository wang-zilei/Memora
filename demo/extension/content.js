/**
 * Content Script: 悬浮球 + 平台检测 + 对话抓取
 * 注入到所有 LLM 页面，直接执行抓取，结果发给 background 转发后端
 *
 * 抓取逻辑基于 scripts/ 目录下验证过的 console capture probe 脚本。
 */

(function () {
  'use strict';

  // Firefox/Edge 兼容
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    if (typeof browser !== 'undefined' && browser.runtime) {
      window.chrome = window.chrome || {};
      window.chrome.runtime = browser.runtime;
    }
  }

  // 避免重复注入
  const existingBall = document.getElementById('llm-kb-float-ball');
  const existingTooltip = document.getElementById('llm-kb-tooltip');
  if (existingBall) existingBall.remove();
  if (existingTooltip) existingTooltip.remove();
  console.log('[LLM知识库] content.js 注入 - 时间:', new Date().toISOString());

  // ============ 平台注册表 ============

  const PLATFORMS = {
    chatgpt: { id: 'chatgpt', name: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com'] },
    claude: { id: 'claude', name: 'Claude', hosts: ['claude.ai'] },
    deepseek: { id: 'deepseek', name: 'DeepSeek', hosts: ['chat.deepseek.com'] },
    doubao: { id: 'doubao', name: '豆包', hosts: ['www.doubao.com', 'doubao.com'] },
    gemini: { id: 'gemini', name: 'Gemini', hosts: ['gemini.google.com'] },
    kimi: { id: 'kimi', name: 'Kimi', hosts: ['kimi.moonshot.cn', 'kimi.com', 'www.kimi.com'] },
    minimax: { id: 'minimax', name: 'MiniMax', hosts: ['chat.minimax.io', 'hailuoai.com'] },
    qwen: { id: 'qwen', name: '通义千问', hosts: ['chat.qwen.ai', 'tongyi.aliyun.com', 'www.qianwen.com', 'qianwen.com'] },
    yuanbao: { id: 'yuanbao', name: '腾讯元宝', hosts: ['yuanbao.tencent.com', 'yuanbao.qq.com', 'yuanbao.tencent.cn'] },
  };

  function detectPlatform() {
    const hostname = window.location.hostname;
    for (const [id, config] of Object.entries(PLATFORMS)) {
      if (config.hosts.some(h => hostname === h || hostname.endsWith('.' + h))) {
        return config;
      }
    }
    return null;
  }

  const currentPlatform = detectPlatform();
  if (!currentPlatform) return;

  console.log(`[LLM知识库] 检测到平台: ${currentPlatform.name}`);

  // ============ 悬浮球 UI ============

  const ball = document.createElement('div');
  ball.id = 'llm-kb-float-ball';
  ball.innerHTML = '🧠';
  ball.title = `点击抓取${currentPlatform.name}对话`;
  ball.style.cssText = `
    position: fixed; bottom: 80px; right: 24px; width: 48px; height: 48px;
    border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white; display: flex; align-items: center; justify-content: center;
    font-size: 22px; cursor: pointer; z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); transition: all 0.3s ease;
    user-select: none;
  `;

  ball.addEventListener('mouseenter', () => {
    ball.style.transform = 'scale(1.1)';
    ball.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
  });
  ball.addEventListener('mouseleave', () => {
    ball.style.transform = 'scale(1)';
    ball.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
  });

  const tooltip = document.createElement('div');
  tooltip.id = 'llm-kb-tooltip';
  tooltip.style.cssText = `
    position: fixed; bottom: 136px; right: 16px; padding: 8px 16px;
    background: rgba(0, 0, 0, 0.8); color: white; border-radius: 8px;
    font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    z-index: 2147483647; opacity: 0; transition: opacity 0.3s;
    pointer-events: none; max-width: 280px; white-space: nowrap;
  `;

  function showTooltip(msg, duration = 3000) {
    tooltip.textContent = msg;
    tooltip.style.opacity = '1';
    setTimeout(() => { tooltip.style.opacity = '0'; }, duration);
  }

  document.body.appendChild(ball);
  document.body.appendChild(tooltip);

  // ============ 可拖动悬浮球 ============

  let isDragging = false, hasMoved = false, startX, startY, startLeft, startTop;

  ball.addEventListener('mousedown', (e) => {
    isDragging = false; hasMoved = false;
    startX = e.clientX; startY = e.clientY;
    const rect = ball.getBoundingClientRect();
    startLeft = rect.left; startTop = rect.top;
  });

  document.addEventListener('mousemove', (e) => {
    if (startX === undefined) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasMoved = true; isDragging = true;
      ball.style.left = (startLeft + dx) + 'px'; ball.style.top = (startTop + dy) + 'px';
      ball.style.right = 'auto'; ball.style.bottom = 'auto';
    }
  });

  document.addEventListener('mouseup', () => {
    startX = undefined;
    if (hasMoved) setTimeout(() => { isDragging = false; hasMoved = false; }, 50);
    else { isDragging = false; hasMoved = false; }
  });

  ball.addEventListener('click', (e) => {
    if (isDragging || hasMoved) { e.stopImmediatePropagation(); }
  }, true);

  // ============ 通用工具函数（来自 scripts/ 验证过的逻辑）============

  function mergeMessages(messages) {
    const filtered = messages.filter(m => m.content && m.content.length > 0);
    const merged = [];
    for (const msg of filtered) {
      if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
        merged[merged.length - 1].content += '\n\n' + msg.content;
      } else {
        merged.push({ role: msg.role, content: msg.content });
      }
    }
    return merged;
  }

  function groupConsecutiveMessages(messages) {
    const grouped = [];
    for (const message of messages) {
      const last = grouped[grouped.length - 1];
      if (last?.role === message.role) {
        last.content = `${last.content}\n\n${message.content}`.trim();
      } else {
        grouped.push({ role: message.role, content: message.content });
      }
    }
    return grouped;
  }

  // ---- Visible DOM Probe（Kimi/Qwen/元宝/Gemini/MiniMax 共用） ----

  function createVisibleDomProbe(config) {
    const junkPatterns = config.junkPatterns || [
      /^(新建|历史|探索|发现|设置|登录|注册|升级|会员|分享|复制|重新生成|停止生成|发送|展开|收起|编辑|删除)$/,
      /^(编辑\s*)?(复制\s*)?(分享\s*)?$/,
      /^(new chat|history|settings|login|sign in|upgrade|share|copy|retry|regenerate|stop)$/i,
    ];

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function scrollPageForLazyContent() {
      for (const target of getScrollTargets()) {
        for (let pass = 0; pass < config.maxScrollPasses; pass += 1) {
          const before = getScrollTop(target);
          setScrollTop(target, 0);
          await sleep(config.settleMs);
          setScrollTop(target, getScrollHeight(target));
          await sleep(config.settleMs);
          const after = getScrollTop(target);
          if (Math.abs(after - before) < 2) break;
        }
      }
    }

    function getScrollTargets() {
      return [document.scrollingElement || document.documentElement, ...Array.from(document.querySelectorAll('*'))]
        .filter((element) => element instanceof Element && element.scrollHeight > element.clientHeight + 200 && /(auto|scroll)/.test(`${getComputedStyle(element).overflowY}${getComputedStyle(element).overflow}`))
        .slice(0, 8);
    }

    function getScrollTop(target) {
      return target === document.scrollingElement ? window.scrollY : target.scrollTop;
    }

    function setScrollTop(target, value) {
      if (target === document.scrollingElement || target === document.documentElement) window.scrollTo(0, value);
      else target.scrollTop = value;
    }

    function getScrollHeight(target) {
      return target === document.scrollingElement || target === document.documentElement ? document.documentElement.scrollHeight : target.scrollHeight;
    }

    function queryAllDeep(selectors) {
      const found = [];
      const seen = new Set();
      const roots = [document];
      for (let i = 0; i < roots.length; i += 1) {
        const root = roots[i];
        for (const selector of selectors) {
          try {
            root.querySelectorAll(selector).forEach((element) => {
              if (!seen.has(element)) {
                seen.add(element);
                found.push(element);
              }
            });
          } catch {}
        }
        root.querySelectorAll?.('*').forEach((element) => {
          if (element.shadowRoot) roots.push(element.shadowRoot);
        });
      }
      return found;
    }

    function collectTurnCandidates() {
      const turnElements = queryAllDeep(config.selectors.turns);
      const roleElements = [
        ...queryAllDeep(config.selectors.user).map((element) => ({ element, role: 'user' })),
        ...queryAllDeep(config.selectors.assistant).map((element) => ({ element, role: 'assistant' })),
      ];

      const picked = turnElements.length
        ? turnElements.map((element) => ({ element, role: inferRole(element) }))
        : roleElements;

      return picked
        .map(({ element, role }) => ({ role, content: extractText(element), top: element.getBoundingClientRect().top + window.scrollY }))
        .filter((item) => item.content);
    }

    function inferRole(element) {
      const own = `${element.getAttribute('data-role') || ''} ${element.getAttribute('aria-label') || ''} ${element.className || ''}`.toLowerCase();
      if (/user|human|question|ask|mine|self/.test(own)) return 'user';
      if (/assistant|bot|answer|ai|markdown|response|agent/.test(own)) return 'assistant';
      const rect = element.getBoundingClientRect();
      return rect.left > window.innerWidth * 0.42 && rect.width < window.innerWidth * 0.72 ? 'user' : 'assistant';
    }

    function extractText(element) {
      const clone = element.cloneNode(true);
      clone.querySelectorAll?.('button, svg, nav, aside, input, textarea, [role="button"], [aria-hidden="true"], script, style').forEach((node) => node.remove());
      return cleanText(clone.innerText || clone.textContent || '');
    }

    function cleanText(text) {
      const lines = text
        .replace(/\r\n/g, '\n')
        .replace(/ /g, ' ')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => line.length > 1)
        .filter((line) => !junkPatterns.some((pattern) => pattern.test(line)));
      return [...new Set(lines)].join('\n').trim();
    }

    function normalizeForCompare(text) {
      return cleanText(text)
        .replace(/\s+/g, '')
        .replace(/[,.，。:：;；!?！？'"'"''']/g, '')
        .trim();
    }

    function containsDescendant(candidates, item) {
      // 如果 item.element 包含其他候选元素，说明它是外层容器，应跳过
      for (const other of candidates) {
        if (other === item) continue;
        if (other.element && item.element.contains(other.element)) return true;
      }
      return false;
    }

    function normalizeCandidates(candidates) {
      // 先过滤掉包含其他候选元素的外层容器（嵌套去重）
      const leafOnly = candidates.filter((item) => !containsDescendant(candidates, item));
      const seen = new Set();
      return leafOnly
        .sort((a, b) => a.top - b.top)
        .filter((item) => item.content.length >= 2)
        .filter((item) => {
          const key = normalizeForCompare(item.content);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((item, index) => ({ role: item.role, content: item.content, index }));
    }

    return async function run() {
      await scrollPageForLazyContent();
      const rawMessages = normalizeCandidates(collectTurnCandidates());
      return groupConsecutiveMessages(rawMessages).map(({ role, content }) => ({ role, content }));
    };
  }

  // ============ 抓取入口 ============

  let isCapturing = false;

  ball.addEventListener('click', async () => {
    if (isCapturing) { showTooltip('正在抓取中，请稍候...'); return; }

    isCapturing = true;
    ball.innerHTML = '⏳';
    ball.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
    showTooltip(`正在抓取${currentPlatform.name}对话...`);

    try {
      const captureResult = await captureConversation(currentPlatform.id);

      if (captureResult.error) {
        throw new Error(captureResult.error);
      }

      console.log('[LLM知识库] 抓取成功，发送给后端:', captureResult.messages?.length || captureResult.grouped_messages?.length || 0, '条消息');

      let response;
      if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        response = await chrome.runtime.sendMessage({
          type: 'CAPTURE_SUBMIT', data: captureResult,
        });
      } else {
        console.warn('[LLM知识库] chrome.runtime 不可用，直接请求后端');
        const serverRes = await fetch('http://localhost:17321/api/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(captureResult),
        });
        response = await serverRes.json();
      }

      if (response && response.success) {
        ball.innerHTML = '✅';
        ball.style.background = 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)';
        showTooltip('抓取成功！知识卡片已生成', 4000);
      } else {
        ball.innerHTML = '❌';
        ball.style.background = 'linear-gradient(135deg, #f5576c 0%, #ff6a88 100%)';
        showTooltip(`后端处理失败: ${response?.error || '未知错误'}`, 5000);
      }
    } catch (error) {
      console.error('[LLM知识库] 抓取异常:', error);
      ball.innerHTML = '❌';
      ball.style.background = 'linear-gradient(135deg, #f5576c 0%, #ff6a88 100%)';
      showTooltip(`抓取失败: ${error.message}`, 5000);
    }

    setTimeout(() => {
      isCapturing = false;
      ball.innerHTML = '🧠';
      ball.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }, 3000);
  });

  async function captureConversation(platform) {
    switch (platform) {
      case 'doubao': return captureDoubao();
      case 'chatgpt': return captureChatGPT();
      case 'claude': return captureClaude();
      case 'deepseek': return captureDeepSeek();
      case 'gemini': return captureGemini();
      case 'kimi': return captureKimi();
      case 'minimax': return captureMiniMax();
      case 'qwen': return captureQwen();
      case 'yuanbao': return captureYuanbao();
      default: return { error: `不支持的平台: ${platform}` };
    }
  }

  // ---- 豆包（API 抓取，来自 scripts/doubao-console-capture.js） ----

  const DOUBAO_API_PARAMS = 'version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&samantha_web=1&use-olympus-account=1';
  const DOUBAO_HEADERS = {
    'Content-Type': 'application/json; encoding=utf-8',
    Accept: 'application/json, text/plain, */*',
    'agw-js-conv': 'str',
  };

  function uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function postDoubao(path, body) {
    const response = await fetch(`https://www.doubao.com${path}?${DOUBAO_API_PARAMS}`, {
      method: 'POST',
      headers: DOUBAO_HEADERS,
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${path} failed: HTTP ${response.status} ${text.slice(0, 300)}`);
    }
    return response.json();
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
      for (const key of ['text', 'content', 'value', 'summary']) {
        if (typeof value[key] === 'string' && value[key].trim()) {
          output.push(value[key].trim());
        }
      }
      return output;
    }
    return output;
  }

  function extractDoubaoMessageText(message) {
    const blockTexts = message.content_block?.flatMap((block) => {
      const text = block?.content?.text_block?.text;
      return text && text.trim() ? [text.trim()] : [];
    }).filter(Boolean) ?? [];
    if (blockTexts.length) return blockTexts.join('\n\n');

    const raw = typeof message.content === 'string' ? message.content.trim() : '';
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      const texts = collectTextFromUnknownValue(parsed);
      if (texts.length) return [...new Set(texts)].join('\n\n');
    } catch {}
    return raw;
  }

  async function captureDoubao() {
    try {
      const url = window.location.href;
      const convMatch = url.match(/^https?:\/\/www\.doubao\.com\/chat\/([a-zA-Z0-9_-]+)/);
      if (!convMatch) return { error: '未检测到豆包对话ID' };

      const convId = convMatch[1];
      let title = document.title;

      try {
        const data = await postDoubao('/im/conversation/info', {
          cmd: 1110,
          uplink_body: {
            get_conv_info_uplink_body: {
              conversation_id: convId,
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
        title = data?.downlink_body?.get_conv_info_downlink_body?.conversation_info?.name || title;
      } catch (e) { console.warn('[豆包] 获取标题失败:', e.message); }

      const allMessages = [];
      let anchorIndex = Number.MAX_SAFE_INTEGER;

      for (let page = 0; page < 100; page += 1) {
        const data = await postDoubao('/im/chain/single', {
          cmd: 3100,
          uplink_body: {
            pull_singe_chain_uplink_body: {
              conversation_id: convId,
              anchor_index: anchorIndex,
              conversation_type: 3,
              direction: 1,
              limit: 20,
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
        if (!messages.length) break;

        allMessages.push(...messages);

        const indices = messages.map((m) => Number.parseInt(m.index_in_conv, 10)).filter((n) => Number.isFinite(n));
        if (!indices.length) break;
        const minIndex = Math.min(...indices);
        if (minIndex >= anchorIndex) break;
        anchorIndex = minIndex;
        if (messages.length < 20) break;
      }

      const sorted = [...allMessages].sort((a, b) => {
        const ai = Number.parseInt(a.index_in_conv, 10);
        const bi = Number.parseInt(b.index_in_conv, 10);
        return (Number.isFinite(ai) ? ai : 0) - (Number.isFinite(bi) ? bi : 0);
      });

      const resultMessages = [];
      const seen = new Set();
      for (const raw of sorted) {
        const content = extractDoubaoMessageText(raw).trim();
        if (!content) continue;
        const role = raw.user_type === 1 ? 'user' : 'assistant';
        const index = Number.parseInt(raw.index_in_conv, 10);
        const id = raw.message_id || `${role}-${index}-${content.slice(0, 24)}`;
        const dedupeKey = `${id}|${role}|${content}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        resultMessages.push({ role, content });
      }

      if (resultMessages.length === 0) return { error: '未提取到任何消息' };
      return { platform: 'doubao', conversation_id: convId, title, url, captured_at: new Date().toISOString(), messages: mergeMessages(resultMessages) };
    } catch (e) {
      console.error('[豆包] 抓取异常:', e);
      return { error: `豆包抓取失败: ${e.message}` };
    }
  }

  // ---- ChatGPT（API 抓取） ----

  async function captureChatGPT() {
    try {
      const url = window.location.href;
      const convMatch = url.match(/\/c\/([a-f0-9-]+)/);
      if (!convMatch) return { error: '未检测到 ChatGPT 对话' };
      const convId = convMatch[1];

      const sessionRes = await fetch('https://chatgpt.com/api/auth/session');
      const sessionData = await sessionRes.json();
      const accessToken = sessionData.accessToken;
      if (!accessToken) return { error: '未获取到 ChatGPT 访问令牌' };

      const convRes = await fetch(`https://chatgpt.com/backend-api/conversation/${convId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const convData = await convRes.json();
      const title = convData.title || document.title;

      const mapping = convData.mapping || {};
      let currentNode = convData.current_node;
      const chain = [];
      while (currentNode) {
        const node = mapping[currentNode];
        if (node?.message) chain.unshift(node.message);
        currentNode = node?.parent;
      }

      const messages = [];
      for (const msg of chain) {
        if (!msg.author || !msg.content) continue;
        if (!['user', 'assistant'].includes(msg.author.role)) continue;
        if (msg.metadata?.is_visually_hidden_from_conversation) continue;
        let content = '';
        for (const part of msg.content.parts || []) {
          if (typeof part === 'string') content += part;
          else if (part.text) content += part.text;
        }
        content = content.replace(/【\d+†source】/g, '').trim();
        if (content) messages.push({ role: msg.author.role, content });
      }

      return { platform: 'chatgpt', conversation_id: convId, title, url, captured_at: new Date().toISOString(), messages: mergeMessages(messages) };
    } catch (e) {
      return { error: `ChatGPT 抓取失败: ${e.message}` };
    }
  }

  // ---- Claude（API 抓取） ----

  async function captureClaude() {
    try {
      const url = window.location.href;
      const convMatch = url.match(/\/chat\/([a-f0-9-]+)/);
      if (!convMatch) return { error: '未检测到 Claude 对话' };
      const convId = convMatch[1];

      const cookies = document.cookie;
      const orgMatch = cookies.match(/lastActiveOrg=([^;]+)/);
      const orgId = orgMatch ? orgMatch[1] : null;
      if (!orgId) return { error: '未获取到 Claude 组织 ID' };

      const res = await fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations/${convId}?tree=True&rendering_mode=messages&render_all_tools=true`,
        { credentials: 'include' }
      );
      const data = await res.json();
      const title = data.name || document.title;

      const chatMessages = (data.chat_messages || [])
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map(msg => {
          const role = msg.sender === 'human' ? 'user' : 'assistant';
          let content = '';
          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text') content += (block.text || '');
            }
          } else {
            content = msg.text || '';
          }
          content = content.replace(/<antArtifact[^>]*>([\s\S]*?)<\/antArtifact>/g, '```\n$1\n```').trim();
          return { role, content };
        })
        .filter(m => m.content.length > 0);

      return { platform: 'claude', conversation_id: convId, title, url, captured_at: new Date().toISOString(), messages: mergeMessages(chatMessages) };
    } catch (e) {
      return { error: `Claude 抓取失败: ${e.message}` };
    }
  }

  // ---- DeepSeek（API 抓取，来自 scripts/deepseek-console-capture.js） ----

  async function captureDeepSeek() {
    try {
      const url = window.location.href;
      const match = /^https?:\/\/chat\.deepseek\.com\/a\/chat\/(?:s\/)?([a-zA-Z0-9-]+)/.exec(url);
      if (!match) return { error: '未检测到 DeepSeek 对话' };
      const sessionId = match[1];

      // Token 解析：scripts/ 逻辑 — JSON.parse(stored).value
      const token = extractDeepSeekToken();
      if (!token) return { error: '无法获取 DeepSeek 访问令牌' };

      const res = await fetch(
        `https://chat.deepseek.com/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(sessionId)}`,
        {
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
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { error: `DeepSeek API HTTP ${res.status}: ${text.slice(0, 300)}` };
      }

      const data = await res.json();
      const rawMessages = data?.data?.biz_data?.chat_messages || [];
      const sorted = [...rawMessages].sort((a, b) => (a.message_id || 0) - (b.message_id || 0));

      const messages = [];
      for (const raw of sorted) {
        const role = String(raw.role || '').toLowerCase();
        if (role !== 'user' && role !== 'assistant') continue;
        const content = String(raw.content || '').trim();
        if (!content) continue;
        messages.push({ role, content });
      }

      if (messages.length === 0) return { error: 'API 返回 200 但未提取到消息' };

      const chatSession = data?.data?.biz_data?.chat_session || {};
      return { platform: 'deepseek', conversation_id: sessionId, title: chatSession.title || document.title, url, captured_at: new Date().toISOString(), messages: mergeMessages(messages) };
    } catch (e) {
      return { error: `DeepSeek 抓取失败: ${e.message}` };
    }
  }

  function extractDeepSeekToken() {
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

  // ---- Gemini（DOM 抓取，自定义标签：USER-QUERY / MODEL-RESPONSE） ----

  async function captureGemini() {
    try {
      const url = window.location.href;
      const convMatch = url.match(/\/app\/([a-f0-9]+)/) || url.match(/\/chat\/([a-f0-9]+)/);
      const convId = convMatch ? convMatch[1] : null;

      // 滚动加载（内联，不依赖 probe 私有函数）
      const geminiTarget = document.scrollingElement || document.documentElement;
      for (let pass = 0; pass < 8; pass += 1) {
        const before = window.scrollY;
        window.scrollTo(0, 0);
        await sleep(450);
        window.scrollTo(0, geminiTarget.scrollHeight);
        await sleep(450);
        if (Math.abs(window.scrollY - before) < 2) break;
      }

      const messages = [];
      const seen = new Set();

      // 直接查找自定义标签
      const userEls = [...document.querySelectorAll('USER-QUERY')];
      const modelEls = [...document.querySelectorAll('MODEL-RESPONSE')];

      // 合并并排序
      const allMsgs = [];
      for (const el of userEls) {
        const text = extractGeminiText(el);
        if (text.length > 2) {
          allMsgs.push({ role: 'user', text, top: el.getBoundingClientRect().top + window.scrollY });
        }
      }
      for (const el of modelEls) {
        const text = extractGeminiText(el);
        if (text.length > 2) {
          allMsgs.push({ role: 'assistant', text, top: el.getBoundingClientRect().top + window.scrollY });
        }
      }

      allMsgs.sort((a, b) => a.top - b.top);

      for (const m of allMsgs) {
        const key = m.text.slice(0, 100);
        if (seen.has(key)) continue;
        seen.add(key);
        messages.push({ role: m.role, content: m.text });
      }

      if (messages.length === 0) return { error: '未能从 Gemini 页面提取对话内容' };

      const pageTitle = document.title.replace(' - Gemini', '').replace(' – Gemini', '');
      return { platform: 'gemini', conversation_id: convId, title: pageTitle, url, captured_at: new Date().toISOString(), messages };
    } catch (e) {
      return { error: `Gemini 抓取失败: ${e.message}` };
    }
  }

  function extractGeminiText(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll?.('button, svg, nav, aside, input, textarea, [role="button"], [aria-hidden="true"], script, style').forEach((node) => node.remove());
    let text = clone.innerText || clone.textContent || '';

    // 去掉 "你说" / "Gemini 说" 前缀
    text = text.replace(/^(你说|Gemini 说)\s*/, '').trim();

    const lines = text
      .replace(/\r\n/g, '\n')
      .replace(/ /g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line.length > 1)
      .filter((line) => !/^(gemini|google)$/i.test(line))
      .filter((line) => !/^(新建|历史|探索|发现|设置|登录|注册|升级|会员|分享|复制|重新生成|停止生成|发送|展开|收起|编辑|删除)$/.test(line))
      .filter((line) => !/^(new chat|history|settings|login|upgrade|share|copy|retry|regenerate|stop)$/i.test(line));

    return [...new Set(lines)].join('\n').trim();
  }

  // ---- Kimi（DOM 抓取，来自 scripts/kimi-console-capture.js） ----

  async function captureKimi() {
    try {
      const url = window.location.href;

      const probe = createVisibleDomProbe({
        platform: 'kimi',
        maxScrollPasses: 8,
        settleMs: 450,
        selectors: {
          turns: [
            '[data-testid*="message"]',
            '[data-testid*="chat"]',
            '[data-message-id]',
            '[data-role]',
            '[class*="chat-item"]',
            '[class*="chat_item"]',
            '[class*="chatItem"]',
            '[class*="message"]',
            '[class*="msg"]',
            '[class*="chat"] [class*="bubble"]',
            '[class*="conversation"] [class*="item"]',
            '[class*="segment"]',
            '[class*="markdown-body"]',
            'main article',
          ],
          user: [
            '[data-role="user"]',
            '[class*="user"]',
            '[class*="human"]',
            '[class*="question"]',
            '[class*="ask"]',
          ],
          assistant: [
            '[data-role="assistant"]',
            '[class*="assistant"]',
            '[class*="bot"]',
            '[class*="answer"]',
            '[class*="markdown"]',
          ],
        },
        junkPatterns: [
          /^(新建|历史|探索|发现|设置|登录|注册|升级|会员|分享|复制|重新生成|停止生成|发送|展开|收起|编辑|删除)$/,
          /^(编辑\s*)?(复制\s*)?(分享\s*)?$/,
          /^(引用|点赞|点踩|收藏|下载)$/,
          /^(plain|text|json|javascript|typescript|python|bash|shell|yaml|yml|markdown|md|sql|html|css|xml|toml|ini|go|java|c\+\+|cpp|csharp|c#|rust|php|ruby|swift|kotlin|r)\s*(复制|copy)?$/i,
          /^(new chat|history|settings|login|sign in|upgrade|share|copy|retry|regenerate|stop)$/i,
          /^(kimi|moonshot)$/i,
        ],
      });

      const messages = await probe();
      if (messages.length === 0) return { error: '未能从 Kimi 页面提取对话内容' };

      return { platform: 'kimi', conversation_id: null, title: document.title.replace(' - Kimi', ''), url, captured_at: new Date().toISOString(), messages };
    } catch (e) {
      return { error: `Kimi 抓取失败: ${e.message}` };
    }
  }

  // ---- MiniMax（DOM 抓取，来自 scripts/minimax-console-capture.js） ----

  async function captureMiniMax() {
    try {
      const probe = createVisibleDomProbe({
        platform: 'minimax',
        maxScrollPasses: 8,
        settleMs: 450,
        selectors: {
          turns: [
            '[data-role]',
            '[class*="chat-item"]',
            '[class*="chatItem"]',
            '[class*="chat-msg"]',
            '[class*="message"]',
            '[class*="msg"]',
            'main article',
          ],
          user: ['[data-role="user"]', '[class*="user"]', '[class*="question"]'],
          assistant: ['[data-role="assistant"]', '[class*="assistant"]', '[class*="bot"]', '[class*="answer"]'],
        },
        junkPatterns: [
          /^(新建|历史|探索|发现|设置|登录|注册|升级|会员|分享|复制|重新生成|停止生成|发送|展开|收起|编辑|删除)$/,
          /^(minimax|hailuo)$/i,
          /^(new chat|history|settings|login|upgrade|share|copy|retry|regenerate|stop)$/i,
        ],
      });

      const messages = await probe();
      if (messages.length === 0) return { error: '未能从 MiniMax 页面提取对话内容' };

      return { platform: 'minimax', conversation_id: null, title: document.title, url, captured_at: new Date().toISOString(), messages };
    } catch (e) {
      return { error: `MiniMax 抓取失败: ${e.message}` };
    }
  }

  // ---- 通义千问（DOM 抓取，基于实际 DOM 结构） ----

  async function captureQwen() {
    try {
      const url = window.location.href;

      // Qwen 实际结构：
      //   wrapper question: class 含 "message-select-wrapper-question"
      //   wrapper answer: class 含 "message-select-wrapper-answer"
      //   内部文本在 [class*="message-select-content"] 中
      // 直接按此结构提取，不使用通用 createVisibleDomProbe

      for (const target of getQwenScrollTargets()) {
        for (let pass = 0; pass < 8; pass += 1) {
          const before = getQwenScrollTop(target);
          setQwenScrollTop(target, 0);
          await sleep(450);
          setQwenScrollTop(target, getQwenScrollHeight(target));
          await sleep(450);
          if (Math.abs(getQwenScrollTop(target) - before) < 2) break;
        }
      }

      const messages = [];
      const seen = new Set();

      // 直接查找 question 和 answer wrapper
      const wrappers = [...document.querySelectorAll(
        '[class*="message-select-wrapper-question"], [class*="message-select-wrapper-answer"]'
      )];

      for (const wrapper of wrappers) {
        const cls = wrapper.className || '';
        const isUser = typeof cls === 'string' && cls.includes('question');
        const content = wrapper.querySelector('[class*="message-select-content"]');
        const text = extractQwenText(content || wrapper);
        if (!text || text.length < 2) continue;

        const key = text.slice(0, 100);
        if (seen.has(key)) continue;
        seen.add(key);

        const top = wrapper.getBoundingClientRect().top + window.scrollY;
        messages.push({ role: isUser ? 'user' : 'assistant', content: text, top });
      }

      messages.sort((a, b) => a.top - b.top);
      for (const m of messages) delete m.top;

      if (messages.length === 0) return { error: '未能从通义千问页面提取对话内容' };
      console.log('[Qwen] 抓取结果:', messages.length, '条消息, roles:', messages.slice(0, 6).map(m => m.role).join(', '));

      return { platform: 'qwen', conversation_id: null, title: document.title.replace(' - 通义千问', '').replace(' - Qwen', ''), url, captured_at: new Date().toISOString(), messages };
    } catch (e) {
      return { error: `通义千问抓取失败: ${e.message}` };
    }
  }

  function getQwenScrollTargets() {
    return [document.scrollingElement || document.documentElement, ...Array.from(document.querySelectorAll('*'))]
      .filter((el) => el instanceof Element && el.scrollHeight > el.clientHeight + 200 && /(auto|scroll)/.test(`${getComputedStyle(el).overflowY}${getComputedStyle(el).overflow}`))
      .slice(0, 8);
  }
  function getQwenScrollTop(target) {
    return target === document.scrollingElement ? window.scrollY : target.scrollTop;
  }
  function setQwenScrollTop(target, value) {
    if (target === document.scrollingElement || target === document.documentElement) window.scrollTo(0, value);
    else target.scrollTop = value;
  }
  function getQwenScrollHeight(target) {
    return target === document.scrollingElement || target === document.documentElement ? document.documentElement.scrollHeight : target.scrollHeight;
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function extractQwenText(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    clone.querySelectorAll?.('button, svg, nav, aside, input, textarea, [role="button"], [aria-hidden="true"], script, style').forEach((node) => node.remove());
    const text = clone.innerText || clone.textContent || '';
    const lines = text.replace(/\r\n/g, '\n').replace(/ /g, ' ').split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line.length > 1)
      .filter((line) => !/^(新建|历史|设置|登录|注册|升级|会员|分享|复制|重新生成|停止生成|发送|展开|收起|编辑|删除|通义|千问|qwen|tongyi)$/.test(line));
    return [...new Set(lines)].join('\n').trim();
  }

  // ---- 腾讯元宝（DOM 抓取，来自 scripts/yuanbao-console-capture.js） ----

  async function captureYuanbao() {
    try {
      const url = window.location.href;

      const probe = createVisibleDomProbe({
        platform: 'yuanbao',
        maxScrollPasses: 8,
        settleMs: 450,
        selectors: {
          turns: [
            '[class*="message"]',
            '[class*="chat"] [class*="bubble"]',
            '[class*="conversation"] [class*="item"]',
            'main article',
          ],
          user: [
            '[class*="user"]',
            '[class*="human"]',
            '[class*="question"]',
            '[class*="ask"]',
          ],
          assistant: [
            '[class*="assistant"]',
            '[class*="agent"]',
            '[class*="bot"]',
            '[class*="answer"]',
            '[class*="markdown"]',
          ],
        },
        junkPatterns: [
          /^(新建|历史|探索|发现|设置|登录|注册|升级|会员|分享|复制|重新生成|停止生成|发送|展开|收起|编辑|删除)$/,
          /^(腾讯元宝|元宝|yuanbao)$/i,
          /^(new chat|history|settings|login|upgrade|share|copy|retry|regenerate|stop)$/i,
        ],
      });

      const messages = await probe();
      if (messages.length === 0) return { error: '未能从元宝页面提取对话内容' };

      return { platform: 'yuanbao', conversation_id: null, title: document.title.replace(' - 腾讯元宝', '').replace(' - Yuanbao', ''), url, captured_at: new Date().toISOString(), messages };
    } catch (e) {
      return { error: `元宝抓取失败: ${e.message}` };
    }
  }

})();
