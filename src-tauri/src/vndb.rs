//! VNDB（kana JSON API）数据源模块。
//!
//! 查询会社（producer）基本信息与开发作品列表，返回结构化数据供前端渲染 wikitext。

use std::time::Duration;

use serde::{Deserialize, Serialize};

/// VNDB 单部作品（原名、中文名、发行日期、VN id、关联关系）
#[derive(Debug, Clone, Serialize)]
pub struct VndbWork {
    pub original_title: String,
    pub chinese_title: Option<String>,
    pub date: Option<String>,
    /// VN id（如 "v32269"），用于前端关联层级判定
    pub id: String,
    /// 与其他 VN 的关联（relation 类型 + 目标 VN id）
    pub relations: Vec<VndbApiRelation>,
    /// 行尾编辑注释，当前 VNDB 模块始终为 None
    pub note: Option<String>,
}

/// VNDB producer（制作组织）信息（前端渲染 wikitext 所需）
#[derive(Debug, Clone, Serialize)]
struct VndbProducer {
    id: u64,
    name: String,
    aliases: Vec<String>,
    description: String,
    /// 官方网站
    official_website: Option<String>,
    /// X（原 Twitter）链接
    twitter: Option<String>,
    /// YouTube 链接
    youtube: Option<String>,
}

/// VNDB producer 查询结果（制作组织信息 + 开发作品列表）
#[derive(Debug, Clone, Serialize)]
pub struct VndbProducerData {
    producer: VndbProducer,
    galgames: Vec<VndbWork>,
}

#[derive(Debug, Deserialize)]
struct VndbApiTitle {
    lang: String,
    title: String,
    main: Option<bool>,
}

/// VNDB VN 间的关联关系项
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VndbApiRelation {
    /// 关联类型：orig(原作)/preq(前传)/seq(续作)/set(同世界观)/fan(fan disc) 等
    pub relation: String,
    /// 目标 VN id（如 "v32269"）
    pub id: String,
}

#[derive(Debug, Deserialize)]
struct VndbApiVn {
    id: String,
    olang: String,
    released: Option<String>,
    titles: Vec<VndbApiTitle>,
    #[serde(default)]
    relations: Vec<VndbApiRelation>,
}

#[derive(Debug, Deserialize)]
struct VndbApiResponse {
    results: Vec<VndbApiVn>,
    more: bool,
}

/// VNDB producer API 返回的扩展链接项
#[derive(Debug, Deserialize)]
struct VndbApiExtlink {
    label: Option<String>,
    url: String,
}

/// VNDB producer API 返回的会社信息项
#[derive(Debug, Deserialize)]
struct VndbApiProducer {
    /// VNDB id（形如 "p24"），按 id 查询时不返回，搜索时返回
    #[serde(default)]
    id: Option<String>,
    name: Option<String>,
    original: Option<String>,
    aliases: Option<Vec<String>>,
    description: Option<String>,
    extlinks: Option<Vec<VndbApiExtlink>>,
    /// producer 类型：co(会社)/in(个人)/ng(同人团体)，仅搜索结果返回
    #[serde(default, rename = "type")]
    ty: Option<String>,
}

/// VNDB producer 搜索结果项（前端下拉所需）
#[derive(Debug, Clone, Serialize)]
pub struct VndbProducerSearchItem {
    /// 纯数字 id（如 "24"）
    pub id: String,
    pub name: String,
    /// 原文（假名等）名称，无则 null
    pub original: Option<String>,
    pub aliases: Vec<String>,
    /// producer 类型：co(会社)/in(个人)/ng(同人团体)
    #[serde(rename = "type")]
    pub ty: Option<String>,
}

/// 根据 VNDB producer id 查询制作组织信息与开发作品列表
#[tauri::command]
pub async fn query_vndb_producer(producer_id: u64) -> Result<VndbProducerData, String> {
    let client = crate::http::build_client(Duration::from_secs(30))?;
    let producer = fetch_vndb_producer(&client, producer_id).await?;
    let galgames = fetch_vndb_galgames(&client, producer_id).await?;
    Ok(VndbProducerData { producer, galgames })
}

