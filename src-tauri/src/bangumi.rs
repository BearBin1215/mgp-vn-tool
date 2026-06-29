//! Bangumi 数据源模块（官方 v0 API）。
//!
//! 通过 Bangumi v0 API 抓取人物/组织信息与关联作品列表，并逐条获取作品发行日期，
//! 返回结构化数据供前端渲染 wikitext。
//!
//! - 会社信息：`GET /v0/persons/{id}`
//! - 作品列表：`GET /v0/persons/{id}/subjects`（全量，按 type 过滤）
//! - 作品日期：`GET /v0/subjects/{id}`（逐条顺序请求，失败跳过该条）

use std::collections::HashSet;
use std::time::Duration;

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;

use crate::settings;

/// Bangumi 单部作品（原名、中文名、发行日期）
#[derive(Debug, Clone, Serialize)]
pub struct BangumiWork {
    pub name: String,
    pub name_cn: Option<String>,
    pub date: Option<String>,
    /// 日期获取失败时的注释
    pub note: Option<String>,
}

/// Bangumi 会社信息（前端渲染 wikitext 所需）
#[derive(Debug, Clone, Serialize)]
struct BangumiCompany {
    id: u64,
    name: String,
    aliases: Vec<String>,
    official_website: Option<String>,
}

/// Bangumi 会社查询结果（会社信息 + 各分类作品列表）
#[derive(Debug, Clone, Serialize)]
pub struct BangumiCompanyData {
    company: BangumiCompany,
    anime: Vec<BangumiWork>,
    music: Vec<BangumiWork>,
    book: Vec<BangumiWork>,
}

/// 作品日期获取失败时追加到 wikitext 行尾的注释
const BANGUMI_DATE_MISSING_NOTE: &str = "<!-- Bangumi 条目信息获取失败，日期缺失 -->";

/// Bangumi v0 API 基地址
const API_BASE: &str = "https://api.bgm.tv";

#[derive(Debug, Clone, Copy)]
struct BangumiRequestSettings {
    timeout_secs: u64,
    retries: u64,
    retry_delay_ms: u64,
}

/// 根据 Bangumi person id 查询会社信息与各分类作品列表
#[tauri::command]
pub async fn query_bangumi_company(
    app: tauri::AppHandle,
    bgm_person_id: u64,
) -> Result<BangumiCompanyData, String> {
    let settings = read_bangumi_settings(&app);
    let client = crate::http::build_client(Duration::from_secs(settings.timeout_secs))?;
    let company = fetch_bangumi_company(&client, &settings, bgm_person_id)
        .await
        .map_err(|e| {
            log::error!("Bangumi 会社信息获取失败（person {bgm_person_id}）: {e}");
            e
        })?;
    let subjects = fetch_bangumi_subjects(&client, &settings, bgm_person_id)
        .await
        .map_err(|e| {
            log::error!("Bangumi 作品列表获取失败（person {bgm_person_id}）: {e}");
            e
        })?;
    let (anime, music, book) = build_works_by_category(&client, &settings, &subjects).await;
    Ok(BangumiCompanyData {
        company,
        anime,
        music,
        book,
    })
}

/// 从 Tauri Store 读取 Bangumi 请求配置（超时、重试次数、重试间隔），越界值会回退默认
fn read_bangumi_settings(app: &tauri::AppHandle) -> BangumiRequestSettings {
    let timeout_secs = settings::get_f64(app, "bangumiTimeout")
        .filter(|v| v.is_finite())
        .map(|v| v.clamp(1.0, 120.0) as u64)
        .unwrap_or(30);
    let retries = settings::get_f64(app, "bangumiRetries")
        .filter(|v| v.is_finite())
        .map(|v| v.clamp(0.0, 10.0) as u64)
        .unwrap_or(2);
    let retry_delay_ms = settings::get_f64(app, "bangumiRetryDelay")
        .filter(|v| v.is_finite())
        .map(|v| v.clamp(100.0, 30000.0) as u64)
        .unwrap_or(1000);

    BangumiRequestSettings {
        timeout_secs,
        retries,
        retry_delay_ms,
    }
}

/// GET 请求 Bangumi v0 API 并反序列化为 T，对服务器错误（5xx）/超时按配置重试
///
/// 4xx 立即失败（不重试）；其余网络错误与 5xx 重试。
async fn fetch_bangumi_json<T: DeserializeOwned>(
    client: &reqwest::Client,
    request_settings: &BangumiRequestSettings,
    url: &str,
) -> Result<T, String> {
    let attempts = request_settings.retries + 1;
    let mut last_error = String::new();

    for attempt in 0..attempts {
        let resp = client.get(url).send().await;
        match resp {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    return resp
                        .json::<T>()
                        .await
                        .map_err(|e| format!("Bangumi API 解析失败 {url}: {e}"));
                }

                // 读取响应体：Bangumi 错误为 JSON（含 title/description），失败时回退裸文本
                let body = resp.text().await.unwrap_or_default();
                last_error = format_bangumi_error(status, &body);
                if !status.is_server_error() {
                    break;
                }
            }
            Err(e) => {
                last_error = if e.is_timeout() {
                    format!(
                        "Bangumi 请求超时（{}s）: {url}",
                        request_settings.timeout_secs
                    )
                } else {
                    format!("Bangumi 请求失败: {url}: {e}")
                };
            }
        }

        if attempt + 1 < attempts {
            tokio::time::sleep(Duration::from_millis(request_settings.retry_delay_ms)).await;
        }
    }

    Err(last_error)
}

