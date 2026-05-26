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
    #[serde(default)]
    pub conversation_id: Option<String>,
    pub title: Option<String>,
    #[serde(default)]
    pub url: String,
    pub messages: Vec<Message>,
    #[serde(default)]
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
    pub narrative: String,
    pub summarize_error: Option<String>,
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
    pub narrative: String,
    pub full_output: Option<String>,
    pub summarize_error: Option<String>,
    pub source: CardSource,
    pub summary_confidence: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
    pub starred: bool,
    pub archived: bool,
    pub clean_id: Option<String>,
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
    let summarize_error: Option<String> = row.try_get::<Option<String>, &str>("summarize_error")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());
    KnowledgeCardSummary {
        id: get_str(row, "id"),
        title: get_str(row, "title"),
        original_question: get_str(row, "original_question"),
        card_type: get_str(row, "card_type"),
        tags: get_json_arr(row, "tags_json"),
        narrative: get_str(row, "narrative"),
        summarize_error,
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

    let full_output: Option<String> = row.try_get::<Option<String>, &str>("full_output")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());

    let summarize_error: Option<String> = row.try_get::<Option<String>, &str>("summarize_error")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());

    let clean_id: Option<String> = row.try_get::<Option<String>, &str>("clean_id")
        .ok()
        .flatten();

    Ok(CardDetailResponse {
        success: true,
        card: KnowledgeCardDetail {
            id: summary.id,
            title: summary.title,
            original_question: summary.original_question,
            card_type: summary.card_type,
            tags: summary.tags,
            narrative: summary.narrative,
            full_output,
            summarize_error,
            source: summary.source,
            summary_confidence: summary.summary_confidence,
            created_at: summary.created_at,
            updated_at: summary.updated_at,
            starred: summary.starred,
            archived: summary.archived,
            clean_id,
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
// Conversation Cleaning（对齐 Demo demo/server/capture.js）
// ============================================================

/// 规范化角色标识：user/human/1 → "user"，其余 → "assistant"
fn normalize_role(role: &str) -> &str {
    if role.is_empty() {
        return "assistant";
    }
    let r = role.to_lowercase();
    if r == "user" || r == "human" || r == "1" {
        "user"
    } else {
        "assistant"
    }
}

/// 清洗单条消息内容（去思考标签、垃圾文本、多余空行）
fn clean_content(content: &str) -> String {
    let mut text = content.to_string();
    if text.trim().is_empty() {
        return text;
    }

    // === 0. 移除各平台思考/推理标签壳 ===
    let tag_names = ["think", "thinking", "reasoning", "search"];
    for name in &tag_names {
        // 去掉开标签 <think ...>（保留内容）
        let open_re = regex::Regex::new(&format!(r"(?i)<{}[^>]*>", name)).unwrap();
        text = open_re.replace_all(&text, "").to_string();
        // 去掉闭标签 </think>
        let close_re = regex::Regex::new(&format!(r"(?i)</{}>", name)).unwrap();
        text = close_re.replace_all(&text, "").to_string();
    }

    // === 1. 移除完整思考块（含内容） ===
    // <div class="...think..."> ... </div>
    if let Ok(re) = regex::Regex::new(r#"(?si)<div[^>]*class="[^"]*think[^"]*"[^>]*>.*?</div>"#) {
        text = re.replace_all(&text, "").to_string();
    }
    // [思考] ... [/思考]
    if let Ok(re) = regex::Regex::new(r"(?s)\[思考\].*?\[/思考\]") {
        text = re.replace_all(&text, "").to_string();
    }
    // [深度思考] ... [/深度思考]
    if let Ok(re) = regex::Regex::new(r"(?s)\[深度思考\].*?\[/深度思考\]") {
        text = re.replace_all(&text, "").to_string();
    }
    // [推理想法] ... [/推理想法]
    if let Ok(re) = regex::Regex::new(r"(?s)\[推理想法\].*?\[/推理想法\]") {
        text = re.replace_all(&text, "").to_string();
    }

    // === 2. 移除常见垃圾文本 ===
    if let Ok(re) = regex::Regex::new(r"【\d+†source】") {
        text = re.replace_all(&text, "").to_string();
    }
    let garbage_phrases = [
        "编辑", "复制", "分享", "重新生成", "AI 搜索", "已深度思考",
        "内容由AI生成", "仅供参考",
    ];
    for phrase in &garbage_phrases {
        text = text.replace(phrase, "");
    }
    if let Ok(re) = regex::Regex::new(r"已思考（用时\d+秒）") {
        text = re.replace_all(&text, "").to_string();
    }
    if let Ok(re) = regex::Regex::new(r"内容由AI生成[，,]?.*?") {
        text = re.replace_all(&text, "").to_string();
    }
    if let Ok(re) = regex::Regex::new(r"已思考\(用时\d+秒\)") {
        text = re.replace_all(&text, "").to_string();
    }
    if let Ok(re) = regex::Regex::new(r"(思考中|深度思考中|推理中|思维链|深度思考模式)[：:].*?") {
        text = re.replace_all(&text, "").to_string();
    }
    if let Ok(re) = regex::Regex::new(r"思考用时[：:]\s*\d+秒") {
        text = re.replace_all(&text, "").to_string();
    }
    if let Ok(re) = regex::Regex::new(r"推理用时[：:]\s*\d+秒") {
        text = re.replace_all(&text, "").to_string();
    }
    if let Ok(re) = regex::Regex::new(r"深度思考用时[：:]\s*\d+秒") {
        text = re.replace_all(&text, "").to_string();
    }

    // === 3. 压缩多余空行（≥3 → 2） ===
    if let Ok(re) = regex::Regex::new(r"\n{3,}") {
        text = re.replace_all(&text, "\n\n").to_string();
    }

    text.trim().to_string()
}

/// 质检清洗：移除 AI 输出中的 markdown 格式标识和转义字符
/// 作为 Prompt 约束之外的兜底机制
fn sanitize_content(text: &str) -> String {
    if text.is_empty() {
        return text.to_string();
    }
    let mut t = text.to_string();

    // 1. 字面 \n \r → 实际字符
    t = t.replace("\\n", "\n");
    t = t.replace("\\r", "");

    // 2. Markdown 标题标记 → 去掉 # 号
    if let Ok(re) = regex::Regex::new(r"(?m)^#{1,6}\s+") {
        t = re.replace_all(&t, "").to_string();
    }

    // 3. 粗体 **text** → text
    if let Ok(re) = regex::Regex::new(r"\*\*(.+?)\*\*") {
        t = re.replace_all(&t, "$1").to_string();
    }

    // 4. 行内斜体 *text*
    if let Ok(re) = regex::Regex::new(r"([^\n*])\*([^*\n]+?)\*([^\n*])") {
        t = re.replace_all(&t, "$1$2$3").to_string();
    }

    // 5. 水平分割线
    if let Ok(re) = regex::Regex::new(r"(?m)^[-*_]{3,}\s*$") {
        t = re.replace_all(&t, "").to_string();
    }

    // 6. AI 常见输出前缀
    if let Ok(re) = regex::Regex::new(r"(?m)^(好的[，,]\s*|当然[，,]\s*|以下是我的[^：:]*[：:]\s*|以下是[^：:]*[：:]\s*)") {
        t = re.replace_all(&t, "").to_string();
    }

    // 7. 压缩多余空行
    if let Ok(re) = regex::Regex::new(r"\n{3,}") {
        t = re.replace_all(&t, "\n\n").to_string();
    }

    t.trim().to_string()
}

/// 合并连续相同角色的消息
fn merge_consecutive(messages: Vec<Message>) -> Vec<Message> {
    if messages.is_empty() {
        return messages;
    }
    let mut result: Vec<Message> = vec![messages[0].clone()];
    for msg in &messages[1..] {
        let last = result.last_mut().unwrap();
        if last.role == msg.role {
            last.content.push_str("\n\n");
            last.content.push_str(&msg.content);
        } else {
            result.push(msg.clone());
        }
    }
    result
}

/// 清洗原始对话，返回 (cleaned_messages, title)
fn clean_conversation(raw: &RawConversation) -> (Vec<Message>, String) {
    let platform = &raw.platform;
    let title = raw.title.clone()
        .unwrap_or_else(|| format!("{} 对话", platform));

    // 获取消息列表（对齐 Demo: raw.grouped_messages || raw.messages）
    let raw_messages = &raw.messages;

    // 规范化每条消息
    let cleaned: Vec<Message> = raw_messages.iter().map(|msg| {
        Message {
            role: normalize_role(&msg.role).to_string(),
            content: sanitize_content(&clean_content(&msg.content)),
            timestamp: msg.timestamp.clone(),
        }
    })
    .filter(|msg| !msg.content.trim().is_empty())
    .collect();

    let messages = merge_consecutive(cleaned);

    (messages, title)
}

// ============================================================
// Tauri Commands — Capture
// ============================================================

/// Core capture logic — reusable by both Tauri command and HTTP handler
async fn do_capture(pool: &SqlitePool, payload: &RawConversation) -> Result<CaptureResponse, String> {
    let card_id = Uuid::new_v4().to_string();
    let raw_id = Uuid::new_v4().to_string();
    let clean_id = Uuid::new_v4().to_string();

    // Clean conversation (normalize roles, strip thinking tags, merge consecutive)
    let (cleaned_messages, title) = clean_conversation(payload);

    let raw_json = serde_json::to_string(&payload.messages).map_err(|e| e.to_string())?;
    let clean_json = serde_json::to_string(&cleaned_messages).map_err(|e| e.to_string())?;
    let default_tags = serde_json::to_string(&vec![payload.platform.clone()]).unwrap_or_default();
    let review_json = r#"{"intervals":[1,2,4,7,15,30],"review_history":[],"mastered":false}"#;

    // 1. Save raw
    sqlx::query(
        "INSERT INTO raw_conversations (id, platform, conversation_id, title, url, messages_json, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
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

    // 2. Save clean (cleaned messages, not raw)
    sqlx::query(
        "INSERT INTO clean_conversations (id, raw_id, platform, conversation_id, title, url, messages_json, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&clean_id)
    .bind(&raw_id)
    .bind(&payload.platform)
    .bind(&payload.conversation_id)
    .bind(&title)
    .bind(&payload.url)
    .bind(&clean_json)
    .bind(&payload.captured_at)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 3. Create card (pending summary)
    sqlx::query(
        "INSERT INTO knowledge_cards (id, raw_id, clean_id, title, original_question, card_type, tags_json, review_schedule_json, source_platform, source_url, source_conversation_id, source_captured_at, raw_messages_json, clean_messages_json) VALUES (?, ?, ?, ?, '', '其他', ?, ?, ?, ?, ?, ?, ?, ?)",
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
    .bind(&clean_json)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 4. Check if API key exists in settings
    let api_key: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'apiKey' AND value != '' LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if api_key.as_ref().map_or(true, |s| s.is_empty()) {
        return Ok(CaptureResponse {
            success: true,
            message: "对话已抓取并保存（待总结），请在设置中配置 API Key 后点击\"重新总结\"".to_string(),
            card_id,
            needs_api_key: true,
        });
    }

    let api_url: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'apiUrl' AND value != '' LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let model: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'model' AND value != '' LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let api_url = api_url.unwrap_or_else(|| "https://api.openai.com/v1".to_string());
    let model = model.unwrap_or_else(|| "gpt-4.1-nano".to_string());

    // 5. Run AI Pipeline with CLEANED messages (not raw)
    match run_ai_pipeline(&api_key.unwrap(), &api_url, &model, &cleaned_messages, &payload.platform).await {
        Ok(cards) if !cards.is_empty() => {
            let first = &cards[0];
            let tags_json = serde_json::to_string(&first.tags).unwrap_or_default();

            // Update first card
            sqlx::query(
                "UPDATE knowledge_cards SET title = ?, original_question = ?, card_type = ?, narrative = ?, full_output = ?, tags_json = ?, summary_confidence = ?, updated_at = datetime('now'), summarize_error = NULL WHERE id = ?",
            )
            .bind(&first.title)
            .bind(&first.original_question)
            .bind(&first.card_type)
            .bind(&first.narrative)
            .bind(first.full_output.as_deref())
            .bind(&tags_json)
            .bind(first.summary_confidence.unwrap_or(0.0))
            .bind(&card_id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

            // Create additional cards for extra topics
            for c in &cards[1..] {
                let extra_id = Uuid::new_v4().to_string();
                let extra_tags = serde_json::to_string(&c.tags).unwrap_or_default();
                sqlx::query(
                    "INSERT INTO knowledge_cards (id, raw_id, clean_id, title, original_question, card_type, narrative, full_output, tags_json, review_schedule_json, source_platform, source_url, source_conversation_id, source_captured_at, raw_messages_json, clean_messages_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(&extra_id)
                .bind(&raw_id)
                .bind(&clean_id)
                .bind(&c.title)
                .bind(&c.original_question)
                .bind(&c.card_type)
                .bind(&c.narrative)
                .bind(c.full_output.as_deref())
                .bind(&extra_tags)
                .bind(&review_json)
                .bind(&payload.platform)
                .bind(&payload.url)
                .bind(&payload.conversation_id)
                .bind(&payload.captured_at)
                .bind(&raw_json)
                .bind(&clean_json)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            }

            Ok(CaptureResponse {
                success: true,
                message: format!("对话已抓取、清洗、总结，生成 {} 张知识卡片", cards.len()),
                card_id,
                needs_api_key: false,
            })
        }
        Ok(_) => {
            // Pipeline returned 0 cards
            sqlx::query(
                "UPDATE knowledge_cards SET summarize_error = 'AI 总结未产出有效内容，可能是 API 返回格式异常', updated_at = datetime('now') WHERE id = ?",
            )
            .bind(&card_id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

            Ok(CaptureResponse {
                success: true,
                message: "对话已抓取并保存，但 AI 总结未产出有效内容".to_string(),
                card_id,
                needs_api_key: false,
            })
        }
        Err(e) => {
            sqlx::query(
                "UPDATE knowledge_cards SET summarize_error = ?, updated_at = datetime('now') WHERE id = ?",
            )
            .bind(&e)
            .bind(&card_id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

            Err(e)
        }
    }
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

    let select_cols = "id, title, original_question, card_type, narrative, summarize_error, tags_json, source_platform, source_url, source_conversation_id, source_captured_at, summary_confidence, created_at, updated_at, starred, archived";
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
            let select_cols = "id, title, original_question, card_type, narrative, summarize_error, tags_json, source_platform, source_url, source_conversation_id, source_captured_at, summary_confidence, created_at, updated_at, starred, archived";
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
    let select_cols = "id, title, original_question, card_type, narrative, summarize_error, tags_json, source_platform, source_url, source_conversation_id, source_captured_at, summary_confidence, created_at, updated_at, starred, archived";
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
        sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
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
    routing::{get, post, put, delete},
    Router,
};
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

type SharedPool = SqlitePool;

async fn http_capture(
    State(pool): State<SharedPool>,
    Json(payload): Json<RawConversation>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    // Clean conversation first (normalize roles, strip thinking tags, merge consecutive)
    let (cleaned_messages, title) = clean_conversation(&payload);

    let card_id = Uuid::new_v4().to_string();
    let raw_id = Uuid::new_v4().to_string();
    let clean_id = Uuid::new_v4().to_string();

    let raw_json = serde_json::to_string(&payload.messages).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() })))
    })?;
    let clean_json = serde_json::to_string(&cleaned_messages).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() })))
    })?;
    let default_tags = serde_json::to_string(&vec![payload.platform.clone()]).unwrap_or_default();
    let review_json = r#"{"intervals":[1,2,4,7,15,30],"review_history":[],"mastered":false}"#;

    // 1. Save raw
    sqlx::query(
        "INSERT INTO raw_conversations (id, platform, conversation_id, title, url, messages_json, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&raw_id).bind(&payload.platform).bind(&payload.conversation_id)
    .bind(&title).bind(&payload.url).bind(&raw_json).bind(&payload.captured_at)
    .execute(&pool).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() })))
    })?;

    // 2. Save clean (cleaned messages, not raw)
    sqlx::query(
        "INSERT INTO clean_conversations (id, raw_id, platform, conversation_id, title, url, messages_json, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&clean_id).bind(&raw_id).bind(&payload.platform).bind(&payload.conversation_id)
    .bind(&title).bind(&payload.url).bind(&clean_json).bind(&payload.captured_at)
    .execute(&pool).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() })))
    })?;

    // 3. Create card (pending summary)
    sqlx::query(
        "INSERT INTO knowledge_cards (id, raw_id, clean_id, title, original_question, card_type, tags_json, review_schedule_json, source_platform, source_url, source_conversation_id, source_captured_at, raw_messages_json, clean_messages_json) VALUES (?, ?, ?, ?, '', '其他', ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&card_id).bind(&raw_id).bind(&clean_id).bind(&title)
    .bind(&default_tags).bind(&review_json)
    .bind(&payload.platform).bind(&payload.url).bind(&payload.conversation_id).bind(&payload.captured_at)
    .bind(&raw_json).bind(&clean_json)
    .execute(&pool).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() })))
    })?;

    // 4. Check API key
    let api_key: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'apiKey' AND value != '' LIMIT 1",
    )
    .fetch_optional(&pool).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() })))
    })?;

    if api_key.as_ref().map_or(true, |s| s.is_empty()) {
        return Ok(Json(json!({
            "success": true,
            "message": "对话已抓取并保存（待总结），请在设置中配置 API Key 后点击\"重新总结\"",
            "rawId": raw_id,
            "cleanId": clean_id,
            "cardId": card_id,
            "needsApiKey": true,
        })));
    }

    let api_url: String = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'apiUrl' AND value != '' LIMIT 1",
    )
    .fetch_optional(&pool).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() })))
    })?.unwrap_or_else(|| "https://api.openai.com/v1".to_string());

    let model: String = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'model' AND value != '' LIMIT 1",
    )
    .fetch_optional(&pool).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() })))
    })?.unwrap_or_else(|| "gpt-4.1-nano".to_string());

    // 5. Run AI Pipeline with CLEANED messages (not raw)
    match run_ai_pipeline(&api_key.unwrap(), &api_url, &model, &cleaned_messages, &payload.platform).await {
        Ok(cards) if !cards.is_empty() => {
            let first = &cards[0];
            let tags_json = serde_json::to_string(&first.tags).unwrap_or_default();

            sqlx::query(
                "UPDATE knowledge_cards SET title = ?, original_question = ?, card_type = ?, narrative = ?, full_output = ?, tags_json = ?, summary_confidence = ?, updated_at = datetime('now'), summarize_error = NULL WHERE id = ?",
            )
            .bind(&first.title).bind(&first.original_question).bind(&first.card_type)
            .bind(&first.narrative).bind(first.full_output.as_deref()).bind(&tags_json)
            .bind(first.summary_confidence.unwrap_or(0.0)).bind(&card_id)
            .execute(&pool).await.map_err(|e| {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() })))
            })?;

            // Create additional cards for extra topics
            for c in &cards[1..] {
                let extra_id = Uuid::new_v4().to_string();
                let extra_tags = serde_json::to_string(&c.tags).unwrap_or_default();
                sqlx::query(
                    "INSERT INTO knowledge_cards (id, raw_id, clean_id, title, original_question, card_type, narrative, full_output, tags_json, review_schedule_json, source_platform, source_url, source_conversation_id, source_captured_at, raw_messages_json, clean_messages_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(&extra_id).bind(&raw_id).bind(&clean_id)
                .bind(&c.title).bind(&c.original_question).bind(&c.card_type)
                .bind(&c.narrative).bind(c.full_output.as_deref()).bind(&extra_tags).bind(&review_json)
                .bind(&payload.platform).bind(&payload.url).bind(&payload.conversation_id).bind(&payload.captured_at)
                .bind(&raw_json).bind(&clean_json)
                .execute(&pool).await.map_err(|e| {
                    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() })))
                })?;
            }

            let card_count = cards.len();
            Ok(Json(json!({
                "success": true,
                "message": format!("对话已抓取、清洗、总结，生成 {} 张知识卡片", card_count),
                "rawId": raw_id,
                "cleanId": clean_id,
                "cardId": card_id,
                "cardCount": card_count,
                "card": {
                    "title": first.title,
                    "card_type": first.card_type,
                    "tags": first.tags,
                },
            })))
        }
        Ok(_) => {
            // Pipeline returned 0 cards
            sqlx::query(
                "UPDATE knowledge_cards SET summarize_error = 'AI 总结未产出有效内容，可能是 API 返回格式异常', updated_at = datetime('now') WHERE id = ?",
            )
            .bind(&card_id).execute(&pool).await.map_err(|e| {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() })))
            })?;

            Ok(Json(json!({
                "success": true,
                "message": "对话已抓取并保存，但 AI 总结未产出有效内容",
                "rawId": raw_id,
                "cleanId": clean_id,
                "cardId": card_id,
                "cardCount": 0,
                "aiError": "AI 总结未产出有效内容，可能是 API 返回格式异常",
                "card": {
                    "title": title,
                    "card_type": "其他",
                    "tags": vec![payload.platform.clone()],
                },
            })))
        }
        Err(e) => {
            sqlx::query(
                "UPDATE knowledge_cards SET summarize_error = ?, updated_at = datetime('now') WHERE id = ?",
            )
            .bind(&e).bind(&card_id).execute(&pool).await.map_err(|e2| {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e2.to_string() })))
            })?;

            Ok(Json(json!({
                "success": true,
                "message": format!("对话已抓取并保存（待总结）。AI 总结失败: {}。可在知识库中点击\"重新总结\"", e),
                "rawId": raw_id,
                "cleanId": clean_id,
                "cardId": card_id,
                "aiError": e,
                "card": {
                    "title": title,
                    "card_type": "其他",
                    "tags": vec![payload.platform.clone()],
                },
            })))
        }
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

