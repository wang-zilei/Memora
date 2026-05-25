#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool, sqlite::SqlitePoolOptions};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

/// Application state holding the SQLite connection pool
struct AppState {
    db: SqlitePool,
}

// Aliases for clarity
type SqliteRow = sqlx::sqlite::SqliteRow;

// ============================================================
// Types (对齐 PRD-v2 数据模型)
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawConversation {
    pub platform: String,
    pub conversation_id: String,
    pub title: Option<String>,
    pub url: String,
    pub messages: Vec<Message>,
    pub captured_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeCardSummary {
    pub id: String,
    pub title: String,
    pub original_question: String,
    pub card_type: String,
    pub tags: Vec<String>,
    pub source: CardSource,
    pub summary_confidence: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
    pub starred: bool,
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardSource {
    pub platform: String,
    pub url: Option<String>,
    pub conversation_id: Option<String>,
    pub captured_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeCardDetail {
    pub id: String,
    pub title: String,
    pub original_question: String,
    pub card_type: String,
    pub tags: Vec<String>,
    pub source: CardSource,
    pub summary_confidence: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
    pub starred: bool,
    pub archived: bool,
    pub insights: Vec<String>,
    pub outputs: Vec<String>,
    pub unresolved_questions: Vec<String>,
    pub exploration_paths: Vec<String>,
    pub review_schedule: ReviewSchedule,
    pub raw_messages: Vec<Message>,
    pub clean_messages: Vec<Message>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSchedule {
    pub intervals: Vec<u32>,
    pub review_history: Vec<ReviewHistoryEntry>,
    pub mastered: bool,
    pub next_review_date: Option<String>,
    pub review_material: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewHistoryEntry {
    pub date: String,
    pub interval: u32,
    pub acknowledged: bool,
}

// ============================================================
// Response types
// ============================================================

#[derive(Debug, Serialize)]
pub struct CaptureResponse {
    pub success: bool,
    pub message: String,
    pub card_id: String,
    pub needs_api_key: bool,
}

#[derive(Debug, Serialize)]
pub struct CardsListResponse {
    pub success: bool,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub cards: Vec<KnowledgeCardSummary>,
}

#[derive(Debug, Serialize)]
pub struct CardDetailResponse {
    pub success: bool,
    pub card: KnowledgeCardDetail,
}

#[derive(Debug, Serialize)]
pub struct SettingsResponse {
    pub success: bool,
    pub settings: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize)]
pub struct TagItem {
    pub tag: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct TagsResponse {
    pub success: bool,
    pub tags: Vec<TagItem>,
}

#[derive(Debug, Serialize)]
pub struct StatisticsResponse {
    pub success: bool,
    pub total_cards: i64,
    pub by_type: std::collections::HashMap<String, i64>,
    pub by_platform: std::collections::HashMap<String, i64>,
    pub this_month: i64,
    pub starred_count: i64,
}

// ============================================================
// DB helpers
// ============================================================

/// Run schema SQL on setup
async fn init_db(pool: &SqlitePool) -> Result<(), String> {
    let schema = include_str!("../db/schema.sql");

    // Split on ';' that is NOT inside a trigger body (BEGIN ... END)
    let mut statements: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_trigger = false;

    for line in schema.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("CREATE TRIGGER") {
            in_trigger = true;
        }

        if trimmed == "END;" && in_trigger {
            current.push_str(line);
            current.push(';');
            statements.push(current.trim().to_string());
            current.clear();
            in_trigger = false;
            continue;
        }

        if in_trigger {
            current.push_str(line);
            current.push('\n');
        } else if trimmed.contains(';') {
            current.push_str(trimmed);
            let parts: Vec<String> = current.split(';').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            statements.extend(parts);
            if !trimmed.ends_with(';') {
                let last = trimmed.split(';').last().unwrap_or("").trim();
                current = last.to_string();
            } else {
                current.clear();
            }
        } else {
            current.push_str(line);
            current.push('\n');
        }
    }

    // Handle remaining
    let remaining = current.trim();
    if !remaining.is_empty() {
        statements.push(remaining.to_string());
    }

    for (i, stmt) in statements.iter().enumerate() {
        sqlx::query(stmt)
            .execute(pool)
            .await
            .map_err(|e| format!("Statement #{} failed: {}\nSQL: {}", i + 1, e, &stmt[..stmt.len().min(120)]))?;
    }
    tracing::info!("Schema initialized with {} statements", statements.len());
    Ok(())
}

/// Helper: safe str extraction from typed row
fn get_str(row: &SqliteRow, col: &str) -> String {
    row.try_get::<Option<String>, &str>(col)
        .ok()
        .flatten()
        .unwrap_or_default()
}

fn get_i64(row: &SqliteRow, col: &str) -> i64 {
    row.try_get::<Option<i64>, &str>(col).unwrap_or(None).unwrap_or(0)
}

fn get_f64(row: &SqliteRow, col: &str) -> Option<f64> {
    row.try_get::<Option<f64>, &str>(col).ok().flatten()
}

fn get_json_arr(row: &SqliteRow, col: &str) -> Vec<String> {
    let s: Option<String> = row.try_get::<Option<String>, &str>(col).ok().flatten();
    s.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

/// Parse a summary card from a DB row
fn parse_card_from_row(row: &SqliteRow) -> KnowledgeCardSummary {
    KnowledgeCardSummary {
        id: get_str(row, "id"),
        title: get_str(row, "title"),
        original_question: get_str(row, "original_question"),
        card_type: get_str(row, "card_type"),
        tags: get_json_arr(row, "tags_json"),
        source: CardSource {
            platform: get_str(row, "source_platform"),
            url: get_str(row, "source_url").if_empty_then_none(),
            conversation_id: get_str(row, "source_conversation_id").if_empty_then_none(),
            captured_at: get_str(row, "source_captured_at"),
        },
        summary_confidence: get_f64(row, "summary_confidence"),
        created_at: get_str(row, "created_at"),
        updated_at: get_str(row, "updated_at"),
        starred: get_i64(row, "starred") != 0,
        archived: get_i64(row, "archived") != 0,
    }
}

trait StringExt {
    fn if_empty_then_none(self) -> Option<String>;
}

impl StringExt for String {
    fn if_empty_then_none(self) -> Option<String> {
        if self.is_empty() { None } else { Some(self) }
    }
}

/// Parse a full detail card from a DB row
fn parse_detail_from_row(row: &SqliteRow) -> Result<CardDetailResponse, String> {
    let summary = parse_card_from_row(row);

    let review_schedule: ReviewSchedule = get_str(row, "review_schedule_json")
        .parse_json()
        .unwrap_or_else(|| ReviewSchedule {
            intervals: vec![1, 2, 4, 7, 15, 30],
            review_history: vec![],
            mastered: false,
            next_review_date: None,
            review_material: None,
        });

    let raw_messages: Vec<Message> =
        get_str(row, "raw_messages_json").parse_json().unwrap_or_default();

    let clean_messages: Vec<Message> =
        get_str(row, "clean_messages_json").parse_json().unwrap_or_default();

    Ok(CardDetailResponse {
        success: true,
        card: KnowledgeCardDetail {
            id: summary.id,
            title: summary.title,
            original_question: summary.original_question,
            card_type: summary.card_type,
            tags: summary.tags,
            source: summary.source,
            summary_confidence: summary.summary_confidence,
            created_at: summary.created_at,
            updated_at: summary.updated_at,
            starred: summary.starred,
            archived: summary.archived,
            insights: get_json_arr(row, "insights_json"),
            outputs: get_json_arr(row, "outputs_json"),
            unresolved_questions: get_json_arr(row, "unresolved_questions_json"),
            exploration_paths: get_json_arr(row, "exploration_paths_json"),
            review_schedule,
            raw_messages,
            clean_messages,
        },
    })
}

trait JsonParse {
    fn parse_json<T: serde::de::DeserializeOwned>(self) -> Option<T>;
}

impl JsonParse for String {
    fn parse_json<T: serde::de::DeserializeOwned>(self) -> Option<T> {
        serde_json::from_str(&self).ok()
    }
}

// ============================================================
// Tauri Commands — Capture
// ============================================================

/// Core capture logic — reusable by both Tauri command and HTTP handler
async fn do_capture(pool: &SqlitePool, payload: &RawConversation) -> Result<CaptureResponse, String> {
    let card_id = Uuid::new_v4().to_string();
    let raw_id = Uuid::new_v4().to_string();
    let clean_id = Uuid::new_v4().to_string();

    let raw_json = serde_json::to_string(&payload.messages).map_err(|e| e.to_string())?;
    let title = payload.title.clone().unwrap_or_else(|| "未命名对话".to_string());
    let default_tags = serde_json::to_string(&vec![payload.platform.clone()]).unwrap_or_default();
    let review_json = r#"{"intervals":[1,2,4,7,15,30],"review_history":[],"mastered":false}"#;

    // 1. Save raw
    sqlx::query(
        "INSERT INTO raw_conversations (id, platform, conversation_id, title, url, messages_json, captured_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(&raw_id)
    .bind(&payload.platform)
    .bind(&payload.conversation_id)
    .bind(&title)
    .bind(&payload.url)
    .bind(&raw_json)
    .bind(&payload.captured_at)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 2. Save clean
    sqlx::query(
        "INSERT INTO clean_conversations (id, raw_id, platform, conversation_id, title, url, messages_json, captured_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
    .bind(&clean_id)
    .bind(&raw_id)
    .bind(&payload.platform)
    .bind(&payload.conversation_id)
    .bind(&title)
    .bind(&payload.url)
    .bind(&raw_json)
    .bind(&payload.captured_at)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 3. Create card (pending summary)
    sqlx::query(
        "INSERT INTO knowledge_cards (id, raw_id, clean_id, title, original_question, card_type, tags_json, review_schedule_json, source_platform, source_url, source_conversation_id, source_captured_at, raw_messages_json, clean_messages_json) VALUES (?1, ?2, ?3, ?4, '', 'other', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
    )
    .bind(&card_id)
    .bind(&raw_id)
    .bind(&clean_id)
    .bind(&title)
    .bind(&default_tags)
    .bind(&review_json)
    .bind(&payload.platform)
    .bind(&payload.url)
    .bind(&payload.conversation_id)
    .bind(&payload.captured_at)
    .bind(&raw_json)
    .bind(&raw_json)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(CaptureResponse {
        success: true,
        message: "对话已抓取并保存".to_string(),
        card_id,
        needs_api_key: true,
    })
}

#[tauri::command]
async fn capture_conversation(
    app: AppHandle,
    payload: RawConversation,
) -> Result<CaptureResponse, String> {
    let state = app.state::<AppState>();
    do_capture(&state.db, &payload).await
}

// ============================================================
// Tauri Commands — Cards CRUD
// ============================================================

#[tauri::command]
async fn get_cards(
    app: AppHandle,
    card_type: Option<String>,
    keyword: Option<String>,
    tag: Option<String>,
    starred: Option<bool>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<CardsListResponse, String> {
    let state = app.state::<AppState>();
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(20);

    let mut where_clauses: Vec<String> = vec!["archived = 0".to_string()];
    let mut params: Vec<serde_json::Value> = vec![];

    if let Some(ref ct) = card_type {
        if ct != "全部" {
            where_clauses.push("card_type = ?".to_string());
            params.push(serde_json::Value::String(ct.clone()));
        }
    }
    if let Some(ref kw) = keyword {
        where_clauses.push("(title LIKE ? OR original_question LIKE ?)".to_string());
        let like = format!("%{}%", kw);
        params.push(serde_json::Value::String(like.clone()));
        params.push(serde_json::Value::String(like));
    }
    if let Some(ref t) = tag {
        where_clauses.push("tags_json LIKE ?".to_string());
        params.push(serde_json::Value::String(format!("%\"{}\"%", t)));
    }
    if let Some(s) = starred {
        if s {
            where_clauses.push("starred = 1".to_string());
        }
    }

    let where_sql = where_clauses.join(" AND ");
    let count_query = format!("SELECT COUNT(*) as cnt FROM knowledge_cards WHERE {}", where_sql);
    let total: i64 = sqlx::query_scalar(&count_query)
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    let select_cols = "id, title, original_question, card_type, tags_json, source_platform, source_url, source_conversation_id, source_captured_at, summary_confidence, created_at, updated_at, starred, archived";
    let list_query = format!(
        "{} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        format!("SELECT {} FROM knowledge_cards WHERE {}", select_cols, where_sql)
    );

    let mut q = sqlx::query(&list_query);
    for v in &params {
        q = bind_json(q, v);
    }
    q = q.bind(page_size).bind((page - 1) * page_size);

    let rows = q.fetch_all(&state.db).await.map_err(|e| e.to_string())?;
    let cards: Vec<KnowledgeCardSummary> = rows.iter().map(parse_card_from_row).collect();

    Ok(CardsListResponse {
        success: true,
        total,
        page,
        page_size,
        cards,
    })
}

/// Bind a JSON value as a query parameter.
/// Returns a query builder that needs to be further chained.
fn bind_json<'q>(
    mut q: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    v: &serde_json::Value,
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    match v {
        serde_json::Value::String(s) => {
            let s = s.clone();
            q = q.bind(s);
        }
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                q = q.bind(i);
            } else if let Some(f) = n.as_f64() {
                q = q.bind(f);
            } else {
                q = q.bind(0i64);
            }
        }
        serde_json::Value::Bool(b) => {
            q = q.bind(if *b { 1i64 } else { 0i64 });
        }
        serde_json::Value::Null => {
            q = q.bind(None::<String>);
        }
        serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
            let s = v.to_string();
            q = q.bind(s);
        }
    }
    q
}

#[tauri::command]
async fn get_card(app: AppHandle, id: String) -> Result<CardDetailResponse, String> {
    let state = app.state::<AppState>();
    let rows = sqlx::query("SELECT * FROM knowledge_cards WHERE id = ?")
        .bind(&id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        return Err("卡片不存在".to_string());
    }

    parse_detail_from_row(&rows[0])
}

#[tauri::command]
async fn update_card(
    app: AppHandle,
    id: String,
    title: Option<String>,
    tags: Option<Vec<String>>,
    starred: Option<bool>,
    archived: Option<bool>,
) -> Result<CardDetailResponse, String> {
    let state = app.state::<AppState>();

    let mut set_clauses = Vec::new();
    let mut params: Vec<serde_json::Value> = vec![];

    if let Some(t) = title {
        set_clauses.push("title = ?".to_string());
        params.push(serde_json::Value::String(t));
    }
    if let Some(ref t) = tags {
        set_clauses.push("tags_json = ?".to_string());
        params.push(serde_json::to_value(t).unwrap());
    }
    if let Some(s) = starred {
        set_clauses.push("starred = ?".to_string());
        params.push(serde_json::Value::Number(serde_json::Number::from(if s { 1 } else { 0 })));
    }
    if let Some(a) = archived {
        set_clauses.push("archived = ?".to_string());
        params.push(serde_json::Value::Number(serde_json::Number::from(if a { 1 } else { 0 })));
    }

    if !set_clauses.is_empty() {
        set_clauses.push("updated_at = datetime('now')".to_string());
        params.push(serde_json::Value::String(id.clone()));

        let sql = format!(
            "UPDATE knowledge_cards SET {} WHERE id = ?",
            set_clauses.join(", ")
        );

        let mut q = sqlx::query(&sql);
        for v in &params {
            q = bind_json(q, v);
        }
        q.execute(&state.db).await.map_err(|e| e.to_string())?;
    }

    get_card(app, id).await
}

#[tauri::command]
async fn delete_card(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let state = app.state::<AppState>();
    sqlx::query("DELETE FROM knowledge_cards WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
async fn search_cards(
    app: AppHandle,
    keyword: String,
) -> Result<CardsListResponse, String> {
    let state = app.state::<AppState>();

    // Try FTS first
    let fts_result = sqlx::query(
        "SELECT rowid FROM cards_fts WHERE cards_fts MATCH ? ORDER BY rank",
    )
    .bind(&keyword)
    .fetch_all(&state.db)
    .await;

    if let Ok(fts_rows) = fts_result {
        let ids: Vec<i64> = fts_rows
            .iter()
            .filter_map(|r| r.try_get::<i64, _>("rowid").ok())
            .collect();

        if !ids.is_empty() {
            let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
            let select_cols = "id, title, original_question, card_type, tags_json, source_platform, source_url, source_conversation_id, source_captured_at, summary_confidence, created_at, updated_at, starred, archived";
            let query = format!(
                "SELECT {} FROM knowledge_cards WHERE id IN ({}) ORDER BY created_at DESC",
                select_cols, placeholders
            );

            let mut q = sqlx::query(&query);
            for id in &ids {
                q = q.bind(id);
            }
            let rows = q.fetch_all(&state.db).await.map_err(|e| e.to_string())?;
            let cards: Vec<KnowledgeCardSummary> = rows.iter().map(parse_card_from_row).collect();

            return Ok(CardsListResponse {
                success: true,
                total: cards.len() as i64,
                page: 1,
                page_size: 20,
                cards,
            });
        }
    }

    // Fallback to LIKE
    let like = format!("%{}%", keyword);
    let select_cols = "id, title, original_question, card_type, tags_json, source_platform, source_url, source_conversation_id, source_captured_at, summary_confidence, created_at, updated_at, starred, archived";
    let rows = sqlx::query(&format!(
        "SELECT {} FROM knowledge_cards WHERE archived = 0 AND (title LIKE ? OR original_question LIKE ?) ORDER BY created_at DESC",
        select_cols
    ))
    .bind(&like)
    .bind(&like)
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let cards: Vec<KnowledgeCardSummary> = rows.iter().map(parse_card_from_row).collect();

    Ok(CardsListResponse {
        success: true,
        total: cards.len() as i64,
        page: 1,
        page_size: 20,
        cards,
    })
}

// ============================================================
// Tauri Commands — Tags
// ============================================================

#[tauri::command]
async fn get_tags(app: AppHandle) -> Result<TagsResponse, String> {
    let state = app.state::<AppState>();

    let rows = sqlx::query(
        "SELECT tags_json FROM knowledge_cards WHERE archived = 0",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let mut tag_counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for row in rows {
        let tags_str: Option<String> = row.try_get("tags_json").ok().flatten();
        if let Some(s) = tags_str {
            if let Ok(tags) = serde_json::from_str::<Vec<String>>(&s) {
                for tag in tags {
                    *tag_counts.entry(tag).or_insert(0) += 1;
                }
            }
        }
    }

    let mut tags: Vec<TagItem> = tag_counts
        .into_iter()
        .map(|(tag, count)| TagItem { tag, count })
        .collect();
    tags.sort_by(|a, b| b.count.cmp(&a.count));

    Ok(TagsResponse {
        success: true,
        tags,
    })
}

// ============================================================
// Tauri Commands — Statistics
// ============================================================

#[tauri::command]
async fn get_statistics(app: AppHandle) -> Result<StatisticsResponse, String> {
    let state = app.state::<AppState>();

    let total_cards: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM knowledge_cards WHERE archived = 0",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let type_rows = sqlx::query(
        "SELECT card_type, COUNT(*) as cnt FROM knowledge_cards WHERE archived = 0 GROUP BY card_type",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let mut by_type = std::collections::HashMap::new();
    for r in type_rows {
        let ct: String = r.try_get("card_type").unwrap_or_default();
        let cnt: i64 = r.try_get("cnt").unwrap_or(0);
        by_type.insert(ct, cnt);
    }

    let platform_rows = sqlx::query(
        "SELECT source_platform, COUNT(*) as cnt FROM knowledge_cards WHERE archived = 0 GROUP BY source_platform",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let mut by_platform = std::collections::HashMap::new();
    for r in platform_rows {
        let p: String = r.try_get("source_platform").unwrap_or_default();
        let cnt: i64 = r.try_get("cnt").unwrap_or(0);
        by_platform.insert(p, cnt);
    }

    let this_month: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM knowledge_cards WHERE archived = 0 AND created_at >= date('now', 'start of month')",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let starred_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM knowledge_cards WHERE archived = 0 AND starred = 1",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(StatisticsResponse {
        success: true,
        total_cards,
        by_type,
        by_platform,
        this_month,
        starred_count,
    })
}

// ============================================================
// Tauri Commands — Settings
// ============================================================

#[tauri::command]
async fn get_settings(app: AppHandle) -> Result<SettingsResponse, String> {
    let state = app.state::<AppState>();
    let rows = sqlx::query("SELECT key, value FROM settings")
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    let mut settings = std::collections::HashMap::new();
    for row in rows {
        let key: String = row.try_get("key").unwrap_or_default();
        let value: String = row.try_get("value").unwrap_or_default();
        settings.insert(key, value);
    }

    // Mask API key like HTTP version does
    if let Some(api_key) = settings.get("apiKey") {
        if !api_key.is_empty() {
            let masked = if api_key.len() > 12 {
                format!("{}...{}", &api_key[..8], &api_key[api_key.len() - 4..])
            } else {
                "****".to_string()
            };
            settings.insert("apiKey".to_string(), masked);
            settings.insert("_hasApiKey".to_string(), "true".to_string());
        }
    }

    Ok(SettingsResponse {
        success: true,
        settings,
    })
}

#[tauri::command]
async fn update_settings(
    app: AppHandle,
    updates: std::collections::HashMap<String, String>,
) -> Result<serde_json::Value, String> {
    let state = app.state::<AppState>();
    for (key, value) in updates {
        sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)")
            .bind(&key)
            .bind(&value)
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
async fn validate_settings(
    _app: AppHandle,
    settings: std::collections::HashMap<String, String>,
) -> Result<serde_json::Value, String> {
    let api_key = settings.get("apiKey").ok_or("API Key 不能为空")?;
    let api_url = settings.get("apiUrl").cloned().unwrap_or_else(|| "https://api.openai.com/v1".to_string());
    let model = settings.get("model").cloned().unwrap_or_else(|| "gpt-3.5-turbo".to_string());

    let client = reqwest::Client::new();
    let chat_url = if api_url.ends_with("/chat/completions") {
        api_url.clone()
    } else if api_url.ends_with("/v1") {
        format!("{}/chat/completions", api_url)
    } else {
        format!("{}/v1/chat/completions", api_url.trim_end_matches('/'))
    };

    let resp = client
        .post(&chat_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "messages": [
                {"role": "user", "content": "Say 'ok'"}
            ],
            "max_tokens": 4
        }))
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    let status = resp.status();
    if status.is_success() {
        let body = resp.text().await.map_err(|e| e.to_string())?;
        // Parse to verify it's valid JSON response from LLM
        serde_json::from_str::<serde_json::Value>(&body)
            .map_err(|_| "API 返回内容非 JSON 格式".to_string())?;
        Ok(serde_json::json!({ "success": true, "message": format!("连接成功（{} {}）", api_url, model) }))
    } else {
        let body = resp.text().await.unwrap_or_default();
        Err(format!("API 返回错误 (HTTP {}): {}", status, body))
    }
}

// ============================================================
// HTTP Server — Bridge for browser extension
// ============================================================

use axum::{
    extract::State,
    http::{Method, StatusCode},
    response::Json,
    routing::{get, post},
    Router,
};
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};

type SharedPool = SqlitePool;

async fn http_capture(
    State(pool): State<SharedPool>,
    Json(payload): Json<RawConversation>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    match do_capture(&pool, &payload).await {
        Ok(resp) => Ok(Json(json!({
            "success": true,
            "message": resp.message,
            "card_id": resp.card_id,
            "needs_api_key": resp.needs_api_key,
        }))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e })),
        )),
    }
}

async fn http_status(
    State(pool): State<SharedPool>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let card_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM knowledge_cards WHERE archived = 0",
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    // Check if API key exists
    let has_api_key: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'apiKey' AND value != '' LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
    })?;

    Ok(Json(json!({
        "success": true,
        "version": env!("CARGO_PKG_VERSION"),
        "totalCards": card_count,
        "hasApiKey": has_api_key.is_some(),
    })))
}

