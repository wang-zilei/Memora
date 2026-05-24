// API 客户端 — 支持 HTTP (Demo) 和 Tauri invoke (Production) 两种模式
// 通过 VITE_API_MODE 环境变量切换：
//   - 'http': Demo 模式，通过 fetch 调用 Express 后端
//   - 'tauri': Tauri 模式，通过 invoke 调用 Rust commands

const API_MODE = import.meta.env.VITE_API_MODE || 'http';
const API_BASE = '/api';

// ============================================================
// 底层通信适配
// ============================================================

async function invoke(command: string, args: Record<string, any>) {
  // 动态导入 Tauri API，Vite 不应在编译时解析此模块
  // 使用字符串拼接避免 Vite 的静态分析捕获
  const tauriApiModule = await import(/* @vite-ignore */ '@tauri-apps/api/core');
  return tauriApiModule.invoke(command, args);
}

async function callAPI(path: string, options?: RequestInit) {
  if (API_MODE === 'tauri') {
    // Tauri 模式：路由到对应 command
    return callTauriCommand(path, options);
  }

  // HTTP 模式：标准 fetch
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '请求失败');
  return data;
}

async function callTauriCommand(path: string, options?: RequestInit) {
  // 解析路径和方法，路由到对应 Tauri command
  const method = options?.method || 'GET';
  const body = options?.body ? JSON.parse(options.body) : {};

  // POST /api/capture → capture_conversation
  if (path === '/capture' && method === 'POST') {
    return invoke('capture_conversation', { payload: body });
  }

  // GET /api/cards → get_cards
  if (path.startsWith('/cards') && method === 'GET') {
    const params = new URLSearchParams(path.split('?')[1] || '');
    return invoke('get_cards', {
      keyword: params.get('keyword') || undefined,
      page: params.get('page') ? parseInt(params.get('page')!) : undefined,
      page_size: params.get('pageSize') ? parseInt(params.get('pageSize')!) : undefined,
    });
  }

  // GET /api/cards/:id → get_card
  const cardIdMatch = path.match(/^\/cards\/([^/?]+)/);
  if (cardIdMatch && method === 'GET') {
    return invoke('get_card', { id: cardIdMatch[1] });
  }

  // PUT /api/cards/:id → update_card
  if (cardIdMatch && method === 'PUT') {
    return invoke('update_card', { id: cardIdMatch[1], ...body });
  }

  // DELETE /api/cards/:id → delete_card
  if (cardIdMatch && method === 'DELETE') {
    return invoke('delete_card', { id: cardIdMatch[1] });
  }

  // GET /api/settings → get_settings
  if (path === '/settings' && method === 'GET') {
    return invoke('get_settings', {});
  }

  // PUT /api/settings → update_settings
  if (path === '/settings' && method === 'PUT') {
    return invoke('update_settings', { updates: body });
  }

  throw new Error(`Unsupported API call: ${method} ${path}`);
}

// ============================================================
// 公开 API（与 Demo 保持兼容）
// ============================================================

// 卡片相关
export async function getCards(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return callAPI(`/cards${query}`);
}

export async function getCard(id: string) {
  return callAPI(`/cards/${id}`);
}

export async function updateCard(id: string, updates: Record<string, any>) {
  return callAPI(`/cards/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteCard(id: string) {
  return callAPI(`/cards/${id}`, { method: 'DELETE' });
}

export async function summarizeCard(id: string) {
  // Tauri 模式下暂无实现，后续添加 AI 总结 command
  return callAPI(`/cards/${id}/summarize`, { method: 'POST' });
}

// 捕获（扩展 → 桌面应用）
export async function captureConversation(payload: any) {
  return callAPI('/capture', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// 设置相关
export async function getSettings() {
  return callAPI('/settings');
}

export async function updateSettings(settings: Record<string, string>) {
  return callAPI('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// 状态检查
export async function getStatus() {
  return callAPI('/status');
}

// 标签聚合
export async function getTags() {
  return callAPI('/tags');
}

// 收藏卡片
export async function getStarredCards(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams({ ...params, starred: 'true' }).toString() : '?starred=true';
  return callAPI(`/cards${query}`);
}

// 统计数据
export async function getStatistics() {
  return callAPI('/statistics');
}