// ============================================================
// HTTP Route Handlers (mirrors Tauri commands)
// ============================================================

async fn http_get_cards(
    State(pool): State<SharedPool>,
    query: axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let card_type = query.get("card_type").cloned();
    let keyword = query.get("keyword").cloned();
    let tag = query.get("tag").cloned();
    let starred = query.get("starred").and_then(|v| v.parse::<bool>().ok());
    let page: i64 = query.get("page").and_then(|v| v.parse().ok()).unwrap_or(1);
    let page_size: i64 = query.get("pageSize").and_then(|v| v.parse().ok()).unwrap_or(20);

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
        .fetch_one(&pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

    let select_cols = "id, title, original_question, card_type, narrative, summarize_error, tags_json, source_platform, source_url, source_conversation_id, source_captured_at, summary_confidence, created_at, updated_at, starred, archived";
    let list_query = format!(
        "{} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        format!("SELECT {} FROM knowledge_cards WHERE {}", select_cols, where_sql)
    );

    let mut q = sqlx::query(&list_query);
    for v in &params {
        q = bind_json(q, v);
    }
    q = q.bind(page_size).bind((page - 1) * page_size);

    let rows = q.fetch_all(&pool).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;
    let cards: Vec<serde_json::Value> = rows.iter().map(|row| {
        let tags_json: String = row.try_get::<Option<String>, _>("tags_json").unwrap_or(None).unwrap_or_default();
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
        let starred: i64 = row.try_get::<Option<i64>, _>("starred").unwrap_or(None).unwrap_or(0);
        json!({
            "id": row.try_get::<String, _>("id").unwrap_or_default(),
            "title": row.try_get::<String, _>("title").unwrap_or_default(),
            "original_question": row.try_get::<String, _>("original_question").unwrap_or_default(),
            "card_type": row.try_get::<String, _>("card_type").unwrap_or_default(),
            "narrative": row.try_get::<Option<String>, _>("narrative").unwrap_or(None).unwrap_or_default(),
            "summarize_error": row.try_get::<Option<String>, _>("summarize_error").unwrap_or(None),
            "tags": tags,
            "source": {
                "platform": row.try_get::<Option<String>, _>("source_platform").unwrap_or(None),
                "url": row.try_get::<Option<String>, _>("source_url").unwrap_or(None),
                "conversation_id": row.try_get::<Option<String>, _>("source_conversation_id").unwrap_or(None),
                "captured_at": row.try_get::<Option<String>, _>("source_captured_at").unwrap_or(None),
            },
            "summary_confidence": row.try_get::<Option<f64>, _>("summary_confidence").unwrap_or(None),
            "created_at": row.try_get::<String, _>("created_at").unwrap_or_default(),
            "updated_at": row.try_get::<String, _>("updated_at").unwrap_or_default(),
            "starred": starred == 1,
        })
    }).collect();

    Ok(Json(json!({
        "success": true,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "cards": cards,
    })))
}

async fn http_get_card(
    State(pool): State<SharedPool>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let row = sqlx::query(
        "SELECT id, title, original_question, card_type, narrative, full_output, summarize_error, tags_json, insights_json, outputs_json, unresolved_questions_json, exploration_paths_json, summary_confidence, source_platform, source_url, source_conversation_id, source_captured_at, raw_messages_json, clean_messages_json, created_at, updated_at, starred, archived FROM knowledge_cards WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

    match row {
        Some(row) => {
            let tags_json: String = row.try_get::<Option<String>, _>("tags_json").unwrap_or(None).unwrap_or_default();
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            let raw_json: Option<String> = row.try_get::<Option<String>, _>("raw_messages_json").unwrap_or(None);
            let clean_json: Option<String> = row.try_get::<Option<String>, _>("clean_messages_json").unwrap_or(None);
            let insights_json: String = row.try_get::<Option<String>, _>("insights_json").unwrap_or(None).unwrap_or_default();
            let outputs_json: String = row.try_get::<Option<String>, _>("outputs_json").unwrap_or(None).unwrap_or_default();
            let unresolved_json: String = row.try_get::<Option<String>, _>("unresolved_questions_json").unwrap_or(None).unwrap_or_default();
            let exploration_json: String = row.try_get::<Option<String>, _>("exploration_paths_json").unwrap_or(None).unwrap_or_default();

            let raw_messages: Vec<serde_json::Value> = raw_json.as_ref().and_then(|j| serde_json::from_str(j).ok()).unwrap_or_default();
            let clean_messages: Vec<serde_json::Value> = clean_json.as_ref().and_then(|j| serde_json::from_str(j).ok()).unwrap_or_default();
            let insights: Vec<serde_json::Value> = serde_json::from_str(&insights_json).unwrap_or_default();
            let outputs: Vec<serde_json::Value> = serde_json::from_str(&outputs_json).unwrap_or_default();
            let unresolved: Vec<serde_json::Value> = serde_json::from_str(&unresolved_json).unwrap_or_default();
            let exploration: Vec<serde_json::Value> = serde_json::from_str(&exploration_json).unwrap_or_default();

            let starred: i64 = row.try_get::<Option<i64>, _>("starred").unwrap_or(None).unwrap_or(0);

            Ok(Json(json!({
                "success": true,
                "card": {
                    "id": row.try_get::<String, _>("id").unwrap_or_default(),
                    "title": row.try_get::<String, _>("title").unwrap_or_default(),
                    "original_question": row.try_get::<String, _>("original_question").unwrap_or_default(),
                    "card_type": row.try_get::<String, _>("card_type").unwrap_or_default(),
                    "narrative": row.try_get::<Option<String>, _>("narrative").unwrap_or(None).unwrap_or_default(),
                    "full_output": row.try_get::<Option<String>, _>("full_output").unwrap_or(None),
                    "summarize_error": row.try_get::<Option<String>, _>("summarize_error").unwrap_or(None),
                    "tags": tags,
                    "insights": insights,
                    "outputs": outputs,
                    "unresolved_questions": unresolved,
                    "exploration_paths": exploration,
                    "rawMessages": raw_messages,
                    "cleanMessages": clean_messages,
                    "summary_confidence": row.try_get::<Option<f64>, _>("summary_confidence").unwrap_or(None),
                    "source": {
                        "platform": row.try_get::<Option<String>, _>("source_platform").unwrap_or(None),
                        "url": row.try_get::<Option<String>, _>("source_url").unwrap_or(None),
                        "conversation_id": row.try_get::<Option<String>, _>("source_conversation_id").unwrap_or(None),
                        "captured_at": row.try_get::<Option<String>, _>("source_captured_at").unwrap_or(None),
                    },
                    "created_at": row.try_get::<String, _>("created_at").unwrap_or_default(),
                    "updated_at": row.try_get::<String, _>("updated_at").unwrap_or_default(),
                    "starred": starred == 1,
                }
            })))
        }
        None => Ok(Json(json!({ "success": false, "error": "Card not found" }))),
    }
}

async fn http_update_card(
    State(pool): State<SharedPool>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    // Build dynamic SET clauses based on provided fields
    let mut set_parts: Vec<String> = vec!["updated_at = datetime('now')".to_string()];
    let mut params: Vec<serde_json::Value> = vec![];

    if let Some(v) = body.get("title") {
        set_parts.push("title = ?".to_string());
        params.push(v.clone());
    }
    if let Some(v) = body.get("original_question") {
        set_parts.push("original_question = ?".to_string());
        params.push(v.clone());
    }
    if let Some(v) = body.get("card_type") {
        set_parts.push("card_type = ?".to_string());
        params.push(v.clone());
    }
    if let Some(v) = body.get("narrative") {
        set_parts.push("narrative = ?".to_string());
        params.push(v.clone());
    }
    if let Some(v) = body.get("full_output") {
        set_parts.push("full_output = ?".to_string());
        params.push(v.clone());
    }
    if let Some(v) = body.get("tags") {
        set_parts.push("tags_json = ?".to_string());
        params.push(serde_json::to_value(v).unwrap_or(serde_json::json!("[]")));
    }
    if let Some(v) = body.get("starred") {
        set_parts.push("starred = ?".to_string());
        params.push(serde_json::Value::Number(serde_json::Number::from(if v.as_bool().unwrap_or(false) { 1 } else { 0 })));
    }

    if set_parts.len() == 1 {
        return Ok(Json(json!({ "success": true, "message": "No fields to update" })));
    }

    let sql = format!("UPDATE knowledge_cards SET {} WHERE id = ?", set_parts.join(", "));
    let mut q = sqlx::query(&sql);
    for v in &params {
        q = bind_json(q, v);
    }
    q = q.bind(&id);
    q.execute(&pool).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

    // Return updated card
    let row = sqlx::query(
        "SELECT id, title, original_question, card_type, narrative, summarize_error, tags_json, summary_confidence, source_platform, source_url, source_conversation_id, source_captured_at, created_at, updated_at, starred FROM knowledge_cards WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

    match row {
        Some(row) => {
            let tags_json: String = row.try_get::<Option<String>, _>("tags_json").unwrap_or(None).unwrap_or_default();
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            let starred: i64 = row.try_get::<Option<i64>, _>("starred").unwrap_or(None).unwrap_or(0);
            Ok(Json(json!({
                "success": true,
                "card": {
                    "id": row.try_get::<String, _>("id").unwrap_or_default(),
                    "title": row.try_get::<String, _>("title").unwrap_or_default(),
                    "original_question": row.try_get::<String, _>("original_question").unwrap_or_default(),
                    "card_type": row.try_get::<String, _>("card_type").unwrap_or_default(),
                    "narrative": row.try_get::<Option<String>, _>("narrative").unwrap_or(None).unwrap_or_default(),
                    "summarize_error": row.try_get::<Option<String>, _>("summarize_error").unwrap_or(None),
                    "tags": tags,
                    "summary_confidence": row.try_get::<Option<f64>, _>("summary_confidence").unwrap_or(None),
                    "source": {
                        "platform": row.try_get::<Option<String>, _>("source_platform").unwrap_or(None),
                        "url": row.try_get::<Option<String>, _>("source_url").unwrap_or(None),
                        "conversation_id": row.try_get::<Option<String>, _>("source_conversation_id").unwrap_or(None),
                        "captured_at": row.try_get::<Option<String>, _>("source_captured_at").unwrap_or(None),
                    },
                    "created_at": row.try_get::<String, _>("created_at").unwrap_or_default(),
                    "updated_at": row.try_get::<String, _>("updated_at").unwrap_or_default(),
                    "starred": starred == 1,
                }
            })))
        }
        None => Ok(Json(json!({ "success": false, "error": "Card not found" }))),
    }
}

async fn http_delete_card(
    State(pool): State<SharedPool>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    sqlx::query("DELETE FROM knowledge_cards WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

    Ok(Json(json!({ "success": true, "message": "Card deleted" })))
}

async fn http_get_tags(
    State(pool): State<SharedPool>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let rows = sqlx::query("SELECT tags_json FROM knowledge_cards WHERE archived = 0")
        .fetch_all(&pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

    let mut tag_counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for row in rows {
        let tags_json: String = row.try_get::<Option<String>, _>("tags_json").unwrap_or(None).unwrap_or_default();
        if let Ok(tags) = serde_json::from_str::<Vec<String>>(&tags_json) {
            for tag in tags {
                *tag_counts.entry(tag).or_insert(0) += 1;
            }
        }
    }

    let mut tags: Vec<serde_json::Value> = tag_counts.iter()
        .map(|(tag, count)| json!({ "tag": tag, "count": count }))
        .collect();
    tags.sort_by(|a, b| b["count"].as_i64().unwrap_or(0).cmp(&a["count"].as_i64().unwrap_or(0)));

    Ok(Json(json!({ "success": true, "tags": tags })))
}

async fn http_get_statistics(
    State(pool): State<SharedPool>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM knowledge_cards WHERE archived = 0")
        .fetch_one(&pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

    // By type
    let type_rows: Vec<(String, i64)> = sqlx::query_as("SELECT card_type, COUNT(*) FROM knowledge_cards WHERE archived = 0 GROUP BY card_type")
        .fetch_all(&pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;
    let by_type: serde_json::Map<String, serde_json::Value> = type_rows.into_iter()
        .map(|(t, c)| (t, serde_json::Value::Number(serde_json::Number::from(c))))
        .collect();

    // By platform
    let platform_rows: Vec<(Option<String>, i64)> = sqlx::query_as("SELECT source_platform, COUNT(*) FROM knowledge_cards WHERE archived = 0 GROUP BY source_platform")
        .fetch_all(&pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;
    let mut by_platform: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
    for (p, c) in platform_rows {
        by_platform.insert(p.unwrap_or_else(|| "unknown".to_string()), serde_json::Value::Number(serde_json::Number::from(c)));
    }

    // By tag
    let tag_rows = sqlx::query("SELECT tags_json FROM knowledge_cards WHERE archived = 0")
        .fetch_all(&pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;
    let mut tag_counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for row in tag_rows {
        let tags_json: String = row.try_get::<Option<String>, _>("tags_json").unwrap_or(None).unwrap_or_default();
        if let Ok(tags) = serde_json::from_str::<Vec<String>>(&tags_json) {
            for tag in tags {
                *tag_counts.entry(tag).or_insert(0) += 1;
            }
        }
    }
    let by_tag: serde_json::Map<String, serde_json::Value> = tag_counts.into_iter()
        .map(|(t, c)| (t, serde_json::Value::Number(serde_json::Number::from(c))))
        .collect();

    Ok(Json(json!({
        "success": true,
        "total": total,
        "byType": by_type,
        "byPlatform": by_platform,
        "byTag": by_tag,
    })))
}

async fn http_get_settings(
    State(pool): State<SharedPool>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let rows = sqlx::query("SELECT key, value FROM settings")
        .fetch_all(&pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

    let mut settings: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
    let mut has_api_key = false;
    for row in rows {
        let key: String = row.try_get("key").unwrap_or_default();
        let value: String = row.try_get("value").unwrap_or_default();
        if key == "apiKey" && !value.is_empty() {
            has_api_key = true;
            settings.insert(key.clone(), serde_json::Value::String("******".to_string()));
        } else {
            settings.insert(key.clone(), serde_json::Value::String(value));
        }
    }
    settings.insert("_hasApiKey".to_string(), serde_json::Value::Bool(has_api_key));

    Ok(Json(json!({ "success": true, "settings": settings })))
}

async fn http_update_settings(
    State(pool): State<SharedPool>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if let Some(obj) = body.as_object() {
        for (key, value) in obj {
            if let Some(v) = value.as_str() {
                if !v.is_empty() {
                    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
                        .bind(key)
                        .bind(v)
                        .execute(&pool)
                        .await
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;
                }
            }
        }
    }
    Ok(Json(json!({ "success": true, "message": "Settings updated" })))
}

async fn http_validate_settings(
    State(_pool): State<SharedPool>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let api_key = body["apiKey"].as_str().unwrap_or("");
    let api_url = body["apiUrl"].as_str().unwrap_or("https://api.openai.com/v1");
    let model = body["model"].as_str().unwrap_or("gpt-4.1-nano");

    let chat_url = if api_url.ends_with("/chat/completions") {
        api_url.to_string()
    } else {
        format!("{}/chat/completions", api_url.trim_end_matches('/'))
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(&chat_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 10
        }))
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, Json(json!({ "success": false, "error": format!("连接失败: {}", e) }))))?;

    let status = resp.status();
    if status.is_success() {
        Ok(Json(json!({ "success": true, "message": "连接成功，API 响应正常" })))
    } else {
        let error_body = resp.text().await.unwrap_or_default();
        Ok(Json(json!({ "success": false, "error": format!("API 返回错误 (HTTP {}): {}", status.as_u16(), error_body) })))
    }
}

async fn http_summarize_card(
    State(pool): State<SharedPool>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    // Fetch the card
    let row = sqlx::query(
        "SELECT id, clean_id, raw_messages_json, clean_messages_json, source_platform FROM knowledge_cards WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

    let row = row.ok_or_else(|| {
        (StatusCode::NOT_FOUND, Json(json!({ "success": false, "error": "卡片不存在" })))
    })?;

    // Read settings
    let api_key: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'apiKey' AND value != '' LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

    let api_key = api_key.ok_or_else(|| {
        (StatusCode::BAD_REQUEST, Json(json!({ "success": false, "error": "请先在设置中配置 API Key" })))
    })?;

    let api_url: String = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'apiUrl' AND value != '' LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?
    .unwrap_or_else(|| "https://api.openai.com/v1".to_string());

    let model: String = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'model' AND value != '' LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?
    .unwrap_or_else(|| "gpt-4.1-nano".to_string());

    // Get clean conversation messages
    let clean_id: Option<String> = row.try_get("clean_id").ok().flatten();
    let messages: Vec<Message> = if let Some(ref cid) = clean_id {
        let clean_row = sqlx::query("SELECT messages_json FROM clean_conversations WHERE id = ?")
            .bind(cid)
            .fetch_optional(&pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;
        clean_row
            .and_then(|r| r.try_get::<String, _>("messages_json").ok())
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        let raw_json: Option<String> = row.try_get("raw_messages_json").ok().flatten();
        raw_json.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
    };

    if messages.is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(json!({ "success": false, "error": "对话内容为空" }))));
    }

    let platform: String = row.try_get("source_platform").unwrap_or_else(|_| "unknown".to_string());

    // Run AI Pipeline
    match run_ai_pipeline(&api_key, &api_url, &model, &messages, &platform).await {
        Ok(cards) if !cards.is_empty() => {
            let first = &cards[0];
            let tags_json = serde_json::to_string(&first.tags).unwrap_or_default();

            sqlx::query(
                "UPDATE knowledge_cards SET title = ?, original_question = ?, card_type = ?, narrative = ?, full_output = ?, tags_json = ?, summary_confidence = ?, updated_at = datetime('now'), summarize_error = NULL WHERE id = ?",
            )
            .bind(&first.title)
            .bind(&first.original_question)
            .bind(&first.card_type)
            .bind(&first.narrative)
            .bind(first.full_output.as_deref())
            .bind(&tags_json)
            .bind(first.summary_confidence.unwrap_or(0.0))
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

            // Return updated card
            let updated_row = sqlx::query("SELECT * FROM knowledge_cards WHERE id = ?")
                .bind(&id)
                .fetch_optional(&pool)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

            match updated_row {
                Some(r) => {
                    let detail = parse_detail_from_row(&r)
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e }))))?;
                    Ok(Json(json!({ "success": true, "card": detail.card })))
                }
                None => Err((StatusCode::NOT_FOUND, Json(json!({ "success": false, "error": "卡片不存在" })))),
            }
        }
        Ok(_) => {
            // Pipeline returned 0 cards
            sqlx::query(
                "UPDATE knowledge_cards SET summarize_error = 'AI 总结未产出有效内容', updated_at = datetime('now') WHERE id = ?",
            )
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e.to_string() }))))?;

            Ok(Json(json!({ "success": false, "error": "AI 总结未产出有效内容" })))
        }
        Err(e) => {
            sqlx::query(
                "UPDATE knowledge_cards SET summarize_error = ?, updated_at = datetime('now') WHERE id = ?",
            )
            .bind(&e)
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e2| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": e2.to_string() }))))?;

            Ok(Json(json!({ "success": false, "error": format!("AI 总结失败: {}", e) })))
        }
    }
}

