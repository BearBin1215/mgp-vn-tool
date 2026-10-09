//! 萌百批量查询命令
//!
//! 分批与 continue 分页循环在此统一实现，调用方单次 invoke 即获得整个查询结果。
//! 单批标题数上限按当前用户 `apihighlimits` 权限判定（500/50），每次命令调用时
//! 实时查询；批次间串行发送请求，避免萌百 API 对多并发敏感导致出错。

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::ToolError;
use crate::moegirl::{
    build_request_context, json_params, send_with_context, MoegirlRequestContext,
};

/// 具备 apihighlimits 权限时的单批标题上限
const HIGH_LIMIT_BATCH_SIZE: usize = 500;
/// 普通用户的单批标题上限
const DEFAULT_BATCH_SIZE: usize = 50;

/// MediaWiki 响应的外壳：query 数据 + 顶层 continue 游标
#[derive(Deserialize)]
struct PagedResponse<Q> {
    query: Option<Q>,
    /// continue 对象的键名因 prop/list 而异，值原样透传给下一次请求
    #[serde(rename = "continue", default)]
    next: HashMap<String, Value>,
}

/// 将 MediaWiki 响应 JSON 解析为目标结构，失败时给出结构化错误
fn parse_response<T: serde::de::DeserializeOwned>(res: Value) -> Result<T, ToolError> {
    serde_json::from_value(res).map_err(|e| {
        ToolError::new(
            "moegirl_parse_failed",
            [("detail", json!(e.to_string()))],
            format!("萌百响应解析失败: {e}"),
        )
    })
}

/// 执行带 continue 分页的萌百查询，每页回调 handle 处理 query 数据
///
/// `continue_keys` 为该查询可能出现的游标键；响应 continue 对象中不再含任何
/// 已知的非空游标键时结束循环。
async fn paged_query<Q, F>(
    ctx: &MoegirlRequestContext,
    params: &HashMap<String, Value>,
    continue_keys: &[&str],
    mut handle: F,
) -> Result<(), ToolError>
where
    Q: serde::de::DeserializeOwned,
    F: FnMut(Q) -> Result<(), ToolError>,
{
    let mut continue_params: HashMap<String, Value> = HashMap::new();
    loop {
        let mut merged = params.clone();
        for (key, value) in &continue_params {
            merged.insert(key.clone(), value.clone());
        }
        let res = send_with_context(ctx, "POST", &merged).await?;
        let raw: PagedResponse<Q> = parse_response(res)?;
        if let Some(query) = raw.query {
            handle(query)?;
        }

        // 仅保留已知的非空游标键；无任何已知键时结束
        continue_params.clear();
        for key in continue_keys {
            if let Some(value) = raw
                .next
                .get(*key)
                .filter(|v| v.as_str().is_some_and(|s| !s.is_empty()))
            {
                continue_params.insert((*key).to_string(), value.clone());
            }
        }
        if continue_params.is_empty() {
            break;
        }
    }
    Ok(())
}

/// 收集 MediaWiki 顶层的 redirects/converted 数组为 from → to 映射，字段缺失或为空时跳过
fn collect_from_to(entries: &[FromTo], map: &mut HashMap<String, String>) {
    for entry in entries {
        if let (Some(from), Some(to)) = (&entry.from, &entry.to) {
            if !from.is_empty() && !to.is_empty() {
                map.insert(from.clone(), to.clone());
            }
        }
    }
}

/// 判断是否为每个条目都有的冗余分类：日本游戏作品、以「作品」结尾的分类、
/// 与条目名相同的 PAGENAME 分类
fn is_excluded_category(category: &str, article_title: &str) -> bool {
    if category == "日本游戏作品" || category.ends_with("作品") {
        return true;
    }
    category == base_title(article_title)
}

