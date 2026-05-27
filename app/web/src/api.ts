// API 客户端 — 支持 HTTP (Demo) 和 Tauri invoke (Production) 两种模式
// 通过 VITE_API_MODE 环境变量切换：
//   - 'http': Demo 模式，通过 fetch 调用 Express 后端
//   - 'tauri': Tauri 模式，通过 invoke 调用 Rust commands

import { invoke as tauriInvoke } from '@tauri-apps/api/core';

const isTauriRuntime =
  typeof window !== 'undefined' &&
  Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

const API_MODE = import.meta.env.VITE_API_MODE || (isTauriRuntime ? 'tauri' : 'http');
const API_BASE = '/api';

// ============================================================
// 底层通信适配
// ============================================================

async function invoke(command: string, args: Record<string, any>) {
  return tauriInvoke(command, args);
}

function normalizeCardDetailResponse(data: any) {
  if (!data?.card) return data;
  return {
    ...data,
    card: {
      ...data.card,
      rawMessages: data.card.rawMessages ?? data.card.raw_messages ?? [],
      cleanMessages: data.card.cleanMessages ?? data.card.clean_messages ?? [],
    },
  };
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
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error(`服务返回了非 JSON 内容，请确认 Memora 后端已启动。响应开头：${text.slice(0, 80)}`);
  }
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '请求失败');
  return data;
}

async function callTauriCommand(path: string, options?: RequestInit) {
  // 解析路径和方法，路由到对应 Tauri command
  const method = options?.method || 'GET';
  const body = options?.body ? JSON.parse(options.body) : {};
  const cardIdMatch = path.match(/^\/cards\/([^/?]+)/);

  // POST /api/capture → capture_conversation
  if (path === '/capture' && method === 'POST') {
    return invoke('capture_conversation', { payload: body });
  }

  // GET /api/cards → get_cards
  if ((path === '/cards' || path.startsWith('/cards?')) && method === 'GET') {
    const params = new URLSearchParams(path.split('?')[1] || '');
    return invoke('get_cards', {
      cardType: params.get('card_type') || undefined,
      keyword: params.get('keyword') || undefined,
      tag: params.get('tag') || undefined,
      starred: params.get('starred') ? params.get('starred') === 'true' : undefined,
      page: params.get('page') ? parseInt(params.get('page')!) : undefined,
      pageSize: params.get('pageSize') ? parseInt(params.get('pageSize')!) : undefined,
    });
  }

  if (cardIdMatch && path.endsWith('/summarize') && method === 'POST') {
    const settings = await invoke('get_settings', {}) as any;
    const values = settings.settings || {};
    if (!values._hasApiKey && !values.apiKey) {
      throw new Error('请先在设置中配置 API Key');
    }
    return invoke('summarize_card', {
      id: cardIdMatch[1],
      apiKey: body.apiKey || values.apiKey || '',
      apiUrl: body.apiUrl || values.apiUrl || 'https://api.openai.com/v1',
      model: body.model || values.model || 'gpt-4.1-nano',
    });
  }

  // GET /api/cards/:id → get_card
  if (cardIdMatch && method === 'GET') {
    const data = await invoke('get_card', { id: cardIdMatch[1] });
    return normalizeCardDetailResponse(data);
  }

  // PUT /api/cards/:id → update_card
  if (cardIdMatch && method === 'PUT') {
    const data = await invoke('update_card', {
      id: cardIdMatch[1],
      title: body.title,
      cardType: body.card_type,
      tags: body.tags,
      starred: body.starred,
      archived: body.archived,
      narrative: body.narrative,
      unresolvedQuestions: body.unresolved_questions,
    });
    return normalizeCardDetailResponse(data);
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

  // POST /api/settings/validate → validate_settings
  if (path === '/settings/validate' && method === 'POST') {
    return invoke('validate_settings', { settings: body });
  }

  if (path === '/status' && method === 'GET') {
    const status = await invoke('get_status', {}) as any;
    return {
      ...status,
      totalCards: status.totalCards ?? status.card_count ?? 0,
      hasApiKey: status.hasApiKey ?? status.has_api_key ?? false,
    };
  }

  if (path === '/tags' && method === 'GET') {
    return invoke('get_tags', {});
  }

  if (path === '/statistics' && method === 'GET') {
    const stats = await invoke('get_statistics', {}) as any;
    return {
      success: stats.success,
      total: stats.total ?? stats.total_cards ?? 0,
      byType: stats.byType ?? stats.by_type ?? {},
      byPlatform: stats.byPlatform ?? stats.by_platform ?? {},
      byTag: stats.byTag ?? stats.by_tag ?? {},
    };
  }

  if (path === '/open-url' && method === 'POST') {
    return invoke('open_url', { url: body.url });
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

export async function testSettingsConnection(settings: {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
}) {
  return callAPI('/settings/validate', {
    method: 'POST',
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

export async function openSourceUrl(url: string) {
  return callAPI('/open-url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}
