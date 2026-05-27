/**
 * Gemini 抓取诊断脚本
 * 使用方法：打开 Gemini 对话页面 → F12 Console → 粘贴运行
 *
 * 输出：
 * 1. 各选择器匹配到的元素数量和 HTML 结构
 * 2. data-role / aria-label / className 的实际值
 * 3. 当前 inferRole 对每个元素的推断结果
 * 4. 最终提取的消息预览
 */

(function () {
  console.log('========== Gemini 抓取诊断 ==========\n');

  // 与 content.js 中 captureGemini 相同的选择器配置
  const selectors = {
    turns: [
      '[data-testid*="message"]',
      '[data-testid*="turn"]',
      '[data-turn-id]',
      '[class*="turn"]',
      '[class*="message"]',
      '[class*="chat-item"]',
      'main article',
    ],
    user: ['[data-role="user"]', '[class*="user"]', '[class*="human"]', '[class*="question"]'],
    assistant: ['[data-role="model"]', '[data-role="assistant"]', '[class*="assistant"]', '[class*="model"]', '[class*="bot"]', '[class*="answer"]', '[class*="markdown"]'],
  };

  const junkPatterns = [
    /^(新建|历史|探索|发现|设置|登录|注册|升级|会员|分享|复制|重新生成|停止生成|发送|展开|收起|编辑|删除)$/,
    /^(gemini|google)$/i,
    /^(new chat|history|settings|login|upgrade|share|copy|retry|regenerate|stop)$/i,
  ];

  // 1. 检查各选择器匹配情况
  console.log('--- Step 1: 选择器匹配 ---');
  for (const category of ['turns', 'user', 'assistant']) {
    for (const sel of selectors[category]) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        console.log(`  [${category}] ${sel} => ${els.length} 个`);
        // 打印前 2 个元素的属性
        for (let i = 0; i < Math.min(2, els.length); i++) {
          const el = els[i];
          const attrs = ['data-testid', 'data-role', 'data-turn-id', 'aria-label', 'role'];
          const classList = el.className;
          console.log(`    [${i}] tag=${el.tagName}, class="${(typeof classList === 'string' ? classList : el.getAttribute('class') || '').slice(0, 80)}"`);
          console.log(`        data-role=${el.getAttribute('data-role')}, aria-label=${el.getAttribute('aria-label')}`);
          attrs.forEach(a => {
            const v = el.getAttribute(a);
            if (v) console.log(`        ${a}="${v}"`);
          });
        }
      }
    }
  }

  // 2. 检查 data-role 属性分布
  console.log('\n--- Step 2: data-role 属性分布 ---');
  const allEls = document.querySelectorAll('[data-role]');
  const roleCounts = {};
  allEls.forEach(el => {
    const r = el.getAttribute('data-role');
    roleCounts[r] = (roleCounts[r] || 0) + 1;
  });
  console.log('  [data-role] 分布:', JSON.stringify(roleCounts));

  // 3. 检查 aria-label 分布
  console.log('\n--- Step 3: aria-label 分布（前10） ---');
  const ariaEls = document.querySelectorAll('[aria-label]');
  const ariaLabels = new Set();
  ariaEls.forEach(el => ariaLabels.add(el.getAttribute('aria-label')));
  [...ariaLabels].slice(0, 10).forEach(l => console.log('  ' + l));

  // 4. 测试 inferRole 逻辑
  console.log('\n--- Step 4: inferRole 推断测试 ---');
  const turnElements = [...document.querySelectorAll('[data-testid*="message"]'), ...document.querySelectorAll('[data-testid*="turn"]'), ...document.querySelectorAll('[data-turn-id]'), ...document.querySelectorAll('[class*="turn"]'), ...document.querySelectorAll('[class*="message"]'), ...document.querySelectorAll('[class*="chat-item"]'), ...document.querySelectorAll('main article')];
  // 去重
  const seen = new Set();
  const unique = [];
  for (const el of turnElements) {
    if (!seen.has(el)) {
      seen.add(el);
      unique.push(el);
    }
  }
  console.log(`  匹配到 ${unique.length} 个 turn 元素`);

  unique.slice(0, 10).forEach((el, i) => {
    const dataRole = el.getAttribute('data-role') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const className = (el.className || '').toLowerCase();
    const own = `${dataRole} ${ariaLabel} ${className}`.toLowerCase();
    const rect = el.getBoundingClientRect();

    let inferred;
    if (/user|human|question|ask|mine|self/.test(own)) inferred = 'user';
    else if (/assistant|bot|answer|ai|markdown|response|agent/.test(own)) inferred = 'assistant';
    else if (rect.left > window.innerWidth * 0.42 && rect.width < window.innerWidth * 0.72) inferred = 'user';
    else inferred = 'assistant';

    const content = (el.innerText || '').slice(0, 60).replace(/\n/g, ' ');
    console.log(`  [${i}] rect: left=${Math.round(rect.left)}, width=${Math.round(rect.width)} => role=${inferred} | ${content}`);
    console.log(`      data-role="${dataRole}", aria-label="${ariaLabel}", class="${(el.className || '').slice(0, 60)}"`);
  });

  // 5. 测试文本提取
  console.log('\n--- Step 5: 文本提取测试（前3个turn元素） ---');
  function extractText(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll?.('button, svg, nav, aside, input, textarea, [role="button"], [aria-hidden="true"], script, style').forEach(node => node.remove());
    return cleanText(clone.innerText || clone.textContent || '');
  }
  function cleanText(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/ /g, ' ').split('\n').map(l => l.trim()).filter(Boolean).filter(l => l.length > 1).filter(l => !junkPatterns.some(p => p.test(l)));
    return [...new Set(lines)].join('\n').trim();
  }

  unique.slice(0, 3).forEach((el, i) => {
    const text = extractText(el);
    console.log(`  [${i}] (${text.split('\n').length}行, ${text.length}字符)`);
    console.log(`      ${text.slice(0, 120)}`);
  });

  console.log('\n========== 诊断完成 ==========');
})();
