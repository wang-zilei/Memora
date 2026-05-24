/**
 * JSON 文件存储模块（Demo 替代 SQLite）
 * 三层存储：Raw → Clean → KnowledgeCard
 * 数据存储在 demo/data/ 目录下的 JSON 文件中
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 数据目录
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 数据文件路径
const DB_FILE = path.join(DATA_DIR, 'db.json');

// 生成 UUID
function uuid() {
  return crypto.randomUUID();
}

// 读取数据库
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load DB:', e.message);
  }
  return {
    rawConversations: {},
    cleanConversations: {},
    knowledgeCards: {},
    settings: {},
  };
}

// 保存数据库
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// ============ Raw Conversation 操作 ============

function saveRawConversation(data) {
  const db = loadDB();
  const id = uuid();
  const record = {
    id,
    platform: data.platform,
    conversationId: data.conversation_id || data.conversationId || data.session_id || null,
    title: data.title || null,
    url: data.url || null,
    messages: data.messages || [],
    capturedAt: data.captured_at || data.capturedAt || new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  db.rawConversations[id] = record;
  saveDB(db);
  return record;
}

function getRawConversation(id) {
  const db = loadDB();
  return db.rawConversations[id] || null;
}

// ============ Clean Conversation 操作 ============

function saveCleanConversation(data) {
  const db = loadDB();
  const id = uuid();
  const record = {
    id,
    rawId: data.rawId,
    platform: data.platform,
    conversationId: data.conversationId || null,
    title: data.title || null,
    url: data.url || null,
    messages: data.messages || [],
    capturedAt: data.capturedAt || new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  db.cleanConversations[id] = record;
  saveDB(db);
  return record;
}

// ============ Knowledge Card 操作 ============

function saveKnowledgeCard(data) {
  const db = loadDB();
  const id = uuid();
  const now = new Date().toISOString();
  const record = {
    id,
    rawId: data.rawId || null,
    cleanId: data.cleanId || null,
    title: data.title,
    card_type: data.card_type || '其他',
    original_question: data.original_question || data.originalQuestion || '',
    narrative: data.narrative || '',
    full_output: data.full_output || null,
    summarize_error: data.summarize_error || null,
    tags: data.tags || [],
    starred: data.starred || false,
    archived: data.archived || false,
    source: data.source,
    rawMessages: data.rawMessages || [],
    cleanMessages: data.cleanMessages || [],
    createdAt: now,
    updatedAt: now,
  };
  db.knowledgeCards[id] = record;
  saveDB(db);
  return record;
}

function getKnowledgeCards({ cardType, keyword, platform, starred, page = 1, pageSize = 20 } = {}) {
  const db = loadDB();
  let cards = Object.values(db.knowledgeCards);

  // 筛选
  if (cardType && cardType !== '全部') {
    cards = cards.filter(c => c.card_type === cardType);
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    cards = cards.filter(c =>
      (c.title || '').toLowerCase().includes(kw) ||
      (c.original_question || '').toLowerCase().includes(kw) ||
      (c.originalQuestion || '').toLowerCase().includes(kw) ||
      (c.narrative || '').toLowerCase().includes(kw) ||
      (c.tags || []).some(t => t.toLowerCase().includes(kw))
    );
  }
  if (platform) {
    cards = cards.filter(c => c.source?.platform === platform);
  }
  if (starred) {
    cards = cards.filter(c => c.starred);
  }

  // 排序（最新优先）
  cards.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = cards.length;
  const offset = (page - 1) * pageSize;
  const paged = cards.slice(offset, offset + pageSize).map(c => ({
    id: c.id,
    title: c.title,
    original_question: c.original_question || c.originalQuestion,
    card_type: c.card_type,
    tags: c.tags,
    source: c.source,
    summarize_error: c.summarize_error,
    starred: c.starred || false,
    archived: c.archived || false,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  return { total, page, pageSize, cards: paged };
}

function getKnowledgeCard(id) {
  const db = loadDB();
  return db.knowledgeCards[id] || null;
}

function updateKnowledgeCard(id, updates) {
  const db = loadDB();
  const card = db.knowledgeCards[id];
  if (!card) return null;

  if (updates.title !== undefined) card.title = updates.title;
  if (updates.card_type !== undefined) card.card_type = updates.card_type;
  if (updates.tags !== undefined) card.tags = updates.tags;
  if (updates.original_question !== undefined) card.original_question = updates.original_question;
  if (updates.narrative !== undefined) card.narrative = updates.narrative;
  if (updates.full_output !== undefined) card.full_output = updates.full_output;
  if (updates.summarize_error !== undefined) card.summarize_error = updates.summarize_error;
  // 兼容旧字段名
  if (updates.originalQuestion !== undefined) card.original_question = updates.originalQuestion;
  if (updates.insights !== undefined) card.narrative = updates.insights.join('\n') || '';
  if (updates.outputs !== undefined) card.full_output = updates.outputs.join('\n') || null;
  card.updatedAt = new Date().toISOString();

  saveDB(db);
  return card;
}

function deleteKnowledgeCard(id) {
  const db = loadDB();
  delete db.knowledgeCards[id];
  saveDB(db);
}

// ============ 标签聚合 ============

function getAllTags() {
  const db = loadDB();
  const cards = Object.values(db.knowledgeCards);
  const tagCounts = {};
  for (const c of cards) {
    for (const t of (c.tags || [])) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }
  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
}

// ============ 统计聚合 ============

function getStatistics() {
  const db = loadDB();
  const cards = Object.values(db.knowledgeCards);
  const byType = {};
  const byPlatform = {};
  const byTag = {};
  for (const c of cards) {
    byType[c.card_type] = (byType[c.card_type] || 0) + 1;
    const platform = c.source?.platform || 'unknown';
    byPlatform[platform] = (byPlatform[platform] || 0) + 1;
    for (const t of (c.tags || [])) {
      byTag[t] = (byTag[t] || 0) + 1;
    }
  }
  return { total: cards.length, byType, byPlatform, byTag };
}

// ============ Settings 操作 ============

function getSetting(key) {
  const db = loadDB();
  return db.settings[key] || null;
}

function setSetting(key, value) {
  const db = loadDB();
  db.settings[key] = value;
  saveDB(db);
  return { key, value };
}

function getAllSettings() {
  const db = loadDB();
  return { ...db.settings };
}

module.exports = {
  saveRawConversation,
  getRawConversation,
  saveCleanConversation,
  saveKnowledgeCard,
  getKnowledgeCards,
  getKnowledgeCard,
  updateKnowledgeCard,
  deleteKnowledgeCard,
  getSetting,
  setSetting,
  getAllSettings,
  getAllTags,
  getStatistics,
};