async fn http_open_url(
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let url = body
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if url.is_empty() {
        return Ok(Json(json!({ "success": false, "error": "url is required" })));
    }
    match open::that(url) {
        Ok(_) => Ok(Json(json!({ "success": true }))),
        Err(e) => Ok(Json(json!({ "success": false, "error": format!("failed to open url: {}", e) }))),
    }
}

pub async fn start_http_server(pool: SqlitePool) {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers(Any);

    // Static file serving for frontend (like Demo Express server)
    let mut app = Router::new()
        .route("/api/capture", post(http_capture))
        .route("/api/status", get(http_status))
        .route("/api/cards", get(http_get_cards))
        .route("/api/cards/{id}", get(http_get_card))
        .route("/api/cards/{id}", put(http_update_card))
        .route("/api/cards/{id}", delete(http_delete_card))
        .route("/api/cards/{id}/summarize", post(http_summarize_card))
        .route("/api/tags", get(http_get_tags))
        .route("/api/statistics", get(http_get_statistics))
        .route("/api/settings", get(http_get_settings))
        .route("/api/settings", put(http_update_settings))
        .route("/api/settings/validate", post(http_validate_settings))
        .route("/api/open-url", post(http_open_url))
        .layer(cors)
        .with_state(pool);

    // Add static file serving if dist exists
    if let Some(dist_path) = frontend_dist_dir() {
        tracing::info!("Serving frontend from {}", dist_path.display());
        app = app.fallback_service(ServeDir::new(dist_path));
    }

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
    let clean_id_str = card.card.clean_id_str().unwrap_or(&card.card.id);
    let clean_rows = sqlx::query("SELECT messages_json FROM clean_conversations WHERE id = ?")
        .bind(clean_id_str)
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
                "UPDATE knowledge_cards SET title = ?, original_question = ?, card_type = ?, narrative = ?, tags_json = ?, full_output = ?, summary_confidence = ?, updated_at = datetime('now'), summarize_error = NULL WHERE id = ?",
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
                "UPDATE knowledge_cards SET summarize_error = ?, updated_at = datetime('now') WHERE id = ?",
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
    fn clean_id_str(&self) -> Option<&str> {
        self.clean_id.as_deref()
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
    pub source: Option<String>,
}

// ============================================================
// AI Pipeline — 4 步流水线（话题切分 → 意图分类 → 卡片生成 → 去重）
// ============================================================

/// Intent mapping: English key → Chinese label + prompt directory
#[derive(Debug, Clone, Copy)]
struct IntentInfo { zh: &'static str, dir: &'static str }
static INTENT_MAP: &[(&str, IntentInfo)] = &[
    ("concept_exploration", IntentInfo { zh: "概念理解", dir: "concept-exploration" }),
    ("fact_lookup", IntentInfo { zh: "事实查询", dir: "fact-query" }),
    ("skill_learning", IntentInfo { zh: "技能学习", dir: "skill-learning" }),
    ("how_to", IntentInfo { zh: "操作指南", dir: "how-to" }),
    ("content_creation", IntentInfo { zh: "内容创作", dir: "content-creation" }),
    ("text_processing", IntentInfo { zh: "文本处理", dir: "text-processing" }),
    ("planning_decision", IntentInfo { zh: "规划决策", dir: "planning-decision" }),
    ("brainstorming", IntentInfo { zh: "头脑风暴", dir: "brainstorm" }),
    ("interactive_companion", IntentInfo { zh: "交互陪伴", dir: "interactive-companion" }),
    ("other", IntentInfo { zh: "其他", dir: "other" }),
];

fn intent_by_key(key: &str) -> IntentInfo {
    let key = key.trim();
    let lower = key.to_lowercase();
    // English key match (case-insensitive)
    if let Some(info) = INTENT_MAP.iter().find(|(k, _)| *k == lower) {
        return info.1;
    }
    // Chinese label match
    if let Some(info) = INTENT_MAP.iter().find(|(_, v)| v.zh == key) {
        return info.1;
    }
    IntentInfo { zh: "其他", dir: "other" }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct TopicBlock {
    start_idx: usize,
    end_idx: usize,
    topic_hint: String,
    start_msg_idx: usize,
    end_msg_idx: usize,
}

// ============================================================
// Pipeline step 1: Topic splitting
// ============================================================

async fn split_topics(
    api_key: &str, api_url: &str, model: &str,
    messages: &[Message],
) -> Result<Vec<TopicBlock>, String> {
    let user_msgs: Vec<(usize, &str)> = messages.iter()
        .enumerate()
        .filter(|(_, m)| m.role == "user" && !m.content.trim().is_empty())
        .map(|(i, m)| (i, m.content.as_str()))
        .collect();

    if user_msgs.is_empty() {
        tracing::warn!("[split_topics] no user messages");
        return Ok(vec![]);
    }

    let input_text = user_msgs.iter()
        .enumerate()
        .map(|(i, (_, content))| format!("[{}]: {}", i + 1, content))
        .collect::<Vec<_>>()
        .join("\n");

    let prompt_path = prompts_dir().join("topic-split").join("prompt.md");
    let prompt_raw = std::fs::read_to_string(&prompt_path)
        .map_err(|e| format!("读取话题切分 prompt 失败: {}", e))?;
    let system_prompt = extract_prompt_block(&prompt_raw);

    let final_prompt = if system_prompt.contains("{{conversation}}") {
        system_prompt.replace("{{conversation}}", &input_text)
    } else {
        format!("{}\n\n### 输入数据\n\n{}", system_prompt, input_text)
    };

    let response = call_openai_compat(api_key, api_url, model, &final_prompt,
        "请按 JSON 格式输出话题切分结果。", 0.3, 2000).await?;

    tracing::info!("[split_topics] raw response: {}", response.chars().take(300).collect::<String>());

    let json_str = extract_json_from_response(&response)?;
    let parsed: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("话题切分 JSON 解析失败: {}", e))?;

    let raw_blocks: Vec<serde_json::Value> = if parsed.is_array() {
        parsed.as_array().unwrap().clone()
    } else if let Some(tb) = parsed.get("topic_blocks") {
        tb.as_array().unwrap_or(&vec![]).clone()
    } else if parsed.get("start_idx").is_some() || parsed.get("start").is_some()
        || parsed.get("start_message").is_some() || parsed.get("start_user").is_some()
        || parsed.get("utterances").is_some() {
        vec![parsed.clone()]
    } else {
        vec![]
    };

    if raw_blocks.is_empty() {
        return Ok(vec![]);
    }

    // Infer indices if missing
    let has_any_index = raw_blocks.iter().any(|b| {
        b.get("start_idx").or(b.get("start")).or(b.get("start_message")).or(b.get("start_user")).is_some()
    });

    let mut blocks = raw_blocks;
    if !has_any_index && blocks.len() > 1 {
        for i in 0..blocks.len() {
            let si = if i == 0 { 1 } else { 0 };
            let ei = if i == blocks.len() - 1 { user_msgs.len() } else { 0 };
            blocks[i]["start_idx"] = serde_json::Value::Number(serde_json::Number::from(si));
            blocks[i]["end_idx"] = serde_json::Value::Number(serde_json::Number::from(ei));
        }
        for i in 0..blocks.len() {
            let start = if i == 0 { 1usize } else {
                blocks[i - 1]["end_idx"].as_u64().unwrap_or(1) as usize + 1
            };
            let end = if i == blocks.len() - 1 { user_msgs.len() } else { start };
            blocks[i]["start_idx"] = serde_json::Value::Number(serde_json::Number::from(start));
            blocks[i]["end_idx"] = serde_json::Value::Number(serde_json::Number::from(end));
        }
    }

    let n = user_msgs.len();
    let result: Vec<TopicBlock> = blocks.iter().map(|b| {
        let mut si = b.get("start_idx").or(b.get("start"))
            .or(b.get("start_message")).or(b.get("start_user"))
            .and_then(|v| v.as_u64()).unwrap_or(1) as usize;
        let mut ei = b.get("end_idx").or(b.get("end"))
            .or(b.get("end_message")).or(b.get("end_user"))
            .and_then(|v| v.as_u64()).unwrap_or(n as u64) as usize;

        // Try extracting from utterances array
        if si == 0 || ei == 0 {
            if let Some(utterances) = b.get("utterances").and_then(|v| v.as_array()) {
                let indices: Vec<usize> = utterances.iter()
                    .filter_map(|u| u.as_str())
                    .filter_map(|s| {
                        // Try matching User[N], Turn[N], or plain number
                        if let Some(m) = regex_match_number(s) {
                            return Some(m);
                        }
                        None
                    })
                    .collect();
                if !indices.is_empty() {
                    si = *indices.iter().min().unwrap();
                    ei = *indices.iter().max().unwrap();
                }
            }
        }

        if si == 0 { si = 1; }
        if ei == 0 { ei = n; }

        let topic_hint = b.get("topic_hint").or(b.get("topic"))
            .and_then(|v| v.as_str()).unwrap_or("").to_string();

        // Map 1-based user_msg index → actual messages array index
        let start_msg_idx = user_msgs.get(si - 1).map(|(idx, _)| *idx).unwrap_or(0);
        let end_msg_idx = user_msgs.get(ei - 1).map(|(idx, _)| *idx).unwrap_or(messages.len() - 1);

        TopicBlock { start_idx: si, end_idx: ei, topic_hint, start_msg_idx, end_msg_idx }
    }).collect();

    // Extend each block's end to include messages up to the next block's start
    let mut result = result;
    for i in 0..result.len() {
        if i < result.len() - 1 {
            let next_start = result[i + 1].start_msg_idx;
            result[i].end_msg_idx = std::cmp::max(result[i].end_msg_idx, next_start - 1);
        } else {
            result[i].end_msg_idx = messages.len() - 1;
        }
    }

    tracing::info!("[split_topics] {} blocks", result.len());
    Ok(result)
}

fn regex_match_number(s: &str) -> Option<usize> {
    // Simple digit extraction: find first sequence of digits
    let mut digits = String::new();
    let mut started = false;
    for c in s.chars() {
        if c.is_ascii_digit() {
            digits.push(c);
            started = true;
        } else if started {
            break;
        }
    }
    if digits.is_empty() { return None; }
    digits.parse::<usize>().ok()
}

// ============================================================
// Pipeline step 2: Intent classification
// ============================================================

async fn classify_intent(
    api_key: &str, api_url: &str, model: &str,
    block_messages: &[Message], platform: &str,
) -> Result<String, String> {
    let conversation_text = block_messages.iter()
        .map(|m| {
            let prefix = if m.role == "user" { "【用户】" } else { &format!("【{}】", platform) };
            format!("{}{}", prefix, m.content)
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    let prompt_path = prompts_dir().join("classifier").join("prompt.md");
    let prompt_raw = std::fs::read_to_string(&prompt_path)
        .map_err(|e| format!("读取意图分类 prompt 失败: {}", e))?;
    let system_prompt = extract_prompt_block(&prompt_raw);

    let response = call_openai_compat(api_key, api_url, model, &system_prompt,
        &format!("请判断以下对话的意图：\n\n{}", conversation_text),
        0.1, 100).await?;

    tracing::info!("[classify_intent] raw response: {:?}", response);
    let raw = response.trim().replace('`', "").replace('。', "").split('\n').next().unwrap_or("").to_lowercase();
    let info = intent_by_key(&raw);
    // Normalize to English key for consistent downstream routing
    let key = INTENT_MAP.iter()
        .find(|(_, v)| v.zh == info.zh && v.dir == info.dir)
        .map(|(k, _)| k.to_string())
        .unwrap_or_else(|| "other".to_string());
    Ok(key)
}

// ============================================================
// Pipeline step 3: Card generation
// ============================================================

async fn generate_card(
    api_key: &str, api_url: &str, model: &str,
    block_messages: &[Message], platform: &str,
    intent_dir: &str, card_type_zh: &str,
) -> Result<PipelineCardResult, String> {
    let conversation_text = block_messages.iter()
        .map(|m| {
            let prefix = if m.role == "user" { "【用户】" } else { &format!("【{}】", platform) };
            format!("{}{}", prefix, m.content)
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    let prompt_path = prompts_dir().join(intent_dir).join("prompt.md");
    let prompt_raw = std::fs::read_to_string(&prompt_path)
        .map_err(|e| format!("读取 {} prompt 失败: {}", intent_dir, e))?;
    let system_prompt = extract_prompt_block(&prompt_raw);

    let final_prompt = system_prompt.replace("{{conversation}}", &conversation_text);
    let user_prompt = format!("对话数据：\n\n{}\n\n请按 JSON 格式输出知识卡片。", conversation_text);

    let response = call_openai_compat(api_key, api_url, model, &final_prompt,
        &user_prompt, 0.3, 6000).await?;

    let first_brace = response.find('{').ok_or("未找到 JSON 对象")?;
    let last_brace = response.rfind('}').ok_or("未找到 JSON 对象")?;
    let json_str = &response[first_brace..=last_brace];

    let mut parsed: Option<serde_json::Value> = serde_json::from_str(json_str).ok();

    if parsed.is_none() {
        if let Some(repaired) = try_repair_json(json_str) {
            parsed = serde_json::from_str(&repaired).ok();
        }
    }

    let parsed = parsed.ok_or_else(|| {
        format!("JSON 解析失败（原始: {}）", json_str.chars().take(200).collect::<String>())
    })?;

    let raw_card_type = parsed["card_type"].as_str().unwrap_or("").to_string();
    let card_type = normalize_card_type(&raw_card_type, card_type_zh);

    let mut card = PipelineCardResult {
        title: sanitize_content(parsed["title"].as_str().unwrap_or("未命名对话")),
        card_type,
        original_question: sanitize_content(parsed["original_question"].as_str()
            .or(parsed["originalQuestion"].as_str()).unwrap_or("")),
        narrative: sanitize_content(parsed["narrative"].as_str().unwrap_or("")),
        tags: parsed["tags"].as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| sanitize_content(s))).collect())
            .unwrap_or_else(|| vec![platform.to_string()]),
        full_output: parsed["full_output"].as_str().map(|s| sanitize_content(s)),
        summary_confidence: parsed["summary_confidence"].as_f64(),
        source: None,
    };

    if card.narrative.is_empty() && card.full_output.is_some() {
        card.narrative = card.full_output.as_ref().unwrap().clone();
    }

    Ok(card)
}

fn normalize_card_type(card_type: &str, fallback: &str) -> String {
    if card_type.is_empty() { return fallback.to_string(); }
    // If already Chinese, return as-is
    if card_type.chars().any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c)) {
        return card_type.to_string();
    }
    // Map English key → Chinese
    intent_by_key(card_type).zh.to_string()
}