/// 按名称搜索 VNDB producer，返回最多 10 个匹配项（id/名称/别名/类型）
#[tauri::command]
pub async fn search_vndb_producers(keyword: String) -> Result<Vec<VndbProducerSearchItem>, String> {
    let client = crate::http::build_client(Duration::from_secs(30))?;
    let resp = client
        .post("https://api.vndb.org/kana/producer")
        .json(&serde_json::json!({
            "filters": ["search", "=", keyword],
            "fields": "id,name,original,aliases,type",
            "results": 10,
            "sort": "searchrank"
        }))
        .send()
        .await
        .map_err(|e| {
            let msg = format!("VNDB producer 搜索请求失败: {e}");
            log::error!("{msg}");
            msg
        })?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        let msg = vndb_http_error("VNDB producer 搜索", status, &body);
        log::error!("{msg}");
        return Err(msg);
    }
    let data = resp.json::<serde_json::Value>().await.map_err(|e| {
        let msg = format!("VNDB producer 搜索解析失败: {e}");
        log::error!("{msg}");
        msg
    })?;
    let results = data
        .get("results")
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();
    let items = results
        .into_iter()
        .filter_map(|v| {
            let producer: VndbApiProducer = serde_json::from_value(v).ok()?;
            let raw_id = producer.id.as_deref().unwrap_or("");
            let id = raw_id
                .strip_prefix('p')
                .unwrap_or(raw_id)
                .to_string();
            if id.is_empty() {
                log::warn!("VNDB producer 搜索结果 id 解析失败: {raw_id}");
                return None;
            }
            Some(VndbProducerSearchItem {
                id,
                name: producer
                    .name
                    .filter(|s| !s.is_empty())
                    .or_else(|| producer.original.clone().filter(|s| !s.is_empty()))
                    .unwrap_or_default(),
                original: producer.original.filter(|s| !s.is_empty()),
                aliases: producer.aliases.unwrap_or_default(),
                ty: producer.ty,
            })
        })
        .filter(|item| !item.id.is_empty() && !item.name.is_empty())
        .collect();
    Ok(items)
}

/// 拼接 VNDB HTTP 错误信息：状态码 + 响应体（VNDB 错误体为纯文本，如 `Invalid 'id' filter: ...`）
fn vndb_http_error(prefix: &str, status: reqwest::StatusCode, body: &str) -> String {
    let body = body.trim();
    if body.is_empty() {
        format!("{prefix} HTTP {status}")
    } else {
        format!("{prefix} HTTP {status}: {body}")
    }
}