/// 去掉标题末尾的 ASCII 括号后缀（如「雫(Leaf)」→「雫」），再去除首尾空白
fn base_title(title: &str) -> String {
    let trimmed = title.trim();
    let Some(without_close) = trimmed.strip_suffix(')') else {
        return trimmed.to_string();
    };
    match without_close.find('(') {
        Some(open) => without_close[..open].trim().to_string(),
        None => trimmed.to_string(),
    }
}

/// prop=info/categories 或 prop=redirects/categories 查询的 query 数据
#[derive(Deserialize)]
struct PagesQuery {
    #[serde(default)]
    pages: Vec<PageEntry>,
    #[serde(default)]
    redirects: Vec<FromTo>,
    #[serde(default)]
    converted: Vec<FromTo>,
}

/// 单个页面条目
#[derive(Deserialize)]
struct PageEntry {
    pageid: Option<i64>,
    title: Option<String>,
    missing: Option<bool>,
    #[serde(default)]
    categories: Vec<TitleEntry>,
    /// prop=redirects 时指向该页面的重定向列表（rdprop=title）
    #[serde(default)]
    redirects: Vec<TitleEntry>,
}

/// 顶层的 redirects/converted 数组元素
#[derive(Deserialize)]
struct FromTo {
    from: Option<String>,
    to: Option<String>,
}

/// 带 title 字段的数组元素（分类条目、重定向条目）
#[derive(Deserialize)]
struct TitleEntry {
    title: Option<String>,
}

/// 页面信息
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    page_id: Option<i64>,
    title: String,
    is_disambiguation: bool,
    /// 页面所属分类列表（已去除 Category: 前缀）
    categories: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    converted_from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    redirect_to: Option<String>,
}

/// 批量查询页面信息（含分类、消歧义判定、繁简转换与重定向映射），返回标题到页面信息的映射
///
/// 键包括规范标题与命中该页面的繁简转换、重定向原始查询标题。
#[tauri::command]
pub async fn moegirl_query_page_info(
    app: tauri::AppHandle,
    titles: Vec<String>,
) -> Result<HashMap<String, PageInfo>, ToolError> {
    if titles.is_empty() {
        return Ok(HashMap::new());
    }
    let ctx = build_request_context(&app)?;
    let batch_size = query_batch_size(&ctx).await?;

    // 繁简转换映射：原始标题 → 转换后标题
    let mut converted_map: HashMap<String, String> = HashMap::new();
    // 重定向映射：原始标题 → 重定向目标
    let mut redirect_map: HashMap<String, String> = HashMap::new();
    let mut result: HashMap<String, PageInfo> = HashMap::new();

    for chunk in titles.chunks(batch_size) {
        let params = json_params(&[
            ("action", json!("query")),
            ("prop", json!("info|categories")),
            ("titles", json!(chunk)),
            ("redirects", json!("1")),
            ("converttitles", json!("1")),
            ("clshow", json!("!hidden")),
            ("cllimit", json!("max")),
        ]);
        paged_query::<PagesQuery, _>(&ctx, &params, &["clcontinue", "continue"], |query| {
            collect_from_to(&query.redirects, &mut redirect_map);
            collect_from_to(&query.converted, &mut converted_map);

            for page in query.pages {
                // 按标题查询返回的页面必带 title，异常缺失时无法建立映射，跳过
                let Some(page_title) = page.title else { continue };
                let is_missing = page.missing.unwrap_or(false);
                let category_names: Vec<String> = page
                    .categories
                    .iter()
                    .filter_map(|c| c.title.as_deref())
                    .map(|c| c.strip_prefix("Category:").unwrap_or(c).to_string())
                    .collect();
                let is_disambiguation = category_names.iter().any(|c| c == "消歧义页");

                // 反向查找命中该页面的原始标题：优先繁简转换，其次重定向
                let original_title = converted_map
                    .iter()
                    .find(|(_, to)| **to == page_title)
                    .map(|(from, _)| from.clone())
                    .or_else(|| {
                        redirect_map
                            .iter()
                            .find(|(_, to)| **to == page_title)
                            .map(|(from, _)| from.clone())
                    });

                // 命中该页面的当前批次原始标题；convertedFrom/redirectTo 记录最后一个命中的原始标题
                let mut converted_from = None;
                let mut redirect_to = None;
                let mut matched_keys = Vec::new();
                if original_title.as_deref().is_some_and(|o| o != page_title) {
                    for t in chunk {
                        let converted_match =
                            converted_map.get(t).is_some_and(|to| *to == page_title);
                        let redirect_match =
                            redirect_map.get(t).is_some_and(|to| *to == page_title);
                        if converted_match || redirect_match {
                            if converted_match {
                                converted_from = Some((*t).to_string());
                            }
                            if redirect_match {
                                redirect_to = Some((*t).to_string());
                            }
                            matched_keys.push((*t).to_string());
                        }
                    }
                }

                let info = PageInfo {
                    page_id: if is_missing { None } else { page.pageid },
                    title: page_title.clone(),
                    is_disambiguation,
                    categories: category_names,
                    converted_from,
                    redirect_to,
                };
                for key in matched_keys {
                    result.insert(key, info.clone());
                }
                if let Some(original) = original_title {
                    if original != page_title {
                        result.insert(original, info.clone());
                    }
                }
                result.insert(page_title, info);
            }
            Ok(())
        })
        .await?;
    }
    Ok(result)
}

