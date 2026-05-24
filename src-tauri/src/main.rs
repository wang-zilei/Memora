#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

/// SQLite database wrapper via tauri-plugin-sql
/// The plugin registers a Database in app state. We access it via tauri::State.
type Db = tauri_plugin_sql::Database;

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

// ============================================================
// DB helpers
// ============================================================

/// Run schema SQL on setup
async fn init_db(db: &Db) -> Result<(), String> {
    let schema = include_str!("../db/schema.sql");
    db.execute(schema)
        .await
        .map_err(|e| format!("Failed to initialize database: {}", e))?;
    Ok(())
}

// ============================================================
// Tauri Commands — Capture
// ============================================================

#[tauri::command]
async fn capture_conversation(
    app: AppHandle,
    payload: RawConversation,
) -> Result<CaptureResponse, String> {
    let db = app.state::<Db>();
    let card_id = Uuid::new_v4().to_string();
    let raw_id = Uuid::new_v4().to_string();
    let clean_id = Uuid::new_v4().to_string();

    let raw_json = serde_json::to_string(&payload.messages).map_err(|e| e.to_string())?;

    // 1. Save raw
    db.execute(
        "INSERT INTO raw_conversations (id, platform, conversation_id, title, url, messages_json, captured_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        &[&raw_id, &payload.platform, &payload.conversation_id, &payload.title, &payload.url, &raw_json, &payload.captured_at],
    ).await.map_err(|e| e.to_string())?;

    // 2. Save clean
    db.execute(
        "INSERT INTO clean_conversations (id, raw_id, platform, conversation_id, title, url, messages_json, captured_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        &[&clean_id, &raw_id, &payload.platform, &payload.conversation_id, &payload.title, &payload.url, &raw_json, &payload.captured_at],
    ).await.map_err(|e| e.to_string())?;

    // 3. Create card (pending summary)
    let default_tags = serde_json::to_string(&vec![payload.platform.clone()]).unwrap_or_default();
    let review_json = r#"{"intervals":[1,2,4,7,15,30],"review_history":[],"mastered":false}"#;

    db.execute(
        "INSERT INTO knowledge_cards (id, raw_id, clean_id, title, original_question, card_type, tags_json, review_schedule_json, source_platform, source_url, source_conversation_id, source_captured_at, raw_messages_json, clean_messages_json) VALUES ($1, $2, $3, $4, '', 'other', $5, $6, $7, $8, $9, $10, $11, $12)",
        &[
            &card_id, &raw_id, &clean_id,
            &payload.title.clone().unwrap_or_else(|| "未命名对话".to_string()),
            &default_tags, &review_json,
            &payload.platform, &payload.url, &payload.conversation_id,
            &payload.captured_at, &raw_json, &raw_json,
        ],
    ).await.map_err(|e| e.to_string())?;

    Ok(CaptureResponse {
        success: true,
        message: "对话已抓取并保存".to_string(),
        card_id,
        needs_api_key: true,
    })
}

// ============================================================
// Tauri Commands — Cards CRUD
// ============================================================

