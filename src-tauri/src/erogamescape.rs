//! 批评空间（ErogameScape）数据查询模块
///
/// 批评空间通过 POST 请求提交 SQL 语句，返回包含查询结果的 HTML 页面
use std::collections::HashMap;

use serde_json::Value;

use crate::settings;

/// 批评空间连接配置
struct ErogamescapeSettings {
    /// 批评空间地址（原站或镜像站）
    url: String,
    /// 镜像站用户名
    username: Option<String>,
    /// 镜像站密码
    password: Option<String>,
    /// 请求超时时长（秒）
    timeout: u64,
}

/// 从 Tauri Store 读取批评空间连接配置
fn read_settings(app: &tauri::AppHandle) -> Result<ErogamescapeSettings, String> {
    let store = settings::store(app)?;

    let url = store
        .get("erogamescapeUrl")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "http://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki".to_string());
    let username = store
        .get("erogamescapeUsername")
        .and_then(|v| v.as_str().map(String::from));
    let password = store
        .get("erogamescapePassword")
        .and_then(|v| v.as_str().map(String::from));
    let timeout = store
        .get("erogamescapeTimeout")
        .and_then(|v| v.as_f64())
        .map(|v| v as u64)
        .unwrap_or(30);

    Ok(ErogamescapeSettings {
        url,
        username,
        password,
        timeout,
    })
}

/// 截取文本前500字符用于日志输出
fn log_snippet(text: &str) -> String {
    text.chars().take(500).collect()
}

/// 向批评空间 SQL 接口发送 POST 请求，返回原始 HTML 响应
async fn post_sql(app: &tauri::AppHandle, sql: &str) -> Result<(u16, String), String> {
    let settings = read_settings(app)?;
    let sql_url = format!(
        "{}/sql_for_erogamer_form.php",
        settings.url.trim_end_matches('/')
    );
    let timeout = settings.timeout;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.post(&sql_url).form(&[("sql", sql)]);

    // 镜像站需要 HTTP Basic Auth 认证
    if let (Some(user), Some(pass)) = (&settings.username, &settings.password) {
        req = req.basic_auth(user, Some(pass.as_str()));
    }

    let resp = req.send().await.map_err(|e| {
        let msg = if e.is_timeout() {
            format!("请求超时（{timeout}秒）")
        } else {
            format!("请求失败: {e}")
        };
        log::error!("批评空间请求失败\n  URL: {sql_url}\n  错误: {msg}");
        msg
    })?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if status < 200 || status >= 300 {
        let snippet = log_snippet(&text);
        log::error!("批评空间请求失败\n  URL: {sql_url}\n  SQL: {sql}\n  状态码: {status}\n  响应: {snippet}");
    }
    Ok((status, text))
}

/// 从 HTML 中解析 `#query_result_main` 表格，返回 (列名列表, 数据行列表)
///
/// 页面中可能存在多个表格，需要跳过数据表定义表格（表头为"列名/型/内容"），
/// 只提取实际查询结果的数据表格。
fn parse_result_table(html: &str) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let document = scraper::Html::parse_document(html);
    let table_selector =
        scraper::Selector::parse("#query_result_main").map_err(|e| format!("{e:?}"))?;
    let tr_selector = scraper::Selector::parse("tr").unwrap();
    let th_selector = scraper::Selector::parse("th").unwrap();
    let td_selector = scraper::Selector::parse("td").unwrap();
    let tables: Vec<_> = document.select(&table_selector).collect();

    for table in &tables {
        let rows: Vec<_> = table.select(&tr_selector).collect();
        if rows.len() < 2 {
            continue;
        }

        let headers: Vec<String> = rows[0]
            .select(&th_selector)
            .map(|th| th.text().collect::<String>())
            .collect();

        if headers.len() == 3
            && headers
                .iter()
                .any(|h| h == "列名" || h == "型" || h == "内容")
        {
            continue;
        }

        if headers.is_empty() {
            continue;
        }

        // 提取数据行，跳过表头行
        let mut data_rows: Vec<Vec<String>> = Vec::new();
        for row in &rows[1..] {
            let cells: Vec<String> = row
                .select(&td_selector)
                .map(|td| td.text().collect::<String>())
                .collect();
            if cells.len() == headers.len() {
                data_rows.push(cells);
            }
        }

        if !data_rows.is_empty() {
            return Ok((headers, data_rows));
        }
    }

    Ok((vec![], vec![]))
}