pub async fn start_http_server(pool: SqlitePool) {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/capture", post(http_capture))
        .route("/api/status", get(http_status))
        .layer(cors)
        .with_state(pool);

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 17321));
    tracing::info!("HTTP server listening on http://{}", addr);

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            tracing::error!("Failed to bind HTTP server: {}", e);
            return;
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        tracing::error!("HTTP server error: {}", e);
    }
}

#[derive(Debug, Serialize)]
pub struct StatusResponse {
    pub success: bool,
    pub version: String,
    pub db_path: String,
    pub card_count: i64,
}

#[tauri::command]
async fn get_status(app: AppHandle) -> Result<StatusResponse, String> {
    let state = app.state::<AppState>();
    let card_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM knowledge_cards WHERE archived = 0",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(StatusResponse {
        success: true,
        version: env!("CARGO_PKG_VERSION").to_string(),
        db_path: "sqlite:knowledge_base.db".to_string(),
        card_count,
    })
}

// ============================================================
// Tauri Commands — Summarize (触发 AI Pipeline)
// ============================================================

#[derive(Debug, Deserialize)]
pub struct SummarizeRequest {
    pub api_key: String,
    pub api_url: String,
    pub model: String,
}

#[tauri::command]
async fn summarize_card(
    app: AppHandle,
    id: String,
    api_key: String,
    api_url: String,
    model: String,
) -> Result<CardDetailResponse, String> {
    let state = app.state::<AppState>();

    // Fetch the card
    let rows = sqlx::query("SELECT * FROM knowledge_cards WHERE id = ?")
        .bind(&id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        return Err("卡片不存在".to_string());
    }

    let row = &rows[0];
    let card = parse_detail_from_row(row)?;

    // If already summarized, return as-is
    if !card.card.original_question.is_empty() && card.card.title != "未命名对话" {
        return Ok(CardDetailResponse {
            success: true,
            card: card.card,
        });
    }

    // Fetch raw messages for this card
    let clean_rows = sqlx::query("SELECT messages_json FROM clean_conversations WHERE id = ?")
        .bind(&card.card.clean_id())
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    if clean_rows.is_empty() {
        return Err("未找到对话内容".to_string());
    }

    let messages_json: String = clean_rows[0].try_get("messages_json").unwrap_or_default();
    let messages: Vec<Message> = serde_json::from_str(&messages_json).unwrap_or_default();

    if messages.is_empty() {
        return Err("对话内容为空".to_string());
    }

    // Run AI Pipeline
    let pipeline_result = run_ai_pipeline(&api_key, &api_url, &model, &messages, &card.card.source.platform).await;

    match pipeline_result {
        Ok(cards) => {
            if cards.is_empty() {
                return Err("AI Pipeline 未生成卡片".to_string());
            }

            // Use first card result (for now, single card per capture)
            let result = &cards[0];

            // Update the card in DB
            let tags_json = serde_json::to_string(&result.tags).unwrap_or_default();
            let narrative = result.narrative.clone();

            sqlx::query(
                "UPDATE knowledge_cards SET title = ?1, original_question = ?2, card_type = ?3, narrative = ?4, tags_json = ?5, full_output = ?6, summary_confidence = ?7, updated_at = datetime('now'), summarize_error = NULL WHERE id = ?8",
            )
            .bind(&result.title)
            .bind(&result.original_question)
            .bind(&result.card_type)
            .bind(&narrative)
            .bind(&tags_json)
            .bind(result.full_output.as_deref())
            .bind(result.summary_confidence.unwrap_or(0.0))
            .bind(&id)
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;

            get_card(app, id).await
        }
        Err(e) => {
            // Save error state
            sqlx::query(
                "UPDATE knowledge_cards SET summarize_error = ?1, updated_at = datetime('now') WHERE id = ?2",
            )
            .bind(&e)
            .bind(&id)
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;

            Err(e)
        }
    }
}