#[tauri::command]
async fn get_cards(
    app: AppHandle,
    card_type: Option<String>,
    keyword: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<CardsListResponse, String> {
    let db = app.state::<Db>();
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(20);

    // Build WHERE clause
    let mut where_clauses = vec!["archived = 0".to_string()];

    if let Some(ref ct) = card_type {
        if ct != "全部" {
            where_clauses.push("card_type = ?".to_string());
        }
    }
    if let Some(ref kw) = keyword {
        where_clauses.push("(title LIKE ? OR original_question LIKE ?)".to_string());
    }

    let where_sql = where_clauses.join(" AND ");
    let base_query = format!(
        "SELECT id, title, original_question, card_type, tags_json, source_platform, source_url, source_conversation_id, source_captured_at, summary_confidence, created_at, updated_at, starred, archived FROM knowledge_cards WHERE {}",
        where_sql
    );

    // Count
    let count_query = format!("SELECT COUNT(*) as cnt FROM ({})", base_query);
    let count_rows = db.select(&count_query).await.map_err(|e| e.to_string())?;
    let total: i64 = count_rows.first().and_then(|r| r.get("cnt")).and_then(|v| v.as_i64()).unwrap_or(0);

    // List with pagination
    let list_query = format!("{} ORDER BY created_at DESC LIMIT ? OFFSET ?", base_query);

    Ok(CardsListResponse {
        success: true,
        total,
        page,
        page_size,
        cards: Vec::new(), // TODO: parse rows
    })
}

#[tauri::command]
async fn get_card(app: AppHandle, id: String) -> Result<CardDetailResponse, String> {
    let db = app.state::<Db>();
    let rows = db
        .select("SELECT * FROM knowledge_cards WHERE id = ?")
        .await
        .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        return Err("卡片不存在".to_string());
    }

    let row = &rows[0];
    parse_card_row(row)
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
    let db = app.state::<Db>();

    let mut set_clauses = Vec::new();
    let mut values: Vec<String> = Vec::new();

    if let Some(t) = title {
        set_clauses.push("title = ?");
        values.push(t);
    }
    if let Some(ref t) = tags {
        set_clauses.push("tags_json = ?");
        values.push(serde_json::to_string(t).unwrap());
    }
    if let Some(s) = starred {
        set_clauses.push("starred = ?");
        values.push(if s { "1" } else { "0" }.to_string());
    }
    if let Some(a) = archived {
        set_clauses.push("archived = ?");
        values.push(if a { "1" } else { "0" }.to_string());
    }

    if !set_clauses.is_empty() {
        set_clauses.push("updated_at = datetime('now')");
        values.push(id.clone());

        let sql = format!(
            "UPDATE knowledge_cards SET {} WHERE id = ?",
            set_clauses.join(", ")
        );

        let mut args_str = Vec::new();
        for v in &values {
            args_str.push(v.as_str());
        }

        db.execute_with_args(&sql, args_str)
            .await
            .map_err(|e| e.to_string())?;
    }

    get_card(app, id).await
}

