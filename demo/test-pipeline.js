/**
 * 测试脚本：模拟扩展抓取数据，验证 4 步 Pipeline
 * 用法：node test-pipeline.js
 */

const http = require('http');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const options = {
      hostname: 'localhost',
      port: 17321,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`Invalid JSON: ${body}`)); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function post(path, body) { return request('POST', path, body); }
function put(path, body) { return request('PUT', path, body); }

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:17321${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`Invalid JSON: ${body}`)); }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('=== 测试 1: 配置 API Key ===');
  const settings = await put('/api/settings', {
    apiKey: 'sk-6445199a59e641d183a3343ada6be69c',
    apiUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  });
  console.log('设置:', JSON.stringify(settings));

  console.log('\n=== 测试 2: 单话题抓取（概念理解型） ===');
  const capture1 = await post('/api/capture', {
    platform: 'deepseek',
    conversationId: 'test-single-topic',
    title: 'Python GIL 机制',
    url: 'https://example.com/chat/1',
    capturedAt: new Date().toISOString(),
    messages: [
      { role: 'user', content: 'Python 多线程为什么不能真正并行？GIL 到底是什么？' },
      { role: 'assistant', content: 'GIL（全局解释器锁）是 CPython 解释器中的一个互斥锁。它确保同一时刻只有一个线程执行 Python 字节码。Python 不能真正并行的原因是：CPython 的内存管理使用了引用计数，而引用计数不是线程安全的。如果允许多个线程同时操作引用计数，会导致内存泄漏或程序崩溃。' },
      { role: 'user', content: '那是不是意味着 Python 多线程完全没用？' },
      { role: 'assistant', content: '不是的！GIL 主要在 CPU 密集任务时才成为瓶颈。对于 I/O 密集型任务（网络请求、文件读写等），线程在等待 I/O 时会自动释放 GIL。简单总结：CPU 密集型任务用 multiprocessing，I/O 密集型任务用 threading 或 asyncio。' },
    ],
  });
  console.log('抓取结果:', JSON.stringify(capture1, null, 2));

  if (capture1.cardId) {
    console.log('\n=== 查看卡片详情 ===');
    const card = await get('/api/cards/' + capture1.cardId);
    console.log('标题:', card.card.title);
    console.log('意图:', card.card.card_type);
    console.log('原始问题:', card.card.original_question);
    console.log('叙事:', card.card.narrative);
    console.log('标签:', JSON.stringify(card.card.tags));
  }

  console.log('\n=== 测试 3: 多话题抓取（切分 + 不同意图） ===');
  const capture2 = await post('/api/capture', {
    platform: 'deepseek',
    conversationId: 'test-multi-topic',
    title: '多话题对话',
    url: 'https://example.com/chat/2',
    capturedAt: new Date().toISOString(),
    messages: [
      { role: 'user', content: 'JavaScript 的闭包是什么？能举个例子吗？' },
      { role: 'assistant', content: '闭包是指一个函数能够记住并访问它的词法作用域，即使这个函数在其词法作用域外部执行。例如：\n```js\nfunction outer() {\n  let count = 0;\n  return function() { return ++count; };\n}\nconst counter = outer();\nconsole.log(counter()); // 1\n```\n这里的 inner 函数记住了 outer 的作用域。' },
      { role: 'user', content: '明白了，谢谢！对了，帮我写一个 Python 的快速排序函数吧' },
      { role: 'assistant', content: '```python\ndef quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[len(arr) // 2]\n    left = [x for x in arr if x < pivot]\n    middle = [x for x in arr if x == pivot]\n    right = [x for x in arr if x > pivot]\n    return quicksort(left) + middle + quicksort(right)\n```' },
      { role: 'user', content: '好的。另外，我心情不太好，能陪我聊聊天吗？' },
      { role: 'assistant', content: '当然可以，我很乐意陪你聊聊。发生什么事了？有时候说出来会好受一些。' },
    ],
  });
  console.log('抓取结果:', JSON.stringify(capture2, null, 2));

  console.log('\n=== Pipeline 验证完成 ===');
  console.log('测试通过！');
}

run().catch(err => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
