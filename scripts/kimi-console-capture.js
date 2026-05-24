/*
 * Kimi conversation capture probe.
 *
 * Usage:
 * 1. Open a Kimi conversation page, for example https://kimi.moonshot.cn/chat/...
 * 2. Open DevTools Console.
 * 3. Paste this whole script and press Enter.
 * 4. Inspect window.kimiCaptureResult.
 *
 * This probe reads the visible/loaded page DOM and open Shadow DOM only.
 */
(async () => {
  const CONFIG = {
    platform: 'kimi',
    allowedHosts: ['kimi.moonshot.cn', 'kimi.com'],
    resultName: 'kimiCaptureResult',
    maxScrollPasses: 8,
    settleMs: 450,
    copyToClipboard: true,
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
  };

  const runVisibleDomProbe = createVisibleDomProbe(CONFIG);
  const result = await runVisibleDomProbe();
  window[CONFIG.resultName] = result;
  console.log(result);
  return result;

  function createVisibleDomProbe(config) {
    const log = (...args) => console.log(`[${config.platform}Capture]`, ...args);
    const warn = (...args) => console.warn(`[${config.platform}Capture]`, ...args);

    const junkPatterns = [
      /^(新建|历史|探索|发现|设置|登录|注册|升级|会员|分享|复制|重新生成|停止生成|发送|展开|收起|编辑|删除)$/,
      /^(编辑\s*)?(复制\s*)?(分享\s*)?$/,
      /^(引用|点赞|点踩|收藏|下载)$/,
      /^(plain|text|json|javascript|typescript|python|bash|shell|yaml|yml|markdown|md|sql|html|css|xml|toml|ini|go|java|c\+\+|cpp|csharp|c#|rust|php|ruby|swift|kotlin|r)\s*(复制|copy)?$/i,
      /^(new chat|history|settings|login|sign in|upgrade|share|copy|retry|regenerate|stop)$/i,
      /^(kimi|moonshot)$/i,
    ];

    return async function run() {
      validateHost();
      await scrollPageForLazyContent();

      const candidates = collectTurnCandidates();
      const rawMessages = normalizeCandidates(candidates);
      const messages = groupConsecutiveMessages(rawMessages).map(({ role, content }, index) => ({ role, content, index }));
      const result = {
        platform: config.platform,
        strategy: 'visible-dom-open-shadow',
        title: document.title || undefined,
        url: location.href,
        captured_at: new Date().toISOString(),
        message_count: messages.length,
        raw_message_count: rawMessages.length,
        grouped_message_count: messages.length,
        messages,
        grouped_messages: messages.map(({ role, content }) => ({ role, content })),
        diagnostics: getDiagnostics(candidates),
        notes: [
          'This probe captures visible/loaded DOM content only.',
          'If the platform virtualizes old turns, scroll the conversation manually or improve this probe with an internal API path.',
        ],
      };

      await copyResult(result);
      log(`done: ${messages.length} messages from ${rawMessages.length} raw candidates`);
      return result;
    };

    function validateHost() {
      if (!config.allowedHosts.some((host) => location.hostname === host || location.hostname.endsWith(`.${host}`))) {
        throw new Error(`Current host ${location.hostname} is not supported by ${config.platform} probe.`);
      }
    }

    async function sleep(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function scrollPageForLazyContent() {
      const scrollTargets = getScrollTargets();
      for (const target of scrollTargets) {
        for (let pass = 0; pass < config.maxScrollPasses; pass += 1) {
          const before = getScrollTop(target);
          setScrollTop(target, 0);
          await sleep(config.settleMs);
          const afterTop = getScrollTop(target);
          setScrollTop(target, getScrollHeight(target));
          await sleep(config.settleMs);
          const afterBottom = getScrollTop(target);
          if (before === afterTop && before === afterBottom) break;
        }
      }
    }

    function getScrollTargets() {
      const all = [document.scrollingElement || document.documentElement, ...Array.from(document.querySelectorAll('*'))];
      return all
        .filter((element) => {
          if (!(element instanceof Element)) return false;
          const style = getComputedStyle(element);
          const canScroll = /(auto|scroll)/.test(`${style.overflowY}${style.overflow}`);
          return canScroll && element.scrollHeight > element.clientHeight + 200;
        })
        .slice(0, 8);
    }

    function getScrollTop(target) {
      return target === document.scrollingElement ? window.scrollY : target.scrollTop;
    }

    function setScrollTop(target, value) {
      if (target === document.scrollingElement || target === document.documentElement) {
        window.scrollTo(0, value);
      } else {
        target.scrollTop = value;
      }
    }

    function getScrollHeight(target) {
      return target === document.scrollingElement || target === document.documentElement
        ? document.documentElement.scrollHeight
        : target.scrollHeight;
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
          } catch {
            // Ignore platform selector drift.
          }
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

      const candidates = picked
        .map(({ element, role }) => ({
          element,
          role,
          content: extractText(element),
          top: getElementTop(element),
        }))
        .filter((item) => item.content);

      if (candidates.length) return removeNestedDuplicateBlocks(candidates);
      return collectReadableTextBlocks();
    }

    function inferRole(element) {
      const own = getElementSignature(element);
      if (/user|human|question|ask|mine|self/.test(own)) return 'user';
      if (/assistant|bot|answer|ai|markdown|response/.test(own)) return 'assistant';
      const parentSignature = getAncestorSignature(element, 4);
      if (/user|human|question|ask|mine|self/.test(parentSignature)) return 'user';
      if (/assistant|bot|answer|ai|markdown|response/.test(parentSignature)) return 'assistant';
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.left > window.innerWidth * 0.42 && rect.width < window.innerWidth * 0.72) return 'user';
      return 'assistant';
    }

    function collectReadableTextBlocks() {
      const root = document.querySelector('main') || document.body;
      if (!root) return [];
      const blockSelectors = [
        'article',
        'section',
        'div',
        'p',
        'li',
        'pre',
        '[data-testid]',
        '[class]',
      ];
      const elements = Array.from(root.querySelectorAll(blockSelectors.join(',')));
      const blocks = elements
        .filter(isVisibleTextBlock)
        .map((element) => ({
          element,
          role: inferRole(element),
          content: extractOwnReadableText(element),
          top: getElementTop(element),
        }))
        .filter((item) => item.content);

      return removeNestedDuplicateBlocks(blocks);
    }

    function isVisibleTextBlock(element) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 12) return false;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const text = extractOwnReadableText(element);
      if (text.length < 2 || text.length > 8000) return false;
      return hasConversationShape(element, text);
    }

    function hasConversationShape(element, text) {
      const signature = `${getElementSignature(element)} ${getAncestorSignature(element, 3)}`;
      if (/message|msg|chat|bubble|conversation|markdown|answer|question|content|segment|role|assistant|user/.test(signature)) {
        return true;
      }
      if (text.length >= 24 && /[。！？；，,.!?;:\n]|```|#{1,6}\s|\d+\./.test(text)) return true;
      return false;
    }

    function extractOwnReadableText(element) {
      const text = extractText(element);
      if (!text) return '';
      const childTexts = Array.from(element.children || [])
        .map((child) => cleanText(child.innerText || child.textContent || ''))
        .filter((childText) => childText && childText.length > 20);
      if (childTexts.some((childText) => childText === text)) return '';
      return text;
    }

    function removeNestedDuplicateBlocks(blocks) {
      const sorted = blocks
        .filter((item) => !isMostlyChromeText(item.content))
        .sort((a, b) => candidateScore(b) - candidateScore(a));
      const kept = [];

      for (const item of sorted) {
        const key = normalizeForCompare(item.content);
        if (!key) continue;
        const duplicate = kept.some((existing) => {
          const existingKey = normalizeForCompare(existing.content);
          return existingKey === key || containsSubstantialText(existingKey, key) || containsSubstantialText(key, existingKey);
        });
        if (!duplicate) kept.push(item);
      }

      return kept.sort((a, b) => a.top - b.top);
    }

    function candidateScore(item) {
      const textLength = normalizeForCompare(item.content).length;
      const signature = item.element ? `${getElementSignature(item.element)} ${getAncestorSignature(item.element, 3)}` : '';
      const roleScore = /data-role|assistant|user|human|message|chat|bubble|conversation/.test(signature) ? 2000 : 0;
      const innerBlockPenalty = /markdown-body|highlight|code|pre|segment/.test(signature) ? 1200 : 0;
      return Math.min(textLength, 4000) + roleScore - innerBlockPenalty;
    }

    function normalizeForCompare(text) {
      return cleanText(text)
        .replace(/\s+/g, '')
        .replace(/[,.，。:：;；!?！？'"“”‘’`]/g, '')
        .trim();
    }

    function containsSubstantialText(container, possibleChild) {
      if (!container || !possibleChild) return false;
      if (possibleChild.length < 12) return false;
      return container.includes(possibleChild) && possibleChild.length <= container.length * 0.92;
    }

    function isMostlyChromeText(text) {
      const lines = cleanText(text).split('\n').filter(Boolean);
      if (!lines.length) return true;
      const junkLines = lines.filter((line) => junkPatterns.some((pattern) => pattern.test(line)));
      if (junkLines.length / lines.length > 0.6) return true;
      return lines.length <= 2 && lines.join('').length <= 16 && junkLines.length > 0;
    }

    function getElementSignature(element) {
      return [
        element.getAttribute('data-role') || '',
        element.getAttribute('role') || '',
        element.getAttribute('aria-label') || '',
        element.getAttribute('data-testid') || '',
        element.id || '',
        typeof element.className === 'string' ? element.className : '',
      ].join(' ').toLowerCase();
    }

    function getAncestorSignature(element, maxDepth) {
      const parts = [];
      let current = element.parentElement;
      for (let depth = 0; current && depth < maxDepth; depth += 1) {
        parts.push(getElementSignature(current));
        current = current.parentElement;
      }
      return parts.join(' ');
    }

    function getDiagnostics(candidates) {
      return {
        candidate_count: candidates.length,
        visible_text_block_count: collectReadableTextBlocks().length,
        main_text_length: cleanText((document.querySelector('main') || document.body)?.innerText || '').length,
        class_hints: getClassHints(),
      };
    }

    function getClassHints() {
      const counts = new Map();
      const pattern = /message|msg|chat|bubble|conversation|markdown|answer|question|content|segment|role|assistant|user/i;
      document.querySelectorAll('[class]').forEach((element) => {
        String(element.className)
          .split(/\s+/)
          .filter((name) => pattern.test(name))
          .forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
      });
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([name, count]) => ({ name, count }));
    }

    function getElementTop(element) {
      const rect = element.getBoundingClientRect();
      return rect.top + window.scrollY;
    }

    function extractText(element) {
      const clone = element.cloneNode(true);
      clone.querySelectorAll?.('button, svg, nav, aside, input, textarea, [role="button"], [aria-hidden="true"], script, style').forEach((node) => node.remove());
      const text = clone.innerText || clone.textContent || '';
      return cleanText(text);
    }

    function cleanText(text) {
      const lines = text
        .replace(/\r\n/g, '\n')
        .replace(/\u00a0/g, ' ')
        .split('\n')
        .map((line) => line.trim().replace(/^(plain|text|json|javascript|typescript|python|bash|shell|yaml|yml|markdown|md|sql|html|css|xml|toml|ini|go|java|c\+\+|cpp|csharp|c#|rust|php|ruby|swift|kotlin|r)\s+(复制|copy)\s+/i, ''))
        .map((line) => line.replace(/\s*(编辑|复制|分享|引用)\s*$/g, '').trim())
        .filter(Boolean)
        .filter((line) => line.length > 1)
        .filter((line) => !junkPatterns.some((pattern) => pattern.test(line)));
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

    function groupConsecutiveMessages(messages) {
      const grouped = [];
      for (const message of messages) {
        const last = grouped[grouped.length - 1];
        if (last?.role === message.role) {
          last.content = `${last.content}\n\n${message.content}`.trim();
          last.indices.push(message.index);
        } else {
          grouped.push({ role: message.role, content: message.content, indices: [message.index] });
        }
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