#[tauri::command]
async fn delete_card(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let db = app.state::<Db>();
    db.execute("DELETE FROM knowledge_cards WHERE id = ?")
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
async fn search_cards(
    app: AppHandle,
    keyword: String,
) -> Result<CardsListResponse, String> {
    let db = app.state::<Db>();
    let rows = db
        .select("SELECT rowid FROM cards_fts WHERE cards_fts MATCH ? ORDER BY rank")
        .await
        .map_err(|e| e.to_string())?;

    // Build IN clause from FTS results
    let ids: Vec<String> = rows
        .iter()
        .filter_map(|r| r.get("rowid")?.as_i64().map(|i| i.to_string()))
        .collect();

    if ids.is_empty() {
        return Ok(CardsListResponse {
            success: true, total: 0, page: 1, page_size: 20, cards: vec![],
        });
    }

    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let query = format!(
        "SELECT id, title, original_question, card_type, tags_json, source_platform, source_url, source_conversation_id, source_captured_at, summary_confidence, created_at, updated_at, starred, archived FROM knowledge_cards WHERE id IN ({}) ORDER BY created_at DESC",
        placeholders
    );

    let result_rows = db
        .select(&query)
        .await
        .map_err(|e| e.to_string())?;

    let cards: Vec<KnowledgeCardSummary> = result_rows
        .iter()
        .filter_map(|row| parse_card_summary_row(row).ok())
        .collect();

    Ok(CardsListResponse {
        success: true,
        total: cards.len() as i64,
        page: 1,
        page_size: 20,
        cards,
    })
}

// ============================================================
// Tauri Commands — Settings
// ============================================================

#[tauri::command]
async fn get_settings(app: AppHandle) -> Result<SettingsResponse, String> {
    let db = app.state::<Db>();
    let rows = db.select("SELECT key, value FROM settings").await.map_err(|e| e.to_string())?;

    let mut settings = std::collections::HashMap::new();
    for row in rows {
        if let (Some(key), Some(value)) = (row.get("key"), row.get("value")) {
            if let (Some(k), Some(v)) = (key.as_str(), value.as_str()) {
                settings.insert(k.to_string(), v.to_string());
            }
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
    let db = app.state::<Db>();
    for (key, value) in updates {
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)",
            &[&key, &value],
        ).await.map_err(|e| e.to_string())?;
    }
    Ok(serde_json::json!({ "success": true }))
}

// ============================================================
// Row parsing helpers
// ============================================================

fn parse_card_summary_row(row: &tauri_plugin_sql::Row) -> Result<KnowledgeCardSummary, String> {
    let tags: Vec<String> = row
        .get("tags_json")
        .and_then(|v| v.as_str())
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    Ok(KnowledgeCardSummary {
        id: row.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        title: row.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        original_question: row.get("original_question").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        card_type: row.get("card_type").and_then(|v| v.as_str()).unwrap_or("other").to_string(),
        tags,
        source: CardSource {
            platform: row.get("source_platform").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            url: row.get("source_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
            conversation_id: row.get("source_conversation_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
            captured_at: row.get("source_captured_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        },
        summary_confidence: row.get("summary_confidence").and_then(|v| v.as_f64()),
        created_at: row.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        updated_at: row.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        starred: row.get("starred").and_then(|v| v.as_i64()).unwrap_or(0) != 0,
        archived: row.get("archived").and_then(|v| v.as_i64()).unwrap_or(0) != 0,
    })
}

fn parse_card_row(row: &tauri_plugin_sql::Row) -> Result<CardDetailResponse, String> {
    let summary = parse_card_summary_row(row)?;

    let insights: Vec<String> = row
        .get("insights_json")
        .and_then(|v| v.as_str())
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let outputs: Vec<String> = row
        .get("outputs_json")
        .and_then(|v| v.as_str())
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let unresolved: Vec<String> = row
        .get("unresolved_questions_json")
        .and_then(|v| v.as_str())
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let paths: Vec<String> = row
        .get("exploration_paths_json")
        .and_then(|v| v.as_str())
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let review_schedule: ReviewSchedule = row
        .get("review_schedule_json")
        .and_then(|v| v.as_str())
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| ReviewSchedule {
            intervals: vec![1, 2, 4, 7, 15, 30],
            review_history: vec![],
            mastered: false,
            next_review_date: None,
            review_material: None,
        });

    let raw_messages: Vec<Message> = row
        .get("raw_messages_json")
        .and_then(|v| v.as_str())
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let clean_messages: Vec<Message> = row
        .get("clean_messages_json")
        .and_then(|v| v.as_str())
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    Ok(CardDetailResponse {
        success: true,
        card: KnowledgeCardDetail {
            id: summary.id,
            title: summary.title,
            original_question: summary.original_question,
            topic: summary.topic,
            card_type: summary.card_type,
            tags: summary.tags,
            source: summary.source,
            summary_confidence: summary.summary_confidence,
            created_at: summary.created_at,
            updated_at: summary.updated_at,
            starred: summary.starred,
            archived: summary.archived,
            insights,
            outputs,
            unresolved_questions: unresolved,
            exploration_paths: paths,
            review_schedule,
            raw_messages,
            clean_messages,
        },
    })
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
            let db = app.state::<Db>();
            let db_clone = db.clone();

            // Initialize DB schema asynchronously
            tauri::async_runtime::spawn(async move {
                if let Err(e) = init_db(&db_clone).await {
                    tracing::error!("Database initialization failed: {}", e);
                } else {
                    tracing::info!("Database initialized successfully");
                }
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
            get_settings,
            update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