// ============================================================
// Pipeline step 4: Deduplication
// ============================================================

fn deduplicate_cards(cards: Vec<PipelineCardResult>) -> Vec<PipelineCardResult> {
    if cards.len() <= 1 { return cards; }
    let mut result = Vec::new();
    for card in cards {
        let is_dup = result.iter().any(|existing: &PipelineCardResult| {
            if existing.card_type != card.card_type { return false; }

            let q1 = existing.original_question.replace(char::is_whitespace, "");
            let q2 = card.original_question.replace(char::is_whitespace, "");
            let question_sim = if !q1.is_empty() && !q2.is_empty() {
                jaccard_similarity(&q1, &q2)
            } else { 0.0 };
            let question_contains = (!q1.is_empty() && !q2.is_empty())
                && (q1.contains(&q2) || q2.contains(&q1));

            let t1 = existing.title.replace(char::is_whitespace, "");
            let t2 = card.title.replace(char::is_whitespace, "");
            let title_sim = jaccard_similarity(&t1, &t2);
            let title_contains = t1.contains(&t2) || t2.contains(&t1);

            let n1 = existing.narrative.chars().take(200).collect::<String>();
            let n2 = card.narrative.chars().take(200).collect::<String>();
            let narrative_sim = if !n1.is_empty() && !n2.is_empty() {
                jaccard_similarity(&n1, &n2)
            } else { 0.0 };

            // Same capture check
            let same_capture = card.source.is_some()
                && existing.source.is_some()
                && card.source.as_ref() == existing.source.as_ref();

            if question_sim >= 0.7 && title_sim >= 0.3 { return true; }
            if title_sim >= 0.6 && question_sim >= 0.3 { return true; }
            if title_contains && question_contains { return true; }
            if title_contains && question_sim >= 0.6 { return true; }
            if question_sim >= 0.9 && narrative_sim >= 0.2 { return true; }
            if same_capture && narrative_sim >= 0.5 { return true; }
            if narrative_sim >= 0.65 { return true; }

            false
        });
        if !is_dup {
            result.push(card);
        } else {
            tracing::info!("[dedup] discarded: {}", card.title);
        }
    }
    result
}

