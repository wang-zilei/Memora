/**
 * Gemini DOM 结构探测 v2
 * 已知 conversation-container 是外层包装，需要找内部消息元素
 * 使用方法：Gemini 对话页面 Console → 粘贴运行
 */

(function () {
  console.log('========== Gemini DOM 探测 v2 ==========\n');

  // ============ 1. 查找 conversation-container 内部的子结构 ============
  console.log('--- Step 1: conversation-container 内部结构 ---');
  const containers = document.querySelectorAll('.conversation-container');
  console.log('  .conversation-container 数量:', containers.length);

  if (containers.length > 0) {
    // 取第一个 container 看内部结构
    const first = containers[0];
    console.log('\n  [容器1] class:', first.className.slice(0, 120));
    console.log('  直接子元素:', first.children.length, '个');

    // 打印直接子元素的 tag + class + text preview
    Array.from(first.children).slice(0, 12).forEach((child, i) => {
      const tag = child.tagName;
      const cls = (child.className || '').slice(0, 80);
      const text = (child.innerText || '').slice(0, 80).replace(/\n/g, ' ');
      const attrs = [];
      ['data-role', 'data-testid', 'aria-label', 'role', 'ng-reflect-role'].forEach(a => {
        const v = child.getAttribute(a);
        if (v) attrs.push(`${a}="${v}"`);
      });
      console.log(`    child[${i}]: <${tag}> class="${cls}" ${attrs.join(' ')} | ${text}`);

      // 子元素的子元素
      if (child.children.length > 0 && child.children.length < 10) {
        Array.from(child.children).slice(0, 5).forEach((gc, j) => {
          const gText = (gc.innerText || '').slice(0, 60).replace(/\n/g, ' ');
          const gAttrs = [];
          ['data-role', 'aria-label'].forEach(a => {
            const v = gc.getAttribute(a);
            if (v) gAttrs.push(`${a}="${v}"`);
          });
          console.log(`      -> sub[${j}]: <${gc.tagName}> class="${(gc.className || '').slice(0, 60)}" ${gAttrs.join(' ')} | ${gText}`);
        });
      }
    });
  }

  // ============ 2. 查找包含 "你说" 或 "Gemini 说" 的元素 ============
  console.log('\n--- Step 2: 查找 "你说" / "Gemini" 模式 ---');

  // 查找所有包含文本的 div
  const allDivs = document.querySelectorAll('div');
  let userFound = 0;
  let aiFound = 0;
  allDivs.forEach(el => {
    const text = el.innerText || '';
    if (text.startsWith('你说') && text.length > 20 && el.children.length < 5) {
      if (userFound < 3) {
        console.log(`  [user candidate] <${el.tagName}> class="${(el.className || '').slice(0, 80)}"`);
        const attrs = [];
        ['data-role', 'aria-label', 'role', 'ng-reflect-role'].forEach(a => {
          const v = el.getAttribute(a);
          if (v) attrs.push(`${a}="${v}"`);
        });
        if (attrs.length) console.log(`    attrs: ${attrs.join(', ')}`);
        console.log(`    text: ${text.slice(0, 80)}`);
      }
      userFound++;
    }
    if (/Gemini 说/.test(text) && text.length > 20 && el.children.length < 5) {
      if (aiFound < 3) {
        console.log(`  [ai candidate] <${el.tagName}> class="${(el.className || '').slice(0, 80)}"`);
        const attrs = [];
        ['data-role', 'aria-label', 'role', 'ng-reflect-role'].forEach(a => {
          const v = el.getAttribute(a);
          if (v) attrs.push(`${a}="${v}"`);
        });
        if (attrs.length) console.log(`    attrs: ${attrs.join(', ')}`);
        console.log(`    text: ${text.slice(0, 80)}`);
      }
      aiFound++;
    }
  });
  console.log(`  总计: ${userFound} 个 "你说" 元素, ${aiFound} 个 "Gemini 说" 元素`);

  // ============ 3. 查找所有有 data-* 属性的消息相关元素 ============
  console.log('\n--- Step 3: 所有 data-* 属性（前30个非脚本元素） ---');
  const dataEls = document.querySelectorAll('[data-]');
  let shown = 0;
  for (const el of dataEls) {
    if (shown >= 30) break;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    const text = (el.innerText || '').slice(0, 50).replace(/\n/g, ' ');
    const cls = (el.className || '').slice(0, 50);
    const dataAttrs = [];
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-')) dataAttrs.push(`${attr.name}="${attr.value}"`);
    }
    if (text || cls) {
      console.log(`  <${el.tagName}> ${dataAttrs.join(' ')} | class="${cls}" | ${text}`);
    }
    shown++;
  }

  // ============ 4. 查找包含 "ng-" 前缀 class 的消息容器 ============
  console.log('\n--- Step 4: Angular 消息容器（含 ng- 的 class） ---');
  const ngEls = document.querySelectorAll('[class*="ng-star"], [class*="ng-tns"]');
  const ngClasses = new Map();
  ngEls.forEach(el => {
    const cls = (el.className || '');
    if (cls.length > 10 && cls.length < 150) {
      const key = cls.trim();
      ngClasses.set(key, (ngClasses.get(key) || 0) + 1);
    }
  });
  const sorted = [...ngClasses.entries()].sort((a, b) => b[1] - a[1]);
  sorted.slice(0, 15).forEach(([cls, count]) => {
    console.log(`  ${count}x: ${cls}`);
  });

  // ============ 5. 手动提取一轮对话 ============
  console.log('\n--- Step 5: 从 conversation-container 手动提取消息 ---');
  if (containers.length > 0) {
    const c = containers[0];
    // 尝试找到所有 text block 元素
    const textBlocks = c.querySelectorAll('p, div, span, chat-response, structured-content-container');
    const seen = new Set();
    const messages = [];

    for (const el of textBlocks) {
      if (seen.has(el)) continue;
      const text = (el.innerText || '').trim();
      if (!text || text.length < 10) continue;

      // 检查是否是外层容器
      let isLeaf = true;
      for (const other of textBlocks) {
        if (other !== el && el.contains(other) && other.innerText && other.innerText.trim().length > 10) {
          isLeaf = false;
          break;
        }
      }
      if (!isLeaf) continue;

      seen.add(el);
      messages.push({
        text: text.slice(0, 100).replace(/\n/g, ' '),
        tag: el.tagName,
        cls: (el.className || '').slice(0, 60),
        role: text.startsWith('你说') ? 'user' : (text.startsWith('Gemini') ? 'assistant' : 'unknown'),
      });
    }

    console.log(`  提取到 ${messages.length} 条消息:`);
    messages.slice(0, 10).forEach((m, i) => {
      console.log(`  [${i}] role=${m.role} | ${m.text}`);
    });
  }

  console.log('\n========== 探测完成 ==========');
})();
