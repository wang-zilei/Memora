/**
 * Popup 脚本
 */

const SERVER_URL = 'http://localhost:17321';

async function checkStatus() {
  const statusEl = document.getElementById('status');
  statusEl.className = 'status loading';
  statusEl.textContent = '检查后端连接中...';

  try {
    const res = await fetch(`${SERVER_URL}/api/status`);
    const data = await res.json();

    if (data.success) {
      statusEl.className = 'status ok';
      statusEl.innerHTML = `✅ 后端已连接 | API Key: ${data.hasApiKey ? '已配置' : '<b style="color:#c62828">未配置</b>'} | 卡片数: ${data.totalCards}`;
    } else {
      throw new Error(data.error);
    }
  } catch (e) {
    statusEl.className = 'status error';
    statusEl.innerHTML = `❌ 后端未连接<br><small>请运行: <code>npm run server</code></small>`;
  }
}

document.getElementById('checkStatus').addEventListener('click', checkStatus);

document.getElementById('openKB').addEventListener('click', () => {
  chrome.tabs.create({ url: `${SERVER_URL}` });
});

// 初始检查
checkStatus();