fn jaccard_similarity(a: &str, b: &str) -> f64 {
    let s1: std::collections::HashSet<char> = a.chars().collect();
    let s2: std::collections::HashSet<char> = b.chars().collect();
    let intersection = s1.intersection(&s2).count() as f64;
    let union = s1.union(&s2).count() as f64;
    if union == 0.0 { return 0.0; }
    intersection / union
}

// ============================================================
// Main pipeline orchestrator
// ============================================================

async fn run_ai_pipeline(
    api_key: &str,
    api_url: &str,
    model: &str,
    messages: &[Message],
    platform: &str,
) -> Result<Vec<PipelineCardResult>, String> {
    tracing::info!("[AI Pipeline] 开始，{} 条消息", messages.len());

    // Step 1: Topic splitting
    let topic_blocks = match split_topics(api_key, api_url, model, messages).await {
        Ok(blocks) => blocks,
        Err(e) => {
            tracing::error!("[AI Pipeline] 话题切分失败: {}", e);
            // Fall back: treat all messages as one topic
            vec![TopicBlock {
                start_msg_idx: 0,
                end_msg_idx: messages.len() - 1,
                start_idx: 1,
                end_idx: messages.iter().filter(|m| m.role == "user").count(),
                topic_hint: "未切分话题".to_string(),
            }]
        }
    };

    if topic_blocks.is_empty() {
        tracing::error!("[AI Pipeline] 话题切分返回 0 个块");
        return Ok(vec![]);
    }

    tracing::info!("[AI Pipeline] 话题切分完成，{} 个块", topic_blocks.len());

    // Step 2 & 3: Intent classification + card generation for each block
    let mut cards = Vec::new();
    for (i, block) in topic_blocks.iter().enumerate() {
        let block_messages = &messages[block.start_msg_idx..=block.end_msg_idx.min(messages.len() - 1)];

        // Intent classification
        let intent_key = match classify_intent(api_key, api_url, model, block_messages, platform).await {
            Ok(key) => key,
            Err(e) => {
                tracing::error!("[AI Pipeline] 意图分类异常 (块 {}): {}", i + 1, e);
                "other".to_string()
            }
        };
        let intent = intent_by_key(&intent_key);
        tracing::info!("[AI Pipeline] 块 {} 意图: {} ({})", i + 1, intent.zh, block.topic_hint);

        // Card generation
        match generate_card(api_key, api_url, model, block_messages, platform,
                           intent.dir, intent.zh).await {
            Ok(card) => {
                tracing::info!("[AI Pipeline] 卡片生成: \"{}\" ({})", card.title, card.card_type);
                cards.push(card);
            }
            Err(e) => {
                tracing::error!("[AI Pipeline] 卡片生成异常 (块 {}): {}", i + 1, e);
                // Fallback card
                let raw_preview = block_messages.iter()
                    .filter(|m| m.role == "user")
                    .take(2)
                    .map(|m| format!("【你】{}", m.content.chars().take(200).collect::<String>()))
                    .collect::<Vec<_>>()
                    .join("\n\n");
                cards.push(PipelineCardResult {
                    title: if block.topic_hint.is_empty() { "对话片段".to_string() } else { block.topic_hint.clone() },
                    card_type: "其他".to_string(),
                    original_question: String::new(),
                    narrative: format!("AI 卡片生成失败: {}。以下是原始对话记录：\n\n{}", e, raw_preview),
                    tags: vec![platform.to_string()],
                    full_output: None,
                    summary_confidence: None,
                    source: None,
                });
            }
        }
    }

    // Step 4: Deduplication
    let deduplicated = deduplicate_cards(cards);
    tracing::info!("[AI Pipeline] 去重后剩余 {} 张卡片", deduplicated.len());

    Ok(deduplicated)
}