/// 将结果包装为统一的 `{ statusCode, result, response }` JSON
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
            let code = e
                .strip_prefix("HTTP ")
                .and_then(|r| r.split(':').next())
                .unwrap_or("0");
            log::error!("批评空间查询失败: {e}");
            serde_json::json!({
                "statusCode": code,
                "result": "fail",
                "response": e,
            })
        }
    }
}

/// 检查 HTTP 状态码，非 2xx 时返回带状态码的错误信息
fn check_status(status: u16) -> Result<(), String> {
    if status >= 200 && status < 300 {
        Ok(())
    } else {
        Err(format!("HTTP {status}"))
    }
}

/// 检测批评空间连通性
#[tauri::command]
pub async fn check_connectivity(app: tauri::AppHandle) -> Result<Value, String> {
    let settings = read_settings(&app)?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(settings.timeout))
        .build()
        .map_err(|e| e.to_string())?;

    // 向sql执行页而不是有较多动态内容的主页发请求，减少压力和响应内容
    let sql_url = format!(
        "{}/sql_for_erogamer_form.php",
        settings.url.trim_end_matches('/')
    );
    let mut req = client.get(&sql_url);
    // 镜像站需要 HTTP Basic Auth 认证
    if let (Some(user), Some(pass)) = (&settings.username, &settings.password) {
        req = req.basic_auth(user, Some(pass.as_str()));
    }

    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            let msg = if e.is_timeout() {
                format!("请求超时（{}秒）", settings.timeout)
            } else {
                e.to_string()
            };
            log::error!("批评空间连通性检测失败\n  URL: {sql_url}\n  错误: {msg}");
            return Ok(serde_json::json!({
                "statusCode": "0",
                "result": "fail",
                "response": msg,
            }));
        }
    };

    let status = resp.status();
    let code = status.as_u16();
    // 响应内容，成功时不返回，失败显示完整内容用于分析等
    let response = if status.is_success() {
        String::new()
    } else {
        let text = resp.text().await.unwrap_or_default();
        let snippet = log_snippet(&text);
        log::error!(
            "批评空间连通性检测失败\n  URL: {sql_url}\n  状态码: {code}\n  响应: {snippet}"
        );
        text
    };

    Ok(serde_json::json!({
        "statusCode": code.to_string(),
        "result": if status.is_success() { "success" } else { "fail" },
        "response": response,
    }))
}

/// 根据创作者 ID 查询其参与的作品，按职种分组返回
///
/// 职业类型（shubetu）编码：5=出演作品（声优），6=音乐
/// 返回 `{ creatorInfo, acting: [...], music: [...] }`，其中：
/// - creatorInfo: 创作者信息（name, furigana, url, twitterUsername, blog, blogTitle, pixiv）
/// - 每条作品记录包含：
///   - shubetuDetail: 担当区分（1=主要, 2=次要, 3=其他）
///   - shubetuDetailName: 角色名/歌曲名等
///   - gameName: 游戏名
///   - sellDay: 发售日
///   - model: 机型/平台
#[tauri::command]
pub async fn query_creator_works(app: tauri::AppHandle, creator_id: u64) -> Result<Value, String> {
    Ok(wrap_response(|| do_query_creator_works(&app, creator_id)).await)
}