/// 页面分类与重定向数据
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageDataEntry {
    /// 页面分类（已去除 Category: 前缀并过滤冗余分类）
    categories: Vec<String>,
    /// 该标题为重定向时的目标标题
    #[serde(skip_serializing_if = "Option::is_none")]
    redirect_to: Option<String>,
    /// 指向该页面的重定向标题列表
    page_redirects: Vec<String>,
}

/// 批量查询页面分类与重定向数据，返回标题（含重定向原始标题）到数据的映射
#[tauri::command]
pub async fn moegirl_query_page_data(
    app: tauri::AppHandle,
    titles: Vec<String>,
) -> Result<HashMap<String, PageDataEntry>, ToolError> {
    if titles.is_empty() {
        return Ok(HashMap::new());
    }
    let ctx = build_request_context(&app)?;
    let batch_size = query_batch_size(&ctx).await?;

    // 重定向映射：原始标题 → 重定向目标，跨批次累积
    let mut redirects: HashMap<String, String> = HashMap::new();
    let mut entries: HashMap<String, PageDataEntry> = HashMap::new();

    for chunk in titles.chunks(batch_size) {
        let params = json_params(&[
            ("action", json!("query")),
            ("prop", json!("redirects|categories")),
            ("titles", json!(chunk)),
            ("redirects", json!("1")),
            ("rdprop", json!("title")),
            ("rdlimit", json!("max")),
            ("cllimit", json!("max")),
            ("clshow", json!("!hidden")),
        ]);
        paged_query::<PagesQuery, _>(&ctx, &params, &["clcontinue", "rdcontinue", "continue"], |query| {
            for entry in query.redirects {
                let (Some(from), Some(to)) = (entry.from, entry.to) else {
                    continue;
                };
                if from.is_empty() || to.is_empty() {
                    continue;
                }
                redirects.insert(from.clone(), to.clone());
                // 原始标题的条目记录重定向目标，即使目标页面没有分类或重定向数据
                entries.entry(from).or_default().redirect_to = Some(to);
            }

            for page in query.pages {
                // 按标题查询返回的页面必带 title，异常缺失时无法建立映射，跳过
                let Some(title) = page.title else { continue };

                if !page.categories.is_empty() {
                    let cats: Vec<String> = page
                        .categories
                        .iter()
                        .filter_map(|c| c.title.as_deref())
                        .map(|c| c.strip_prefix("Category:").unwrap_or(c))
                        .filter(|c| !is_excluded_category(c, &title))
                        .map(|c| c.to_string())
                        .collect();
                    entries.entry(title.clone()).or_default().categories = cats.clone();
                    // 分类同步给重定向到该页面的原始标题（映射跨批次累积）
                    for (from, to) in redirects.iter() {
                        if to == &title {
                            entries.entry(from.clone()).or_default().categories = cats.clone();
                        }
                    }
                }

                if !page.redirects.is_empty() {
                    let redirect_titles: Vec<String> = page
                        .redirects
                        .iter()
                        .filter_map(|r| r.title.clone())
                        .collect();
                    entries.entry(title.clone()).or_default().page_redirects =
                        redirect_titles.clone();
                    // 重定向列表同步给原始标题；已有自身重定向列表时保留原值
                    for (from, to) in redirects.iter() {
                        if to == &title
                            && entries.get(from).is_none_or(|e| e.page_redirects.is_empty())
                        {
                            entries.entry(from.clone()).or_default().page_redirects =
                                redirect_titles.clone();
                        }
                    }
                }
            }
            Ok(())
        })
        .await?;
    }
    Ok(entries)
}