// ============================================================
// Helper: frontend dist path (for static file serving)
// ============================================================

fn frontend_dist_dir() -> Option<std::path::PathBuf> {
    let exe_dir = std::env::current_exe().ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_default();

    let mut current = exe_dir;
    for _ in 0..10 {
        let candidate = current.join("demo").join("web").join("dist");
        if candidate.exists() {
            return Some(candidate);
        }
        if let Some(parent) = current.parent() {
            current = parent.to_path_buf();
        } else {
            break;
        }
    }
    None
}

// ============================================================
// Helper: prompts directory path
// ============================================================

fn prompts_dir() -> std::path::PathBuf {
    // Dev:  exe at src-tauri/target/debug/ → walk up 2 levels to src-tauri/prompts/
    // Prod: prompts/ bundled as resource next to exe
    let exe_dir = std::env::current_exe().ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_default();

    // First check prompts/ directly next to exe (production bundle)
    let direct = exe_dir.join("prompts");
    if direct.exists() {
        return direct;
    }

    // Walk up to find prompts/ (development mode)
    let mut current = exe_dir;
    for _ in 0..10 {
        let candidate = current.join("prompts");
        if candidate.exists() {
            return candidate;
        }
        if let Some(parent) = current.parent() {
            current = parent.to_path_buf();
        } else {
            break;
        }
    }

    // Fallback: current working directory
    std::env::current_dir()
        .unwrap_or_default()
        .join("prompts")
}