impl KnowledgeCardDetail {
    fn clean_id(&self) -> &str {
        &self.id // Simplified — would need to store clean_id separately
    }
}

// ============================================================
// AI Pipeline Result type
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineCardResult {
    pub title: String,
    pub card_type: String,
    pub original_question: String,
    pub narrative: String,
    pub tags: Vec<String>,
    pub full_output: Option<String>,
    pub summary_confidence: Option<f64>,
}

// ============================================================
// AI Pipeline — 4 步流水线（话题切分 → 意图分类 → 卡片生成 → 去重）
// Placeholder: 直接调用 LLM，后续补全 prompt 加载和 JSON 修复
// ============================================================

async fn run_ai_pipeline(
    api_key: &str,
    api_url: &str,
    model: &str,
    messages: &[Message],
    platform: &str,
) -> Result<Vec<PipelineCardResult>, String> {
    // Format messages into a single conversation text
    let conversation_text: String = messages
        .iter()
        .map(|m| {
            let role = if m.role == "user" { "【你】" } else { &format!("【{}】", platform) };
            format!("{}{}", role, m.content)
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    // Simple direct prompt — LLM should generate a knowledge card
    let system_prompt = format!(
        r#"你是一位知识整理专家。以下是一段你与 AI 的对话记录。

请分析这段对话，提炼出其中讨论的核心知识点，并生成一张知识卡片。

## 输出格式
请严格按照以下 JSON 格式输出，不要包含任何其他文字：

{{
  "title": "卡片标题，简洁概括话题",
  "card_type": "意图分类，从以下选择一个：概念理解/事实查询/技能学习/操作指南/内容创作/文本处理/规划决策/头脑风暴/交互陪伴/其他",
  "original_question": "你最初提出的核心问题或需求",
  "narrative": "对对话中涉及的知识要点的详细叙述，300-500字，使用华文中宋风格的叙事体。人称：你=提问者，AI=平台名称。多轮对话的递进和追问必须体现出来。",
  "tags": ["标签数组"]
}}"#
    );

    tracing::info!("[AI Pipeline] 开始调用 LLM，模型: {}", model);

    let client = reqwest::Client::new();

    let resp = client
        .post(api_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": format!("对话数据：\n{}", conversation_text)}
            ],
            "max_tokens": 4096,
            "temperature": 0.1
        }))
        .send()
        .await
        .map_err(|e| format!("AI 请求失败: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("AI 请求失败 (HTTP {}): {}", status.as_u16(), body));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 AI 响应失败: {}", e))?;

    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("AI 返回内容为空")?;

    tracing::info!("[AIPipeline] LLM 原始响应: {}", content.chars().take(500).collect::<String>());

    // Extract JSON from response
    let json_str = extract_json_from_response(content)?;
    let parsed: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("解析 JSON 失败: {}", e))?;

    let card = PipelineCardResult {
        title: parsed["title"].as_str().unwrap_or("未命名对话").to_string(),
        card_type: parsed["card_type"].as_str().unwrap_or("其他").to_string(),
        original_question: parsed["original_question"].as_str().unwrap_or("").to_string(),
        narrative: parsed["narrative"].as_str().unwrap_or("").to_string(),
        tags: parsed["tags"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_else(|| vec![platform.to_string()]),
        full_output: parsed["full_output"].as_str().map(|s| s.to_string()),
        summary_confidence: parsed["summary_confidence"].as_f64(),
    };

    Ok(vec![card])
}