/// logevents 查询的 query 数据
#[derive(Deserialize)]
struct LogEventsQuery {
    #[serde(default)]
    logevents: Vec<LogEventRaw>,
}

/// logevents 单条日志的原始数据
#[derive(Deserialize)]
struct LogEventRaw {
    logid: Option<u64>,
    title: Option<String>,
    timestamp: Option<String>,
    params: Option<LogEventParamsRaw>,
}

/// move 日志详情
#[derive(Deserialize)]
struct LogEventParamsRaw {
    target_ns: Option<i64>,
    target_title: Option<String>,
}

/// logevents 单条日志
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEvent {
    logid: Option<u64>,
    /// 页面标题
    title: String,
    /// 时间戳（ISO 8601）
    timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<LogEventParams>,
}

/// move 日志详情
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LogEventParams {
    target_ns: Option<i64>,
    target_title: Option<String>,
}

/// 抓取时间段内主命名空间的全部指定类型日志
///
/// logevents 从新到旧枚举，故 lestart 传较晚的终点、leend 传较早的起点，
/// 与直觉方向相反。
#[tauri::command]
pub async fn moegirl_query_log_events(
    app: tauri::AppHandle,
    event_type: String,
    start_iso: String,
    end_iso: String,
) -> Result<Vec<LogEvent>, ToolError> {
    let ctx = build_request_context(&app)?;
    let params = json_params(&[
        ("action", json!("query")),
        ("list", json!("logevents")),
        ("letype", json!(event_type)),
        ("lenamespace", json!(0)),
        ("lestart", json!(end_iso)),
        ("leend", json!(start_iso)),
        ("leprop", json!("ids|title|timestamp|details")),
        ("lelimit", json!("max")),
    ]);
    let mut events: Vec<LogEvent> = Vec::new();
    paged_query::<LogEventsQuery, _>(&ctx, &params, &["lecontinue", "continue"], |query| {
        for ev in query.logevents {
            let (Some(title), Some(timestamp)) = (ev.title, ev.timestamp) else {
                continue;
            };
            events.push(LogEvent {
                logid: ev.logid,
                title,
                timestamp,
                params: ev.params.map(|p| LogEventParams {
                    target_ns: p.target_ns,
                    target_title: p.target_title,
                }),
            });
        }
        Ok(())
    })
    .await?;
    Ok(events)
}

/// prop=revisions 查询的 query 数据
#[derive(Deserialize)]
struct RevisionsQuery {
    #[serde(default)]
    pages: Vec<RevisionPageEntry>,
}

/// 单个页面条目
#[derive(Deserialize)]
struct RevisionPageEntry {
    title: Option<String>,
    #[serde(default)]
    revisions: Vec<RevisionEntry>,
}