// ============================================================
// Helper: extract prompt block from markdown
// ============================================================

fn extract_prompt_block(markdown: &str) -> String {
    // Strategy 1: Extract between "## 角色设定" and "## 示例输出"
    // Find all ## headers — use the "角色设定" → "示例输出" range
    if markdown.find("##").is_some() {
        let headers: Vec<(usize, &str)> = markdown.match_indices("##").collect();
        let mut role_start = None;
        let mut example_start = None;

        for (pos, _) in &headers {
            let line = &markdown[*pos..];
            if line.starts_with("## 角色设定") || line.starts_with("##\n角色设定") {
                role_start = Some(*pos);
            }
            if line.starts_with("## 示例输出") || line.starts_with("##\n示例输出") {
                example_start = Some(*pos);
            }
        }

        if let Some(start) = role_start {
            let end = example_start.unwrap_or(markdown.len());
            let section = &markdown[start..end];
            // Remove the header line itself
            if let Some(first_nl) = section.find('\n') {
                return section[first_nl + 1..].trim().to_string();
            }
        }
    }

    // Strategy 2: Extract between "## System Prompt" and next "##"
    if let Some(start) = markdown.find("## System Prompt") {
        let rest = &markdown[start..];
        if let Some(first_nl) = rest.find('\n') {
            let body = &rest[first_nl + 1..];
            if let Some(next_h) = body.find("\n## ") {
                return body[..next_h].trim().to_string();
            }
            return body.trim().to_string();
        }
    }

    // Strategy 3: Extract first ``` code block
    if let Some(code_start) = markdown.find("```") {
        let after_open = &markdown[code_start + 3..];
        // Skip optional language tag
        let content_start = after_open.find('\n').map(|i| i + 1).unwrap_or(0);
        let content = &after_open[content_start..];
        if let Some(code_end) = content.find("```") {
            return content[..code_end].trim().to_string();
        }
    }

    markdown.trim().to_string()
}