/// Extract JSON from LLM response (supports code blocks, raw JSON, etc.)
fn extract_json_from_response(text: &str) -> Result<String, String> {
    // Try to find JSON object between first { and last }
    let first_brace = text.find('{').ok_or("未找到 JSON 对象")?;
    let last_brace = text.rfind('}').ok_or("未找到 JSON 对象")?;
    if last_brace <= first_brace {
        return Err("JSON 格式不完整".to_string());
    }
    Ok(text[first_brace..=last_brace].to_string())
}

// ============================================================
// Main
// ============================================================

fn main() {
    tracing_subscriber::fmt().init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let db_path = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.to_path_buf()))
                .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
                .join("knowledge_base.db");

            // Pre-create the db file to avoid connection issues
            if !db_path.exists() {
                std::fs::File::create(&db_path).expect("Failed to create database file");
            }

            tracing::info!("Database path: {}", db_path.display());

            // Use tauri's async runtime for connection
            let pool = tauri::async_runtime::block_on(
                SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect(format!("sqlite:{}", db_path.to_string_lossy().replace('\\', "/")).as_str())
            ).unwrap_or_else(|e| panic!("Failed to connect to database at {}: {}", db_path.display(), e));

            app.manage(AppState { db: pool.clone() });

            let pool_clone = pool.clone();
            tauri::async_runtime::spawn(async move {
                match init_db(&pool_clone).await {
                    Ok(()) => tracing::info!("Database initialized successfully"),
                    Err(e) => tracing::error!("Database initialization failed: {}", e),
                }
            });

            // Start HTTP server for browser extension
            tauri::async_runtime::spawn(async move {
                start_http_server(pool).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_conversation,
            get_cards,
            get_card,
            update_card,
            delete_card,
            search_cards,
            get_tags,
            get_statistics,
            get_settings,
            update_settings,
            validate_settings,
            get_status,
            summarize_card,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
