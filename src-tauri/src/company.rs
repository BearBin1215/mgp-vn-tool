//! VNDB / Bangumi 会社条目生成模块。
//!
//! 抓取 VNDB/Bangumi 的会社原始数据返回前端，由前端渲染 wikitext（与 cv-generator 架构一致）。

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use scraper::{ElementRef, Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::settings;

#[derive(Debug, Clone, Serialize)]
struct LinkInfo {
    label: String,
    url: String,
}

#[derive(Debug, Clone, Serialize)]
struct Work {
    original_title: String,
    chinese_title: Option<String>,
    date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct VndbRelease {
    vn_id: String,
    romanized_title: String,
    date: Option<String>,
}

/// VNDB 关联会社/系列项（关联类型 + 链接列表）
#[derive(Debug, Clone, Serialize)]
struct CompanyRelation {
    label: String,
    links: Vec<LinkInfo>,
}

/// Bangumi 信息框键值对
#[derive(Debug, Clone, Serialize)]
struct InfoItem {
    label: String,
    value: String,
}

#[derive(Debug, Clone, Serialize)]
struct VndbCompany {
    id: u64,
    name: String,
    aliases: Vec<String>,
    official_website: Option<LinkInfo>,
    relations: Vec<CompanyRelation>,
    description: String,
    releases: Vec<VndbRelease>,
}

#[derive(Debug, Clone, Serialize)]
struct BangumiCompany {
    id: u64,
    name: String,
    aliases: Vec<String>,
    official_website: Option<LinkInfo>,
    image_url: Option<String>,
    info_items: Vec<InfoItem>,
}

/// 会社条目生成的原始数据（前端渲染 wikitext 所需）
#[derive(Debug, Clone, Serialize)]
struct CompanyData {
    vndb: VndbCompany,
    bangumi: Option<BangumiCompany>,
    galgames: Vec<Work>,
    anime: Vec<Work>,
    music: Vec<Work>,
    book: Vec<Work>,
}

#[derive(Debug, Clone, Copy)]
struct BangumiRequestSettings {
    timeout_secs: u64,
    retries: u64,
    retry_delay_ms: u64,
}

#[derive(Debug, Deserialize)]
struct VndbApiTitle {
    lang: String,
    title: String,
    main: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct VndbApiVn {
    id: String,
    olang: String,
    titles: Vec<VndbApiTitle>,
}

#[derive(Debug, Deserialize)]
struct VndbApiResponse {
    results: Vec<VndbApiVn>,
}

/// 根据 VNDB producer id（可选 Bangumi person id）抓取会社原始数据
///
/// 从 VNDB 抓取会社信息与作品，可选从 Bangumi 补充 Logo/别名/官网/衍生作品，
/// 返回结构化数据由前端渲染为 wikitext。VNDB/Bangumi 一致性校验由前端处理。
#[tauri::command]
pub async fn query_company_data(
    app: tauri::AppHandle,
    producer_id: u64,
    bgm_person_id: Option<u64>,
) -> Result<Value, String> {
    Ok(wrap_response(|| async move {
        let data = do_query_company_data(&app, producer_id, bgm_person_id).await?;
        serde_json::to_value(data).map_err(|e| e.to_string())
    })
    .await)
}

/// 将查询结果包装为统一的 `{ statusCode, result, response }` JSON
async fn wrap_response<F, Fut>(f: F) -> Value
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<Value, String>>,
{
    match f().await {
        Ok(data) => serde_json::json!({
            "statusCode": "200",
            "result": "success",
            "response": data,
        }),
        Err(e) => {
            log::error!("会社数据抓取失败: {e}");
            serde_json::json!({
                "statusCode": "0",
                "result": "fail",
                "response": e,
            })
        }
    }
}

/// 抓取 VNDB/Bangumi 会社数据与各分类作品列表
async fn do_query_company_data(
    app: &tauri::AppHandle,
    producer_id: u64,
    bgm_person_id: Option<u64>,
) -> Result<CompanyData, String> {
    // User-Agent：Bangumi 等要求非浏览器请求附带开发者标识与项目主页（开源项目需附主页与版本号）
    let user_agent = format!(
        "BearBin1215/mgp-vn-tool/{} (https://github.com/BearBin1215/mgp-vn-tool)",
        env!("CARGO_PKG_VERSION")
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(&user_agent)
        .build()
        .map_err(|e| e.to_string())?;
    let bangumi_settings = read_bangumi_settings(app);
    let bangumi_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(bangumi_settings.timeout_secs))
        .user_agent(&user_agent)
        .build()
        .map_err(|e| e.to_string())?;

    let vndb = fetch_vndb_company(&client, producer_id).await?;
    let title_map = fetch_vndb_titles(&client, &vndb.releases).await?;
    let galgames = vndb
        .releases
        .iter()
        .map(|r| {
            let (original_title, chinese_title) = title_map
                .get(&r.vn_id)
                .cloned()
                .unwrap_or_else(|| (r.romanized_title.clone(), None));
            let chinese_title = chinese_title.filter(|title| title != &r.romanized_title);
            Work {
                original_title,
                chinese_title,
                date: r.date.clone(),
            }
        })
        .collect::<Vec<_>>();

    let bangumi = if let Some(id) = bgm_person_id {
        Some(fetch_bangumi_company(&bangumi_client, &bangumi_settings, id).await?)
    } else {
        None
    };

    let mut anime = Vec::new();
    let mut music = Vec::new();
    let mut book = Vec::new();
    if let Some(bgm) = &bangumi {
        anime = fetch_bangumi_works(&bangumi_client, &bangumi_settings, bgm.id, "anime").await?;
        music = fetch_bangumi_works(&bangumi_client, &bangumi_settings, bgm.id, "music").await?;
        book = fetch_bangumi_works(&bangumi_client, &bangumi_settings, bgm.id, "book").await?;
    }

    Ok(CompanyData {
        vndb,
        bangumi,
        galgames,
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

/// 用给定 client GET 请求 url，返回响应文本（不重试）
async fn fetch_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {url}: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!("HTTP {status}: {url}"))
    }
}

/// GET 请求 Bangumi url，对服务器错误（5xx）/超时按配置重试，成功返回响应文本
async fn fetch_bangumi_text(
    client: &reqwest::Client,
    request_settings: &BangumiRequestSettings,
    url: &str,
) -> Result<String, String> {
    let attempts = request_settings.retries + 1;
    let mut last_error = String::new();

    for attempt in 0..attempts {
        let resp = client.get(url).send().await;
        match resp {
            Ok(resp) => {
                let status = resp.status();
                let text = resp.text().await.map_err(|e| e.to_string())?;
                if status.is_success() {
                    return Ok(text);
                }

                last_error = format!("Bangumi HTTP {status}: {url}");
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

/// 抓取 VNDB 会社页面，解析会社名、别名、官网、关联与发行记录
async fn fetch_vndb_company(
    client: &reqwest::Client,
    producer_id: u64,
) -> Result<VndbCompany, String> {
    let url = format!("https://vndb.org/p{producer_id}/vn");
    let html = fetch_text(client, &url).await?;
    let document = Html::parse_document(&html);

    let name =
        first_text(&document, "main article h1").unwrap_or_else(|| format!("p{producer_id}"));
    let center_sel = sel("main article p.center")?;
    let centers: Vec<_> = document.select(&center_sel).collect();
    let aliases = centers
        .first()
        .map(|p| extract_aliases(&element_text(p)))
        .unwrap_or_default();

    let official_website = find_link_by_text(&document, "Official website");
    let relations = centers.get(1).map(extract_relations).unwrap_or_default();
    let description = first_text(&document, "main article div.description")
        .unwrap_or_default()
        .replace("[From Wikipedia]", "")
        .trim()
        .to_string();
    let releases = extract_vndb_releases(&document)?;

    Ok(VndbCompany {
        id: producer_id,
        name,
        aliases,
        official_website,
        relations,
        description,
        releases,
    })
}

/// 从「别名」文本中按行提取非空别名列表
fn extract_aliases(text: &str) -> Vec<String> {
    text.lines()
        .flat_map(|line| {
            let trimmed = line.trim();
            trimmed
                .strip_prefix("a.k.a.")
                .or_else(|| trimmed.strip_prefix("aka"))
                .map(|rest| rest.split(',').map(str::trim).collect::<Vec<_>>())
                .unwrap_or_default()
        })
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .collect()
}

/// 从关联节点提取每行关联类型及其链接列表
fn extract_relations(node: &ElementRef) -> Vec<CompanyRelation> {
    let mut output = Vec::new();
    let a_sel = Selector::parse("a[href]").unwrap();
    let segments = node
        .html()
        .split("<br>")
        .map(|part| {
            Html::parse_fragment(part)
                .root_element()
                .text()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect::<Vec<_>>();
    for line in segments
        .iter()
        .map(|s| s.trim())
        .filter(|line| !line.is_empty())
    {
        if let Some((label, _)) = line.split_once(':') {
            let links = node
                .select(&a_sel)
                .map(|a| LinkInfo {
                    label: element_text(&a),
                    url: normalize_url(
                        a.value().attr("href").unwrap_or_default(),
                        "https://vndb.org",
                    ),
                })
                .filter(|l| line.contains(&l.label))
                .collect::<Vec<_>>();
            output.push(CompanyRelation {
                label: label.trim().to_string(),
                links,
            });
        }
    }
    output
}

/// 从 VNDB 会社页面提取各发行的 VN id 与发售日
fn extract_vndb_releases(document: &Html) -> Result<Vec<VndbRelease>, String> {
    let item_sel = sel("main article ul.prodvns > li")?;
    let span_sel = sel("span")?;
    let link_sel = sel("a[href]")?;
    let mut seen = HashSet::new();
    let mut releases = Vec::new();

    for item in document.select(&item_sel) {
        let spans: Vec<_> = item.select(&span_sel).collect();
        let date = spans
            .first()
            .map(element_text)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty() && s != "TBA" && s != "unknown");
        let Some(link) = item.select(&link_sel).find(|a| {
            a.value()
                .attr("href")
                .map(|href| href.starts_with("/v"))
                .unwrap_or(false)
        }) else {
            continue;
        };
        let href = link.value().attr("href").unwrap_or_default();
        let vn_id = href
            .trim_start_matches('/')
            .split('/')
            .next()
            .unwrap_or_default()
            .to_string();
        if vn_id.is_empty() || !seen.insert(vn_id.clone()) {
            continue;
        }
        releases.push(VndbRelease {
            vn_id,
            romanized_title: element_text(&link),
            date,
        });
    }

    Ok(releases)
}

/// 批量查询 VNDB 标题 API，返回 VN id 到（原名、中文名）的映射
async fn fetch_vndb_titles(
    client: &reqwest::Client,
    releases: &[VndbRelease],
) -> Result<HashMap<String, (String, Option<String>)>, String> {
    let mut output = HashMap::new();
    for chunk in releases.chunks(90) {
        if chunk.is_empty() {
            continue;
        }
        let filters = if chunk.len() == 1 {
            serde_json::json!(["id", "=", chunk[0].vn_id.as_str()])
        } else {
            let mut filters = vec![serde_json::json!("or")];
            for release in chunk {
                filters.push(serde_json::json!(["id", "=", release.vn_id.as_str()]));
            }
            serde_json::json!(filters)
        };
        let resp = client
            .post("https://api.vndb.org/kana/vn")
            .json(&serde_json::json!({
                "filters": filters,
                "fields": "id,olang,titles.lang,titles.title,titles.main",
                "results": 100
            }))
            .send()
            .await
            .map_err(|e| format!("VNDB API 请求失败: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("VNDB API HTTP {}", resp.status()));
        }
        let data = resp
            .json::<VndbApiResponse>()
            .await
            .map_err(|e| format!("VNDB API 解析失败: {e}"))?;
        for item in data.results {
            let original = item
                .titles
                .iter()
                .find(|t| t.lang == item.olang && t.main.unwrap_or(false))
                .or_else(|| item.titles.iter().find(|t| t.lang == item.olang))
                .map(|t| t.title.clone())
                .unwrap_or_else(|| item.id.clone());
            let chinese = item
                .titles
                .iter()
                .find(|t| t.lang == "zh-Hans")
                .or_else(|| item.titles.iter().find(|t| t.lang == "zh-Hant"))
                .map(|t| t.title.clone())
                .filter(|s| s != &original);
            output.insert(item.id, (original, chinese));
        }
    }
    Ok(output)
}

/// 抓取 Bangumi 人物页面，解析会社名、别名、官网与 Logo
async fn fetch_bangumi_company(
    client: &reqwest::Client,
    request_settings: &BangumiRequestSettings,
    person_id: u64,
) -> Result<BangumiCompany, String> {
    let url = format!("https://bgm.tv/person/{person_id}");
    let html = fetch_bangumi_text(client, request_settings, &url).await?;
    let document = Html::parse_document(&html);

    let name = first_text(&document, ".nameSingle a")
        .or_else(|| first_text(&document, "h1 a"))
        .unwrap_or_else(|| format!("person/{person_id}"));
    let image_url = first_attr(&document, "#columnCrtA .infobox a.cover[href]", "href")
        .or_else(|| first_attr(&document, "#columnCrtA .infobox img.cover[src]", "src"))
        .map(|s| normalize_url(&s, "https://bgm.tv"));
    let info_items = extract_bangumi_info(&document)?;
    let mut aliases = Vec::new();
    let mut official_website = None;
    for item in &info_items {
        if matches!(item.label.as_str(), "别名" | "英文名" | "简体中文名") {
            aliases.push(item.value.clone());
        }
        if matches!(item.label.as_str(), "主页" | "官网") {
            official_website = Some(LinkInfo {
                label: item.value.clone(),
                url: item.value.clone(),
            });
        }
    }

    Ok(BangumiCompany {
        id: person_id,
        name,
        aliases,
        official_website,
        image_url,
        info_items,
    })
}

/// 从 Bangumi 信息框提取键值对列表
fn extract_bangumi_info(document: &Html) -> Result<Vec<InfoItem>, String> {
    let li_sel = sel("#columnCrtA .infobox_container ul#infobox > li")?;
    let tip_sel = sel("span.tip")?;
    let mut output = Vec::new();
    for li in document.select(&li_sel) {
        let label = li
            .select(&tip_sel)
            .next()
            .map(|tip| element_text(&tip).trim_end_matches(':').trim().to_string())
            .unwrap_or_default();
        let full = element_text(&li);
        let value = if !label.is_empty() {
            full.trim()
                .trim_start_matches(&label)
                .trim_start_matches(':')
                .trim()
                .to_string()
        } else {
            full.trim().to_string()
        };
        if !label.is_empty() && !value.is_empty() {
            output.push(InfoItem { label, value });
        }
    }
    Ok(output)
}

/// 抓取 Bangumi 人物某分类（anime/music/book）的作品列表，分页合并
async fn fetch_bangumi_works(
    client: &reqwest::Client,
    request_settings: &BangumiRequestSettings,
    person_id: u64,
    category: &str,
) -> Result<Vec<Work>, String> {
    let mut works = Vec::new();
    let mut page = 1usize;
    let mut max_page = 1usize;
    let mut seen_urls = HashSet::new();
    let expected_subject_type = bangumi_category_subject_type(category);

    while page <= max_page {
        let url = if page == 1 {
            format!("https://bgm.tv/person/{person_id}/works/{category}")
        } else {
            format!("https://bgm.tv/person/{person_id}/works/{category}?page={page}")
        };
        let html = fetch_bangumi_text(client, request_settings, &url).await?;
        let document = Html::parse_document(&html);
        max_page = max_page.max(extract_bangumi_max_page(&document));
        let item_sel = sel("#columnCrtB #browserItemList > li.item")?;
        let subject_type_sel = sel("h3 span[class*='subject_type_']")?;
        let title_sel = sel("h3 a.l[href]")?;
        let subtitle_sel = sel("h3 small.grey")?;
        let info_sel = sel("p.info.tip")?;

        for item in document.select(&item_sel) {
            if !bangumi_item_matches_subject_type(&item, &subject_type_sel, expected_subject_type) {
                continue;
            }
            let Some(title_link) = item.select(&title_sel).next() else {
                continue;
            };
            let href = title_link
                .value()
                .attr("href")
                .unwrap_or_default()
                .to_string();
            if !seen_urls.insert(href) {
                continue;
            }
            let primary_title = element_text(&title_link);
            let subtitle = item
                .select(&subtitle_sel)
                .next()
                .map(|s| element_text(&s))
                .filter(|s| !s.is_empty());
            let (original_title, chinese_title) = if let Some(subtitle) = subtitle {
                (subtitle, Some(primary_title))
            } else {
                (primary_title, None)
            };
            let date = item
                .select(&info_sel)
                .next()
                .and_then(|p| extract_date(&element_text(&p)));
            works.push(Work {
                original_title,
                chinese_title,
                date,
            });
        }
        page += 1;
    }

    Ok(works)
}

/// 将作品分类名映射为 Bangumi subject_type 参数值
fn bangumi_category_subject_type(category: &str) -> Option<&'static str> {
    match category {
        "book" => Some("subject_type_1"),
        "anime" => Some("subject_type_2"),
        "music" => Some("subject_type_3"),
        _ => None,
    }
}

/// 判断 Bangumi 作品条目的 subject_type 是否与预期分类匹配
fn bangumi_item_matches_subject_type(
    item: &ElementRef,
    subject_type_sel: &Selector,
    expected_subject_type: Option<&str>,
) -> bool {
    let Some(expected_subject_type) = expected_subject_type else {
        return true;
    };
    item.select(subject_type_sel).any(|span| {
        span.value()
            .attr("class")
            .map(|class| {
                class
                    .split_whitespace()
                    .any(|part| part == expected_subject_type)
            })
            .unwrap_or(false)
    })
}

/// 从 Bangumi 分页导航提取最大页码
fn extract_bangumi_max_page(document: &Html) -> usize {
    let Ok(page_sel) = Selector::parse(".page_inner a.p[href]") else {
        return 1;
    };
    document
        .select(&page_sel)
        .filter_map(|a| a.value().attr("href"))
        .filter_map(|href| href.split("page=").nth(1))
        .filter_map(|s| s.split('&').next())
        .filter_map(|s| s.parse::<usize>().ok())
        .max()
        .unwrap_or(1)
}

/// 取首个匹配选择器元素的合并文本（去空白，空串视为无）
fn first_text(document: &Html, selector: &str) -> Option<String> {
    Selector::parse(selector)
        .ok()
        .and_then(|sel| document.select(&sel).next().map(|n| element_text(&n)))
        .filter(|s| !s.is_empty())
}

/// 取首个匹配选择器元素的指定属性值（空串视为无）
fn first_attr(document: &Html, selector: &str, attr: &str) -> Option<String> {
    Selector::parse(selector)
        .ok()
        .and_then(|sel| {
            document
                .select(&sel)
                .next()
                .and_then(|n| n.value().attr(attr))
                .map(ToString::to_string)
        })
        .filter(|s| !s.is_empty())
}

/// 按显示文本（忽略大小写）查找首个 `<a>` 链接
fn find_link_by_text(document: &Html, text: &str) -> Option<LinkInfo> {
    let sel = Selector::parse("a[href]").ok()?;
    document.select(&sel).find_map(|a| {
        let label = element_text(&a);
        if label.eq_ignore_ascii_case(text) {
            Some(LinkInfo {
                label,
                url: normalize_url(
                    a.value().attr("href").unwrap_or_default(),
                    "https://vndb.org",
                ),
            })
        } else {
            None
        }
    })
}

/// 合并元素文本，去除首尾空白并将内部连续空白折叠为单个空格
fn element_text(node: &ElementRef) -> String {
    node.text()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// 将协议相对/根相对 URL 补全为绝对 URL
fn normalize_url(url: &str, base: &str) -> String {
    if url.starts_with("//") {
        format!("https:{url}")
    } else if url.starts_with('/') {
        format!("{base}{url}")
    } else {
        url.to_string()
    }
}

/// 解析 CSS 选择器，失败时返回带选择器的错误信息
fn sel(selector: &str) -> Result<Selector, String> {
    Selector::parse(selector).map_err(|e| format!("选择器解析失败 {selector}: {e:?}"))
}

/// 从文本中提取日期，支持 `YYYY-MM-DD`、`YYYY/MM/DD`、`YYYY年M月D日` 等格式，输出 `YYYY-MM-DD`
fn extract_date(text: &str) -> Option<String> {
    let normalized = text.replace('/', "-");
    let chars: Vec<char> = normalized.chars().collect();
    for i in 0..chars.len().saturating_sub(3) {
        if chars[i..].len() < 4 || !chars[i..i + 4].iter().all(|c| c.is_ascii_digit()) {
            continue;
        }
        let year: String = chars[i..i + 4].iter().collect();
        let rest: String = chars[i + 4..].iter().take(8).collect();
        if rest.starts_with('-') {
            let nums = rest
                .trim_start_matches('-')
                .split('-')
                .take(2)
                .map(|s| {
                    s.chars()
                        .take_while(|c| c.is_ascii_digit())
                        .collect::<String>()
                })
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>();
            return Some(match nums.as_slice() {
                [m, d] => format!("{year}-{}-{}", pad2(m), pad2(d)),
                [m] => format!("{year}-{}", pad2(m)),
                _ => year,
            });
        }
        if rest.starts_with('年') {
            let after_year = rest.trim_start_matches('年');
            let month: String = after_year
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if month.is_empty() {
                return Some(year);
            }
            let after_month = after_year
                .trim_start_matches(month.as_str())
                .trim_start_matches('月');
            let day: String = after_month
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            return Some(if day.is_empty() {
                format!("{year}-{}", pad2(&month))
            } else {
                format!("{year}-{}-{}", pad2(&month), pad2(&day))
            });
        }
        return Some(year);
    }
    None
}

/// 将单数字符串前补 0 为两位
fn pad2(value: &str) -> String {
    if value.len() == 1 {
        format!("0{value}")
    } else {
        value.to_string()
    }
}