// ============================================================
// Helper: HTTP call to OpenAI-compatible API
// ============================================================

async fn call_openai_compat(
    api_key: &str, api_url: &str, model: &str,
    system_prompt: &str, user_prompt: &str,
    temperature: f64, max_tokens: u32,
) -> Result<String, String> {
    let chat_url = if api_url.ends_with("/chat/completions") {
        api_url.to_string()
    } else if api_url.ends_with("/v1") {
        format!("{}/chat/completions", api_url)
    } else {
        format!("{}/v1/chat/completions", api_url.trim_end_matches('/'))
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(&chat_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens
        }))
        .send()
        .await
        .map_err(|e| format!("API 请求失败: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API 错误 (HTTP {}): {}", status.as_u16(), body));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 API 响应失败: {}", e))?;

    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("API 返回内容为空")?;

    Ok(content.to_string())
}

// ============================================================
// Helper: Extract JSON from LLM response
// ============================================================

fn extract_json_from_response(text: &str) -> Result<String, String> {
    let first_brace = text.find('{').ok_or("未找到 JSON 对象")?;
    let last_brace = text.rfind('}').ok_or("未找到 JSON 对象")?;
    if last_brace <= first_brace {
        return Err("JSON 格式不完整".to_string());
    }
    Ok(text[first_brace..=last_brace].to_string())
}

// ============================================================
// Helper: 7-layer JSON repair
// ============================================================

fn try_repair_json(s: &str) -> Option<String> {
    let mut s = s.trim().to_string();

    // Layer 1: Remove markdown code fences
    if let Some(captures) = regex_match_code_block(&s) {
        s = captures;
    }

    // Layer 2: Extract { ... }
    let first = s.find('{')?;
    let last = s.rfind('}')?;
    if last <= first { return None; }
    s = s[first..=last].to_string();

    // Layer 3: Fix literal newlines inside strings
    s = fix_literal_newlines(&s);

    // Layer 4: Fix unclosed quotes
    s = fix_unclosed_quotes(&s);

    // Layer 5: Remove trailing commas
    while let Some(pos) = s.rfind(",}") {
        s.replace_range(pos..=pos + 1, "}");
    }
    while let Some(pos) = s.rfind(",]") {
        s.replace_range(pos..=pos + 1, "]");
    }

    // Layer 6: Fix missing commas
    s = regex_fix_missing_commas(&s);

    // Layer 7: Fix unclosed braces
    let open_b = s.chars().filter(|&c| c == '{').count();
    let close_b = s.chars().filter(|&c| c == '}').count();
    for _ in 0..(open_b.saturating_sub(close_b)) { s.push('}'); }
    let open_br = s.chars().filter(|&c| c == '[').count();
    let close_br = s.chars().filter(|&c| c == ']').count();
    for _ in 0..(open_br.saturating_sub(close_br)) { s.push(']'); }

    // Validate
    serde_json::from_str::<serde_json::Value>(&s).ok()?;
    Some(s)
}

fn regex_match_code_block(s: &str) -> Option<String> {
    let start = s.find("```")?;
    let after = &s[start + 3..];
    let content_start = after.find('\n').map(|i| i + 1).unwrap_or(0);
    let content = &after[content_start..];
    let end = content.find("```")?;
    Some(content[..end].trim().to_string())
}

fn fix_literal_newlines(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut in_string = false;
    let mut escaped = false;

    for ch in s.chars() {
        if escaped {
            result.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' && in_string {
            escaped = true;
            result.push(ch);
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            result.push(ch);
            continue;
        }
        if in_string && (ch == '\n' || ch == '\r') {
            result.push(' ');
            continue;
        }
        result.push(ch);
    }
    result
}

fn fix_unclosed_quotes(s: &str) -> String {
    let mut in_string = false;
    let mut escaped = false;
    let mut last_quote_idx = 0;

    let chars: Vec<char> = s.chars().collect();
    for (i, &ch) in chars.iter().enumerate() {
        if escaped {
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == '"' {
            if in_string {
                in_string = false;
            } else {
                in_string = true;
                last_quote_idx = i;
            }
        }
    }

    if in_string && last_quote_idx < chars.len() {
        let mut s = s.to_string();
        s.insert(last_quote_idx + 1, '"');
        return s;
    }
    s.to_string()
}

fn regex_fix_missing_commas(s: &str) -> String {
    // Fix patterns like: "value"\n  "next" → "value",\n  "next"
    // and: }\n  " → },\n  "
    let mut result = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut i = 0;
    while i < len {
        result.push(chars[i]);
        // Check if current char is a quote-close (", }, ], digit)
        let is_value_end = matches!(chars[i], '"' | '}' | ']' | '0'..='9');
        if is_value_end && i + 1 < len {
            // Look for whitespace then a quote (indicating missing comma)
            let mut j = i + 1;
            let mut only_whitespace = true;
            while j < len && chars[j] != '"' && chars[j] != '{' {
                if chars[j] != '\n' && chars[j] != '\r' && chars[j] != ' ' && chars[j] != '\t' {
                    only_whitespace = false;
                    break;
                }
                j += 1;
            }
            if only_whitespace && j < len && (chars[j] == '"' || chars[j] == '{') {
                result.push(',');
            }
        }
        i += 1;
    }
    result
}

// ============================================================
// Main
// ============================================================

fn main() {
    tracing_subscriber::fmt().init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
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