/// 将 Bangumi HTTP 错误响应格式化为可读信息
///
/// 优先取错误 JSON 的 `title`/`description`（如 `Not Found：resource can't be found...`）；
/// 解析失败或为空时回退到截断后的裸响应体。
fn format_bangumi_error(status: reqwest::StatusCode, body: &str) -> String {
    let trimmed = body.trim();
    let detail = serde_json::from_str::<Value>(trimmed)
        .ok()
        .and_then(|v| {
            let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("");
            let desc = v.get("description").and_then(|x| x.as_str()).unwrap_or("");
            let parts: Vec<&str> = [title, desc]
                .into_iter()
                .filter(|s| !s.is_empty())
                .collect();
            if parts.is_empty() {
                None
            } else {
                Some(parts.join("："))
            }
        })
        .unwrap_or_else(|| truncate(trimmed, 200));

    if detail.is_empty() {
        format!("Bangumi API HTTP {status}")
    } else {
        format!("Bangumi API HTTP {status}: {detail}")
    }
}

/// 按字符数截断字符串，超出加省略号
fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let cut: String = s.chars().take(max).collect();
        format!("{cut}…")
    }
}
#[derive(Debug, Deserialize)]
struct BangumiApiPerson {
    name: String,
    #[serde(default)]
    infobox: Vec<BangumiInfoboxItem>,
}

/// infobox 项；value 可能是字符串，也可能是 `[{ "v": .. }]` 数组
#[derive(Debug, Deserialize)]
struct BangumiInfoboxItem {
    key: String,
    value: Value,
}

/// 抓取人物/组织信息：名称、别名（别名/英文名/简体中文名）、官网（官网/主页）
async fn fetch_bangumi_company(
    client: &reqwest::Client,
    request_settings: &BangumiRequestSettings,
    person_id: u64,
) -> Result<BangumiCompany, String> {
    let url = format!("{API_BASE}/v0/persons/{person_id}");
    let person: BangumiApiPerson = fetch_bangumi_json(client, request_settings, &url).await?;

    let mut aliases = Vec::new();
    let mut official_website = None;
    for item in &person.infobox {
        match item.key.as_str() {
            "别名" | "英文名" | "简体中文名" => {
                aliases.extend(extract_infobox_strings(&item.value))
            }
            "官网" | "主页" => {
                if let Some(s) = extract_infobox_string(&item.value) {
                    official_website = Some(s);
                }
            }
            _ => {}
        }
    }

    Ok(BangumiCompany {
        id: person_id,
        name: person.name,
        aliases,
        official_website,
    })
}

/// infobox value 为单字符串时返回该值
fn extract_infobox_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// infobox value 为字符串或 `[{ "v": .. }]` 数组时，收集其中全部文本值
fn extract_infobox_strings(value: &Value) -> Vec<String> {
    if let Some(s) = value.as_str() {
        let s = s.trim();
        return if s.is_empty() {
            Vec::new()
        } else {
            vec![s.to_string()]
        };
    }
    value
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.get("v").and_then(|v| v.as_str()))
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Bangumi v0 API 人物关联条目列表项
#[derive(Debug, Deserialize)]
struct BangumiApiSubjectItem {
    id: u64,
    name: String,
    #[serde(default)]
    name_cn: Option<String>,
    #[serde(rename = "type")]
    ty: u32,
}

/// Bangumi v0 API 条目详情（仅取 date）
#[derive(Debug, Deserialize)]
struct BangumiApiSubject {
    #[serde(default)]
    date: Option<String>,
}

/// 抓取人物关联条目列表，按 id 去重，仅保留书籍(1)/动画(2)/音乐(3)
///
/// `/v0/persons/{id}/subjects` 一次返回全量列表（无分页）。
async fn fetch_bangumi_subjects(
    client: &reqwest::Client,
    request_settings: &BangumiRequestSettings,
    person_id: u64,
) -> Result<Vec<BangumiApiSubjectItem>, String> {
    let url = format!("{API_BASE}/v0/persons/{person_id}/subjects");
    let subjects: Vec<BangumiApiSubjectItem> =
        fetch_bangumi_json(client, request_settings, &url).await?;

    let mut seen = HashSet::new();
    Ok(subjects
        .into_iter()
        .filter(|s| matches!(s.ty, 1 | 2 | 3) && seen.insert(s.id))
        .collect())
}

/// 逐条顺序获取作品发行日期，按 type 分入动画/音乐/书籍
///
/// 串行请求降低服务器压力、避免触发限流等；
/// 单条详情获取失败时跳过该条、标记行尾注释，继续下一条。
async fn build_works_by_category(
    client: &reqwest::Client,
    request_settings: &BangumiRequestSettings,
    subjects: &[BangumiApiSubjectItem],
) -> (Vec<BangumiWork>, Vec<BangumiWork>, Vec<BangumiWork>) {
    let mut anime = Vec::new();
    let mut music = Vec::new();
    let mut book = Vec::new();

    for subject in subjects {
        let url = format!("{API_BASE}/v0/subjects/{}", subject.id);
        // name 与 name_cn 在成功/失败两分支一致，先统一计算；仅 date/note 因结果而异
        let name = subject.name.clone();
        let name_cn = subject
            .name_cn
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let work =
            match fetch_bangumi_json::<BangumiApiSubject>(client, request_settings, &url).await {
                Ok(detail) => BangumiWork {
                    name,
                    name_cn,
                    date: detail.date.filter(|s| !s.is_empty()),
                    note: None,
                },
                Err(e) => {
                    log::warn!("Bangumi 条目 {} 日期获取失败，跳过: {e}", subject.id);
                    BangumiWork {
                        name,
                        name_cn,
                        date: None,
                        note: Some(BANGUMI_DATE_MISSING_NOTE.to_string()),
                    }
                }
            };

        match subject.ty {
            2 => anime.push(work),
            3 => music.push(work),
            1 => book.push(work),
            _ => {}
        }
    }

    (anime, music, book)
}