async fn do_query_creator_works(app: &tauri::AppHandle, creator_id: u64) -> Result<Value, String> {
    // 查询创作者信息及参与作品
    let sql = format!(
        "SELECT c.name, c.furigana, c.url, c.twitter_username, c.blog, c.blog_title, c.pixiv, \
         s.shubetu, s.shubetu_detail, s.shubetu_detail_name, \
         g.gamename, g.sellday, g.model \
         FROM createrlist c \
         LEFT JOIN shokushu s ON c.id = s.creater \
         LEFT JOIN gamelist g ON s.game = g.id \
         WHERE c.id = {creator_id};"
    );

    let (status, html) = post_sql(app, &sql).await?;
    check_status(status)?;
    let (columns, rows) = parse_result_table(&html)?;

    let col_idx: HashMap<String, usize> = columns
        .iter()
        .enumerate()
        .map(|(i, c)| (c.clone(), i))
        .collect();

    // 从第一行提取创作者信息（所有行的 c.* 字段相同）
    let creator_info = if let Some(row) = rows.first() {
        let get = |field: &str| -> String {
            col_idx
                .get(field)
                .and_then(|&i| row.get(i))
                .cloned()
                .unwrap_or_default()
        };
        serde_json::json!({
            "name": get("name"),
            "furigana": get("furigana"),
            "url": get("url"),
            "twitterUsername": get("twitter_username"),
            "blog": get("blog"),
            "blogTitle": get("blog_title"),
            "pixiv": get("pixiv"),
        })
    } else {
        serde_json::json!({
            "name": "",
            "furigana": "",
            "url": "",
            "twitterUsername": "",
            "blog": "",
            "blogTitle": "",
            "pixiv": "",
        })
    };

    // 提取参与作品
    let shubetu_idx = col_idx.get("shubetu").copied().unwrap_or(0);
    let mut acting_rows = Vec::new();
    let mut music_rows = Vec::new();

    for row in &rows {
        if row.get(shubetu_idx).map(|s| s.as_str()) == Some("") {
            continue;
        }

        // 直接从 col_idx 查找字段，避免每行构建临时 HashMap
        let get = |field: &str| -> &str {
            col_idx
                .get(field)
                .and_then(|&i| row.get(i))
                .map(|s| s.as_str())
                .unwrap_or("")
        };

        let item = serde_json::json!({
            "shubetuDetail": get("shubetu_detail"),
            "shubetuDetailName": get("shubetu_detail_name"),
            "gameName": get("gamename"),
            "sellDay": get("sellday"),
            "model": get("model"),
        });

        match row.get(shubetu_idx).map(|s| s.as_str()) {
            Some("5") => acting_rows.push(item),
            Some("6") => music_rows.push(item),
            _ => {}
        }
    }

    Ok(serde_json::json!({
        "acting": acting_rows,
        "music": music_rows,
        "creatorInfo": creator_info,
    }))
}

/// 按名称搜索创作者，返回匹配的 id 和 name 列表
///
/// 使用 LIKE 进行模糊匹配，最多返回 10 条结果
#[tauri::command]
pub async fn search_creators(app: tauri::AppHandle, keyword: String) -> Result<Value, String> {
    Ok(wrap_response(|| do_search_creators(&app, &keyword)).await)
}

async fn do_search_creators(app: &tauri::AppHandle, keyword: &str) -> Result<Value, String> {
    // 转义单引号，防止 SQL 注入（关键词由用户输入）
    let safe_keyword = keyword.replace('\'', "''");
    let sql = format!(
        "SELECT \
           c.id, c.name, \
           (SELECT COUNT(*) FROM shokushu s WHERE s.creater = c.id AND s.shubetu = 5) AS voice_count, \
           (SELECT COUNT(*) FROM shokushu s WHERE s.creater = c.id AND s.shubetu = 6) AS music_count \
         FROM createrlist c \
         WHERE c.name LIKE '%{safe_keyword}%' \
         LIMIT 10;"
    );

    let (status, html) = post_sql(app, &sql).await?;
    check_status(status)?;
    let (columns, rows) = parse_result_table(&html)?;

    let col_idx: HashMap<String, usize> = columns
        .iter()
        .enumerate()
        .map(|(i, c)| (c.clone(), i))
        .collect();

    let results: Vec<Value> = rows
        .iter()
        .filter_map(|row| {
            let id = col_idx.get("id").and_then(|&i| row.get(i))?;
            let name = col_idx.get("name").and_then(|&i| row.get(i))?;
            let voice_count = col_idx.get("voice_count").and_then(|&i| row.get(i));
            let music_count = col_idx.get("music_count").and_then(|&i| row.get(i));
            Some(serde_json::json!({
                "id": id,
                "name": name,
                "voice_count": voice_count,
                "music_count": music_count,
            }))
        })
        .collect();

    Ok(serde_json::json!(results))
}
