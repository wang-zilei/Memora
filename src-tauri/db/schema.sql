-- PRD-v2 SQLite Schema
-- 数据库: SQLite (tauri-plugin-sql)

-- ============================================================
-- 1. Raw Conversation（原始抓取结果）
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_conversations (
    id              TEXT PRIMARY KEY,
    platform        TEXT NOT NULL,
    conversation_id TEXT,
    title           TEXT,
    url             TEXT,
    messages_json   TEXT NOT NULL,          -- JSON array of {role, content, timestamp}
    captured_at     TEXT NOT NULL,           -- ISO datetime
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 2. Clean Conversation（清洗后纯文本问答）
-- ============================================================
CREATE TABLE IF NOT EXISTS clean_conversations (
    id              TEXT PRIMARY KEY,
    raw_id          TEXT NOT NULL REFERENCES raw_conversations(id),
    platform        TEXT NOT NULL,
    conversation_id TEXT,
    title           TEXT,
    url             TEXT,
    messages_json   TEXT NOT NULL,           -- JSON array of {role, content}
    captured_at     TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 3. Knowledge Cards（知识卡片 — 对齐 PRD-v2 §5.6）
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_cards (
    id                      TEXT PRIMARY KEY,
    raw_id                  TEXT REFERENCES raw_conversations(id),
    clean_id                TEXT REFERENCES clean_conversations(id),

    title                   TEXT NOT NULL,
    original_question       TEXT DEFAULT '',
    card_type               TEXT NOT NULL DEFAULT 'other',  -- 10 个意图大类

    narrative               TEXT DEFAULT '',                -- 卡片叙事内容（主展示区）
    full_output             TEXT,                           -- 完整产出（content_creation / text_processing 专用）
    summarize_error         TEXT,                           -- 总结失败原因，null = 正常

    insights_json           TEXT DEFAULT '[]',              -- JSON array
    outputs_json            TEXT DEFAULT '[]',              -- JSON array
    tags_json               TEXT DEFAULT '[]',              -- JSON array (parent/child 层级标签)
    unresolved_questions_json TEXT DEFAULT '[]',            -- JSON array
    exploration_paths_json  TEXT DEFAULT '[]',              -- JSON array

    draft_of                TEXT,                           -- 终稿 card_id（草稿型特有）

    summary_confidence      REAL DEFAULT 0.0,

    source_platform         TEXT,
    source_url              TEXT,
    source_conversation_id  TEXT,
    source_captured_at      TEXT,

    raw_messages_json       TEXT,                           -- 原始对话
    clean_messages_json     TEXT,                           -- 清洗后对话

    -- 复习调度 (PRD-v2 §10.2)
    review_schedule_json    TEXT DEFAULT '{"intervals":[1,2,4,7,15,30],"review_history":[],"mastered":false}',

    -- 状态
    starred                 INTEGER NOT NULL DEFAULT 0,
    archived                INTEGER NOT NULL DEFAULT 0,

    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 搜索优化索引
CREATE INDEX IF NOT EXISTS idx_cards_card_type    ON knowledge_cards(card_type);
CREATE INDEX IF NOT EXISTS idx_cards_starred      ON knowledge_cards(starred) WHERE starred = 1;
CREATE INDEX IF NOT EXISTS idx_cards_archived     ON knowledge_cards(archived) WHERE archived = 0;
CREATE INDEX IF NOT EXISTS idx_cards_created      ON knowledge_cards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_review_date  ON knowledge_cards(review_schedule_json);

-- FTS 全文搜索
CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
    title,
    original_question,
    narrative,
    insights_json,
    outputs_json,
    clean_messages_json,
    content='knowledge_cards',
    content_rowid='rowid'
);

-- FTS 触发器
CREATE TRIGGER IF NOT EXISTS cards_fts_insert AFTER INSERT ON knowledge_cards BEGIN
    INSERT INTO cards_fts(rowid, title, original_question, narrative, insights_json, outputs_json, clean_messages_json)
    VALUES (new.rowid, new.title, new.original_question, new.narrative, new.insights_json, new.outputs_json, new.clean_messages_json);
END;

CREATE TRIGGER IF NOT EXISTS cards_fts_delete AFTER DELETE ON knowledge_cards BEGIN
    DELETE FROM cards_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS cards_fts_update AFTER UPDATE ON knowledge_cards BEGIN
    UPDATE cards_fts
    SET title = new.title,
        original_question = new.original_question,
        narrative = new.narrative,
        insights_json = new.insights_json,
        outputs_json = new.outputs_json,
        clean_messages_json = new.clean_messages_json
    WHERE rowid = new.rowid;
END;

-- ============================================================
-- 4. Settings（设置）
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);

-- ============================================================
-- 5. User Stats（用户统计 — streak、月度统计等）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_stats (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL,                -- JSON value
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 初始默认设置
INSERT OR IGNORE INTO settings (key, value) VALUES ('apiUrl', 'https://api.openai.com/v1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('model', 'gpt-4.1-nano');
INSERT OR IGNORE INTO settings (key, value) VALUES ('review_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('review_daily_limit', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('smart_reminder_enabled', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_capture_enabled', 'false');
