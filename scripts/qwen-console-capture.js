/*
 * Qwen / Tongyi conversation capture probe.
 *
 * Usage:
 * 1. Open a Qwen/Tongyi conversation page, for example https://chat.qwen.ai/c/... or https://tongyi.aliyun.com/qianwen/...
 * 2. Open DevTools Console.
 * 3. Paste this whole script and press Enter.
 * 4. Inspect window.qwenCaptureResult.
 *
 * This probe reads the visible/loaded page DOM and open Shadow DOM only.
 */
(async () => {
  const CONFIG = {
    platform: 'qwen',
    allowedHosts: ['chat.qwen.ai', 'tongyi.aliyun.com', 'qianwen.aliyun.com', 'qianwen.com'],
    resultName: 'qwenCaptureResult',
    maxScrollPasses: 8,
    settleMs: 450,
    copyToClipboard: true,
    selectors: {
      turns: [
        '[data-testid*="message"]',
        '[class*="message"]',
        '[class*="chat"] [class*="bubble"]',
        '[class*="conversation"] [class*="item"]',
        'main article',
      ],
      user: ['[data-role="user"]', '[class*="user"]', '[class*="human"]', '[class*="question"]'],
      assistant: ['[data-role="assistant"]', '[class*="assistant"]', '[class*="bot"]', '[class*="answer"]', '[class*="markdown"]'],
    },
  };

  const result = await createVisibleDomProbe(CONFIG)();
  window[CONFIG.resultName] = result;
  console.log(result);
  return result;

  function createVisibleDomProbe(config) {
    const log = (...args) => console.log(`[${config.platform}Capture]`, ...args);
    const warn = (...args) => console.warn(`[${config.platform}Capture]`, ...args);
    const junkPatterns = [
      /^(新建|历史|探索|发现|设置|登录|注册|升级|会员|分享|复制|重新生成|停止生成|发送|展开|收起|编辑|删除)$/,
      /^(通义|千问|qwen|tongyi)$/i,
      /^(new chat|history|settings|login|upgrade|share|copy|retry|regenerate|stop)$/i,
    ];

    return async function run() {
      validateHost();
      await scrollPageForLazyContent();
      const messages = normalizeCandidates(collectTurnCandidates());
      const groupedMessages = groupConsecutiveMessages(messages);
      const result = {
        platform: config.platform,
        strategy: 'visible-dom-open-shadow',
        title: document.title || undefined,
        url: location.href,
        captured_at: new Date().toISOString(),
        message_count: messages.length,
        grouped_message_count: groupedMessages.length,
        messages,
        grouped_messages: groupedMessages.map(({ role, content }) => ({ role, content })),
        notes: ['Visible/loaded DOM probe; internal Qwen/Tongyi API is not encoded in this script.'],
      };
      await copyResult(result);
      log(`done: ${messages.length} messages, ${groupedMessages.length} grouped`);
      return result;
    };

    function validateHost() {
      if (!config.allowedHosts.some((host) => location.hostname === host || location.hostname.endsWith(`.${host}`))) throw new Error(`Current host ${location.hostname} is not supported by ${config.platform} probe.`);
    }
    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async function scrollPageForLazyContent() {
      for (const target of getScrollTargets()) {
        for (let pass = 0; pass < config.maxScrollPasses; pass += 1) {
          setScrollTop(target, 0);
          await sleep(config.settleMs);
          setScrollTop(target, getScrollHeight(target));
          await sleep(config.settleMs);
        }
      }
    }
    function getScrollTargets() {
      return [document.scrollingElement || document.documentElement, ...Array.from(document.querySelectorAll('*'))].filter((element) => element instanceof Element && element.scrollHeight > element.clientHeight + 200 && /(auto|scroll)/.test(`${getComputedStyle(element).overflowY}${getComputedStyle(element).overflow}`)).slice(0, 8);
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
      const roleElements = [...queryAllDeep(config.selectors.user).map((element) => ({ element, role: 'user' })), ...queryAllDeep(config.selectors.assistant).map((element) => ({ element, role: 'assistant' }))];
      return (turnElements.length ? turnElements.map((element) => ({ element, role: inferRole(element) })) : roleElements).map(({ element, role }) => ({ role, content: extractText(element), top: element.getBoundingClientRect().top + window.scrollY })).filter((item) => item.content);
    }
    function inferRole(element) {
      const own = `${element.getAttribute('data-role') || ''} ${element.getAttribute('aria-label') || ''} ${element.className || ''}`.toLowerCase();
      if (/user|human|question|ask|mine|self/.test(own)) return 'user';
      if (/assistant|bot|answer|ai|markdown|response/.test(own)) return 'assistant';
      const rect = element.getBoundingClientRect();
      return rect.left > window.innerWidth * 0.42 && rect.width < window.innerWidth * 0.72 ? 'user' : 'assistant';
    }
    function extractText(element) {
      const clone = element.cloneNode(true);
      clone.querySelectorAll?.('button, svg, nav, aside, input, textarea, [role="button"], [aria-hidden="true"], script, style').forEach((node) => node.remove());
      const lines = (clone.innerText || clone.textContent || '').replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').split('\n').map((line) => line.trim()).filter(Boolean).filter((line) => line.length > 1).filter((line) => !junkPatterns.some((pattern) => pattern.test(line)));
      return [...new Set(lines)].join('\n').trim();
    }
    function containsDescendant(candidates, item) {
      for (const other of candidates) {
        if (other === item) continue;
        if (other.element && item.element.contains(other.element)) return true;
      }
      return false;
    }
    function normalizeCandidates(candidates) {
      const leafOnly = candidates.filter((item) => !containsDescendant(candidates, item));
      const seen = new Set();
      return leafOnly.sort((a, b) => a.top - b.top).filter((item) => item.content.length >= 2).filter((item) => {
        const key = `${item.role}|${item.content}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map((item, index) => ({ role: item.role, content: item.content, index }));
    }
    function groupConsecutiveMessages(messages) {
      const grouped = [];
      for (const message of messages) {
        const last = grouped[grouped.length - 1];
        if (last?.role === message.role) {
          last.content = `${last.content}\n\n${message.content}`.trim();
          last.indices.push(message.index);
        } else grouped.push({ role: message.role, content: message.content, indices: [message.index] });
      }
      return grouped;
    }
    async function copyResult(result) {
      if (!config.copyToClipboard) return;
      try {
        await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      } catch (error) {
        warn('copy failed; inspect window result instead', error);
      }
    }
  }
})();