/// 单条修订
#[derive(Deserialize)]
struct RevisionEntry {
    #[serde(default)]
    slots: RevisionSlots,
}

/// 修订内容槽
#[derive(Deserialize, Default)]
struct RevisionSlots {
    #[serde(default)]
    main: Option<SlotContent>,
}

/// main 槽内容
#[derive(Deserialize)]
struct SlotContent {
    content: Option<String>,
}

/// 批量获取页面 wikitext 源代码，返回标题到源代码的映射（缺失或已删除的页面不在结果中）
#[tauri::command]
pub async fn moegirl_query_page_wikitexts(
    app: tauri::AppHandle,
    titles: Vec<String>,
) -> Result<HashMap<String, String>, ToolError> {
    if titles.is_empty() {
        return Ok(HashMap::new());
    }
    let ctx = build_request_context(&app)?;
    let batch_size = query_batch_size(&ctx).await?;

    let mut result: HashMap<String, String> = HashMap::new();
    for chunk in titles.chunks(batch_size) {
        let params = json_params(&[
            ("action", json!("query")),
            ("prop", json!("revisions")),
            ("rvprop", json!("content")),
            ("rvslots", json!("main")),
            ("titles", json!(chunk)),
        ]);
        paged_query::<RevisionsQuery, _>(&ctx, &params, &[], |query| {
            for page in query.pages {
                let Some(title) = page.title else { continue };
                let content = page
                    .revisions
                    .into_iter()
                    .next()
                    .and_then(|r| r.slots.main)
                    .and_then(|m| m.content);
                let Some(content) = content else { continue };
                if content.is_empty() {
                    continue;
                }
                result.insert(title, content);
            }
            Ok(())
        })
        .await?;
    }
    Ok(result)
}

/// 查询当前用户是否具有 apihighlimits 权限，返回批量查询单批标题上限
async fn query_batch_size(ctx: &MoegirlRequestContext) -> Result<usize, ToolError> {
    #[derive(Deserialize)]
    struct UserinfoQuery {
        userinfo: Userinfo,
    }
    #[derive(Deserialize)]
    struct Userinfo {
        #[serde(default)]
        rights: Vec<String>,
    }

    let params = json_params(&[
        ("action", json!("query")),
        ("meta", json!("userinfo")),
        ("uiprop", json!("rights")),
    ]);
    let res = send_with_context(ctx, "POST", &params).await?;
    let parsed: PagedResponse<UserinfoQuery> = parse_response(res)?;
    let has_high_limits = parsed
        .query
        .map(|q| q.userinfo.rights.iter().any(|r| r == "apihighlimits"))
        .unwrap_or(false);
    Ok(if has_high_limits {
        HIGH_LIMIT_BATCH_SIZE
    } else {
        DEFAULT_BATCH_SIZE
    })
}

#[cfg(test)]
mod tests {
    use super::{base_title, is_excluded_category};

    /// 验证消歧义括号后缀的去除规则：自首个 ASCII 左括号起、至结尾右括号止
    #[test]
    fn strips_paren_suffix() {
        assert_eq!(base_title("雫(Leaf)"), "雫");
        assert_eq!(base_title("a(b)c(d)"), "a");
        assert_eq!(base_title("无括号"), "无括号");
        assert_eq!(base_title("  空白  "), "空白");
        assert_eq!(base_title("只有尾括号("), "只有尾括号(");
    }

    /// 验证冗余分类判定
    #[test]
    fn excludes_redundant_categories() {
        assert!(is_excluded_category("日本游戏作品", "任意条目"));
        assert!(is_excluded_category("Leaf作品", "任意条目"));
        assert!(is_excluded_category("雫", "雫(Leaf)"));
        assert!(!is_excluded_category("视觉小说", "雫(Leaf)"));
        assert!(!is_excluded_category("消歧义页", "雫(Leaf)"));
    }
}
