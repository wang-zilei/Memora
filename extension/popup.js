/**
 * Popup 脚本
 */

const SERVER_URL = 'http://localhost:17321';

async function checkStatus() {
  const statusEl = document.getElementById('status');
  statusEl.className = 'status loading';
  statusEl.textContent = '检查 Memora 客户端连接中...';

  try {
    const res = await fetch(`${SERVER_URL}/api/status`);
    const data = await res.json();

    if (data.success) {
      const hasApiKey = data.hasApiKey ?? data.has_api_key ?? false;
      const totalCards = data.totalCards ?? data.total_cards ?? data.card_count ?? 0;
      statusEl.className = 'status ok';
      statusEl.innerHTML = `✅ Memora 客户端已连接 | API Key: ${hasApiKey ? '已配置' : '<b style="color:#c62828">未配置</b>'} | 卡片数: ${totalCards}`;
    } else {
      throw new Error(data.error);
    }
  } catch (e) {
    statusEl.className = 'status error';
    statusEl.innerHTML = `❌ Memora 客户端未连接<br><small>请先启动桌面客户端，再重新检查连接</small>`;
  }
}

document.getElementById('checkStatus').addEventListener('click', checkStatus);

// 初始检查
checkStatus();