/// 通过 VNDB kana API 查询制作组织基本信息（名称、别名、官网、简介）
async fn fetch_vndb_producer(
    client: &reqwest::Client,
    producer_id: u64,
) -> Result<VndbProducer, String> {
    let resp = client
        .post("https://api.vndb.org/kana/producer")
        .json(&serde_json::json!({
            "filters": ["id", "=", format!("p{producer_id}")],
            "fields": "name,original,aliases,description,extlinks{url,label}",
            "results": 10
        }))
        .send()
        .await
        .map_err(|e| {
            let msg = format!("VNDB producer API 请求失败: {e}");
            log::error!("{msg}");
            msg
        })?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        let msg = vndb_http_error("VNDB producer API", status, &body);
        log::error!("{msg}");
        return Err(msg);
    }
    let data = resp.json::<serde_json::Value>().await.map_err(|e| {
        let msg = format!("VNDB producer API 解析失败: {e}");
        log::error!("{msg}");
        msg
    })?;
    let producer = data
        .get("results")
        .and_then(|r| r.get(0))
        .ok_or_else(|| format!("VNDB 未找到 producer p{producer_id}"))?;
    let producer: VndbApiProducer = serde_json::from_value(producer.clone())
        .map_err(|e| format!("VNDB producer API 解析失败: {e}"))?;

    let name = producer
        .name
        .filter(|s| !s.is_empty())
        .or_else(|| producer.original.clone().filter(|s| !s.is_empty()))
        .unwrap_or_else(|| format!("p{producer_id}"));

    let mut aliases = producer.aliases.unwrap_or_default();
    if let Some(original) = producer.original {
        if !original.is_empty() && original != name && !aliases.contains(&original) {
            aliases.insert(0, original);
        }
    }

    // 从扩展链接中提取官网、X（Twitter）、YouTube
    let mut official_website = None;
    let mut twitter = None;
    let mut youtube = None;
    for link in producer.extlinks.unwrap_or_default() {
        match link.label.as_deref() {
            Some(label) if label.eq_ignore_ascii_case("Official website") => {
                official_website = Some(link.url);
            }
            Some(label) if label.eq_ignore_ascii_case("Xitter") => {
                twitter = Some(link.url);
            }
            Some(label) if label.eq_ignore_ascii_case("Youtube") => {
                youtube = Some(link.url);
            }
            _ => {}
        }
    }

    let description = producer.description.unwrap_or_default().trim().to_string();

    Ok(VndbProducer {
        id: producer_id,
        name,
        aliases,
        official_website,
        description,
        twitter,
        youtube,
    })
}

/// 从 VNDB kana API 的 VN 标题列表提取（原名、中文名）
///
/// 原名取 olang 且 main 的标题（回退 olang 首个，再回退 VN id）；
/// 中文名取 zh-Hans/zh-Hant 首个，且与原名不同。
fn extract_titles(vn: &VndbApiVn) -> (String, Option<String>) {
    let original = vn
        .titles
        .iter()
        .find(|t| t.lang == vn.olang && t.main.unwrap_or(false))
        .or_else(|| vn.titles.iter().find(|t| t.lang == vn.olang))
        .map(|t| t.title.clone())
        .unwrap_or_else(|| vn.id.clone());
    let chinese = vn
        .titles
        .iter()
        .find(|t| t.lang == "zh-Hans")
        .or_else(|| vn.titles.iter().find(|t| t.lang == "zh-Hant"))
        .map(|t| t.title.clone())
        .filter(|s| s != &original);
    (original, chinese)
}

/// 通过 VNDB kana API 查询该会社开发的视觉小说列表（含发售日与标题），分页拉取
async fn fetch_vndb_galgames(
    client: &reqwest::Client,
    producer_id: u64,
) -> Result<Vec<VndbWork>, String> {
    let mut works = Vec::new();
    let mut page = 1u32;
    loop {
        let resp = client
            .post("https://api.vndb.org/kana/vn")
            .json(&serde_json::json!({
                "filters": ["developer", "=", ["id", "=", format!("p{producer_id}")]],
                "fields": "id,released,olang,titles.lang,titles.title,titles.main,relations.relation,relations.id",
                "results": 100,
                "page": page
            }))
            .send()
            .await
            .map_err(|e| {
                let msg = format!("VNDB vn API 请求失败: {e}");
                log::error!("{msg}");
                msg
            })?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            let msg = vndb_http_error("VNDB vn API", status, &body);
            log::error!("{msg}");
            return Err(msg);
        }
        let data = resp.json::<VndbApiResponse>().await.map_err(|e| {
            let msg = format!("VNDB vn API 解析失败: {e}");
            log::error!("{msg}");
            msg
        })?;
        for vn in data.results {
            let (original_title, chinese_title) = extract_titles(&vn);
            works.push(VndbWork {
                original_title,
                chinese_title,
                date: vn.released,
                id: vn.id,
                relations: vn.relations,
                note: None,
            });
        }
        if !data.more {
            break;
        }
        page += 1;
    }
    Ok(works)
}
