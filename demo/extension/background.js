/**
 * Background Service Worker
 * 接收 content script 的抓取结果，发送到 Memora 客户端
 */

const SERVER_URL = 'http://localhost:17321';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_SUBMIT') {
    handleCaptureSubmit(message.data)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'CHECK_STATUS') {
    checkServerStatus()
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function handleCaptureSubmit(data) {
  console.log('[Background] 收到抓取数据:', data.platform, data.messages?.length, '条消息');

  const response = await fetch(`${SERVER_URL}/api/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Memora 客户端返回错误: ${response.status}`);
  }

  const result = await response.json();
  console.log('[Background] Memora 客户端处理结果:', result.message);
  return result;
}

async function checkServerStatus() {
  try {
    const response = await fetch(`${SERVER_URL}/api/status`, { method: 'GET' });
    return await response.json();
  } catch (error) {
    return { success: false, error: '无法连接到 Memora 客户端，请确保桌面客户端已启动' };
  }
}
