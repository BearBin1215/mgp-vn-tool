//! 批评空间（ErogameScape）数据查询模块
///
/// 批评空间通过 POST 请求提交 SQL 语句，返回包含查询结果的 HTML 页面
use std::collections::HashMap;

use futures_util::stream::StreamExt;
use scraper::Element;
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

        // 提取数据行，跳过表头行。统一 trim 单元格文本，保证返回数据无首尾空白
        let mut data_rows: Vec<Vec<String>> = Vec::new();
        for row in &rows[1..] {
            let cells: Vec<String> = row
                .select(&td_selector)
                .map(|td| td.text().collect::<String>().trim().to_string())
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

/// 将列名列表构建为列名→索引的映射，供按名称取字段值使用
fn build_col_idx(columns: &[String]) -> HashMap<String, usize> {
    columns
        .iter()
        .enumerate()
        .map(|(i, c)| (c.clone(), i))
        .collect()
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

/// 转义用户输入用于 SQL LIKE 子句
///
/// 单引号转义为 `''` 防止注入。批评空间后端不支持 `ESCAPE` 子句，故不对 `%`/`_`
/// 做字面量转义（用户输入通配符时按通配符语义匹配，可接受）。
fn escape_sql_like(keyword: &str) -> String {
    keyword.replace('\'', "''")
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
    // game_id 仅后端内部使用，用于追加 Fan Disk/追加篇/重制版 关联查询，不输出到前端 GameRecord
    let sql = format!(
        "SELECT c.name, c.furigana, c.url, c.twitter_username, c.blog, c.blog_title, c.pixiv, \
         s.shubetu, s.shubetu_detail, s.shubetu_detail_name, \
         g.id AS game_id, g.gamename, g.sellday, g.model \
         FROM createrlist c \
         LEFT JOIN shokushu s ON c.id = s.creater \
         LEFT JOIN gamelist g ON s.game = g.id \
         WHERE c.id = {creator_id};"
    );

    let (status, html) = post_sql(app, &sql).await?;
    check_status(status)?;
    let (columns, rows) = parse_result_table(&html)?;

    let col_idx = build_col_idx(&columns);

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
    let game_id_idx = col_idx.get("game_id").copied();
    let mut acting_rows = Vec::new();
    let mut music_rows = Vec::new();
    // 收集本次结果集中的游戏 ID（去重），用于追加 Fan Disk/追加篇/重制版 关联查询
    let mut game_ids: Vec<String> = Vec::new();
    let mut seen_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    for row in &rows {
        if row.get(shubetu_idx).map(|s| s.as_str()) == Some("") {
            continue;
        }

        // 收集非空游戏 ID（去重）
        if let Some(id) = game_id_idx.and_then(|idx| row.get(idx)) {
            if !id.is_empty() && seen_ids.insert(id.clone()) {
                game_ids.push(id.clone());
            }
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

    // 查询 Fan Disk/追加篇/重制版 关联（subject=衍生作品，object=原作）
    let game_connections = query_game_connections(app, &game_ids).await;

    Ok(serde_json::json!({
        "acting": acting_rows,
        "music": music_rows,
        "creatorInfo": creator_info,
        "gameConnections": game_connections,
    }))
}

/// 查询给定游戏 ID 列表的 Fan Disk / 追加篇 / 重制版 关联
///
/// 关联方向：subject=衍生作品，object=原作。返回 `[{ kind, subjectGameName, objectGameName }]`。
/// 查询失败时记录日志并返回空数组，不阻断主流程。
///
/// ~~太伟大了批评空间，你怎么连这都有啊~~
async fn query_game_connections(app: &tauri::AppHandle, game_ids: &[String]) -> Vec<Value> {
    if game_ids.is_empty() {
        return Vec::new();
    }

    // 每个 id 经 parse::<u64> 校验后重新序列化，确保 IN 子句中均为纯数字，无 SQL 注入风险
    let ids_list = game_ids
        .iter()
        .map(|id| id.parse::<u64>().unwrap_or(0).to_string())
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT c.kind, g1.gamename AS subject_name, g2.gamename AS object_name \
         FROM connection_between_lists_of_games c \
         JOIN gamelist g1 ON c.game_subject = g1.id \
         JOIN gamelist g2 ON c.game_object = g2.id \
         WHERE c.kind IN ('fandisk','apend','remake') AND c.game_subject IN ({ids_list});"
    );

    let result = async {
        let (status, html) = post_sql(app, &sql).await?;
        check_status(status)?;
        let (columns, rows) = parse_result_table(&html)?;
        let col_idx = build_col_idx(&columns);

        let kind_idx = col_idx.get("kind").copied();
        let subject_idx = col_idx.get("subject_name").copied();
        let object_idx = col_idx.get("object_name").copied();

        let connections: Vec<Value> = rows
            .iter()
            .filter_map(|row| {
                let kind = kind_idx.and_then(|i| row.get(i))?;
                let subject = subject_idx.and_then(|i| row.get(i))?;
                let object = object_idx.and_then(|i| row.get(i))?;
                Some(serde_json::json!({
                    "kind": kind,
                    "subjectGameName": subject,
                    "objectGameName": object,
                }))
            })
            .collect();
        Ok::<Vec<Value>, String>(connections)
    }
    .await;

    match result {
        Ok(conns) => conns,
        Err(e) => {
            log::warn!("游戏关联查询失败，跳过管道内链生成: {e}");
            Vec::new()
        }
    }
}

/// 按名称搜索创作者，返回匹配的 id 和 name 列表
///
/// 使用 LIKE 进行模糊匹配，最多返回 10 条结果
#[tauri::command]
pub async fn search_creators(app: tauri::AppHandle, keyword: String) -> Result<Value, String> {
    Ok(wrap_response(|| do_search_creators(&app, &keyword)).await)
}

async fn do_search_creators(app: &tauri::AppHandle, keyword: &str) -> Result<Value, String> {
    // 转义单引号（关键词由用户输入）
    let safe_keyword = escape_sql_like(keyword);
    let sql = format!(
        "SELECT \
           c.id, c.name, \
           (SELECT COUNT(*) FROM shokushu s WHERE s.creater = c.id AND s.shubetu = 5) AS voice_count, \
           (SELECT COUNT(*) FROM shokushu s WHERE s.creater = c.id AND s.shubetu = 6) AS music_count \
         FROM createrlist c \
         WHERE c.name LIKE '%{safe_keyword}%' \
           AND (SELECT COUNT(*) FROM shokushu s WHERE s.creater = c.id AND s.shubetu = 5) >= 1 \
         LIMIT 10;"
    );

    let (status, html) = post_sql(app, &sql).await?;
    check_status(status)?;
    let (columns, rows) = parse_result_table(&html)?;

    let col_idx = build_col_idx(&columns);

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
                "voiceCount": voice_count,
                "musicCount": music_count,
            }))
        })
        .collect();

    Ok(serde_json::json!(results))
}

/// 按名称搜索作品（游戏），返回匹配的 id、游戏名、发售日、制作组织名列表
///
/// gamelist.brandname 是 brandlist.id 的外键，需 JOIN brandlist 取制作组织名称。
/// 使用 LIKE 对 gamename 进行模糊匹配，最多返回 10 条结果
#[tauri::command]
pub async fn search_games(app: tauri::AppHandle, keyword: String) -> Result<Value, String> {
    Ok(wrap_response(|| do_search_games(&app, &keyword)).await)
}

async fn do_search_games(app: &tauri::AppHandle, keyword: &str) -> Result<Value, String> {
    // 转义单引号（关键词由用户输入）
    let safe_keyword = escape_sql_like(keyword);
    let sql = format!(
        "SELECT g.id, g.gamename, g.sellday, b.brandname AS brand \
         FROM gamelist g \
         LEFT JOIN brandlist b ON g.brandname = b.id \
         WHERE g.gamename LIKE '%{safe_keyword}%' \
         LIMIT 10;"
    );

    let (status, html) = post_sql(app, &sql).await?;
    check_status(status)?;
    let (columns, rows) = parse_result_table(&html)?;

    let col_idx = build_col_idx(&columns);

    let results: Vec<Value> = rows
        .iter()
        .filter_map(|row| {
            let id = col_idx.get("id").and_then(|&i| row.get(i))?;
            let gamename = col_idx.get("gamename").and_then(|&i| row.get(i))?;
            let sellday = col_idx.get("sellday").and_then(|&i| row.get(i));
            let brand = col_idx.get("brand").and_then(|&i| row.get(i));
            Some(serde_json::json!({
                "id": id,
                "gamename": gamename,
                "sellday": sellday,
                "brandname": brand,
            }))
        })
        .collect();

    Ok(serde_json::json!(results))
}

/// 根据作品 ID 查询作品详情，用于作品条目生成
///
/// 返回作品自身信息（gamename/sellday/model/brand）及关联作品：
/// - transplants: 类型为 transplant 的移植作品（本作品为原作 game_object，移植版为 game_subject），
///   提供其平台 model 与制作组织 brand，用于补充平台与发行商字段
/// - sequels: 类型为 sequel 的续作（本作品为原作 game_object，续作为 game_subject）的游戏名列表
#[tauri::command]
pub async fn query_work_detail(app: tauri::AppHandle, work_id: u64) -> Result<Value, String> {
    Ok(wrap_response(|| do_query_work_detail(&app, work_id)).await)
}

async fn do_query_work_detail(app: &tauri::AppHandle, work_id: u64) -> Result<Value, String> {
    // 作品自身信息：gamename/sellday/model/brand（brandlist JOIN 取制作组织名）
    // 额外取 shoukai(官网URL)/dlsite_id/dlsite_domain/twitter 用于外部链接章节
    let own_sql = format!(
        "SELECT g.gamename, g.sellday, g.model, g.shoukai, g.dlsite_id, g.dlsite_domain, g.twitter, b.brandname AS brand \
         FROM gamelist g \
         LEFT JOIN brandlist b ON g.brandname = b.id \
         WHERE g.id = {work_id};"
    );
    let (status, html) = post_sql(app, &own_sql).await?;
    check_status(status)?;
    let (columns, rows) = parse_result_table(&html)?;

    if rows.is_empty() {
        return Err(format!("未找到作品 id={work_id} 的信息"));
    }

    let col_idx = build_col_idx(&columns);

    let get = |field: &str| -> String {
        rows.first()
            .and_then(|row| col_idx.get(field).and_then(|&i| row.get(i)).cloned())
            .unwrap_or_default()
    };
    let gamename = get("gamename");
    let sellday = get("sellday");
    let model = get("model");
    let shoukai = get("shoukai");
    let dlsite_id = get("dlsite_id");
    let dlsite_domain = get("dlsite_domain");
    let twitter = get("twitter");
    let brand = get("brand");

    // 关联作品：transplant（移植）与 sequel（续作），本作品为原作 game_object
    let conn_sql = format!(
        "SELECT c.kind, g.gamename, g.model, g.sellday, b.brandname AS brand \
         FROM connection_between_lists_of_games c \
         JOIN gamelist g ON c.game_subject = g.id \
         LEFT JOIN brandlist b ON g.brandname = b.id \
         WHERE c.kind IN ('transplant','sequel') AND c.game_object = {work_id};"
    );
    // 关联查询为辅助信息，失败时不阻断主流程
    let transplants_and_sequels = async {
        let (status, html) = post_sql(app, &conn_sql).await?;
        check_status(status)?;
        let (columns, rows) = parse_result_table(&html)?;
        let col_idx = build_col_idx(&columns);
        let kind_idx = col_idx.get("kind").copied();
        let gamename_idx = col_idx.get("gamename").copied();
        let model_idx = col_idx.get("model").copied();
        let sellday_idx = col_idx.get("sellday").copied();
        let brand_idx = col_idx.get("brand").copied();

        let mut transplants: Vec<Value> = Vec::new();
        let mut sequels: Vec<String> = Vec::new();
        for row in &rows {
            let kind = kind_idx
                .and_then(|i| row.get(i))
                .map(|s| s.as_str())
                .unwrap_or("");
            match kind {
                "transplant" => {
                    let m = model_idx
                        .and_then(|i| row.get(i))
                        .cloned()
                        .unwrap_or_default();
                    let s = sellday_idx
                        .and_then(|i| row.get(i))
                        .cloned()
                        .unwrap_or_default();
                    let b = brand_idx
                        .and_then(|i| row.get(i))
                        .cloned()
                        .unwrap_or_default();
                    transplants.push(serde_json::json!({ "model": m, "sellday": s, "brand": b }));
                }
                "sequel" => {
                    let name = gamename_idx
                        .and_then(|i| row.get(i))
                        .cloned()
                        .unwrap_or_default();
                    if !name.is_empty() {
                        sequels.push(name);
                    }
                }
                _ => {}
            }
        }
        Ok::<(Vec<Value>, Vec<String>), String>((transplants, sequels))
    }
    .await;

    let (transplants, sequels) = match transplants_and_sequels {
        Ok(v) => v,
        Err(e) => {
            log::warn!("作品关联查询失败 (work_id={work_id})，跳过移植/续作信息: {e}");
            (Vec::new(), Vec::new())
        }
    };

    // STAFF/CAST/歌手：合并查询 shubetu IN (1原画,2编剧,3音乐,5声优,6歌手,7其他)，
    // 前端按 shubetu 分流到 STAFF、CAST 与音乐（歌手）。一次请求减少 HTTP 往返、保证数据一致。
    let staff_sql = format!(
        "SELECT s.shubetu, s.shubetu_detail, s.shubetu_detail_name, c.name AS staff_name \
         FROM shokushu s \
         JOIN createrlist c ON s.creater = c.id \
         WHERE s.game = {work_id} AND s.shubetu IN (1,2,3,5,6,7);"
    );
    let staff = async {
        let (status, html) = post_sql(app, &staff_sql).await?;
        check_status(status)?;
        let (columns, rows) = parse_result_table(&html)?;
        let col_idx = build_col_idx(&columns);
        let shubetu_idx = col_idx.get("shubetu").copied();
        let detail_idx = col_idx.get("shubetu_detail").copied();
        let detail_name_idx = col_idx.get("shubetu_detail_name").copied();
        let name_idx = col_idx.get("staff_name").copied();
        let staff: Vec<Value> = rows
            .iter()
            .filter_map(|row| {
                let shubetu = shubetu_idx.and_then(|i| row.get(i))?.clone();
                let name = name_idx.and_then(|i| row.get(i))?.clone();
                if shubetu.is_empty() || name.is_empty() {
                    return None;
                }
                let shubetu_detail = detail_idx
                    .and_then(|i| row.get(i))
                    .cloned()
                    .unwrap_or_default();
                let shubetu_detail_name = detail_name_idx
                    .and_then(|i| row.get(i))
                    .cloned()
                    .unwrap_or_default();
                Some(serde_json::json!({
                    "shubetu": shubetu,
                    "shubetuDetail": shubetu_detail,
                    "shubetuDetailName": shubetu_detail_name,
                    "name": name,
                }))
            })
            .collect();
        Ok::<Vec<Value>, String>(staff)
    }
    .await;
    let staff = match staff {
        Ok(v) => v,
        Err(e) => {
            log::warn!("作品 STAFF/CAST 查询失败 (work_id={work_id})，跳过 STAFF/CAST 信息: {e}");
            Vec::new()
        }
    };

    Ok(serde_json::json!({
        "gamename": gamename,
        "sellday": sellday,
        "model": model,
        "shoukai": shoukai,
        "dlsiteId": dlsite_id,
        "dlsiteDomain": dlsite_domain,
        "twitter": twitter,
        "brand": brand,
        "transplants": transplants,
        "sequels": sequels,
        "staff": staff,
    }))
}

/// 获取批评空间普通页面 HTML（非 SQL 接口），复用连接配置与认证
///
/// 与 `post_sql` 共用 `read_settings` 的 URL/认证/超时配置，但走 GET 请求直接获取页面。
async fn fetch_page(app: &tauri::AppHandle, path: &str) -> Result<String, String> {
    let settings = read_settings(app)?;
    let url = format!(
        "{}/{}",
        settings.url.trim_end_matches('/'),
        path.trim_start_matches('/')
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(settings.timeout))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(&url);
    if let (Some(user), Some(pass)) = (&settings.username, &settings.password) {
        req = req.basic_auth(user, Some(pass.as_str()));
    }
    let resp = req.send().await.map_err(|e| {
        if e.is_timeout() {
            format!("请求超时（{}秒）: {url}", settings.timeout)
        } else {
            format!("请求失败: {url}: {e}")
        }
    })?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!("HTTP {status}: {url}"))
    }
}

/// 从作品页 HTML 的 `#music_summary_main` 解析音乐列表
///
/// 表格结构：每行含曲名(music id 链接)、分类、歌手。返回 `(music_id, song_name, singer)`。
/// 分类不取（SQL 的 shubetu_detail_name 更精确，含角色名前缀如「レナED曲」）。
fn parse_music_summary(html: &str) -> Result<Vec<(String, String, String)>, String> {
    let document = scraper::Html::parse_document(html);
    let container_sel =
        scraper::Selector::parse("#music_summary_main").map_err(|e| format!("{e:?}"))?;
    let tr_sel = scraper::Selector::parse("tr").unwrap();
    let td_sel = scraper::Selector::parse("td").unwrap();
    let a_sel = scraper::Selector::parse("a[href]").unwrap();

    let mut result = Vec::new();
    for container in document.select(&container_sel) {
        // 跳过表头行
        for tr in container.select(&tr_sel).skip(1) {
            let tds: Vec<_> = tr.select(&td_sel).collect();
            if tds.len() < 3 {
                continue;
            }
            // 第1列：曲名 + music id（形如 music.php?music=8659）
            let Some(a) = tds[0].select(&a_sel).next() else {
                continue;
            };
            let href = a.value().attr("href").unwrap_or_default();
            let music_id = href
                .split("music=")
                .nth(1)
                .and_then(|s| s.split('&').next())
                .unwrap_or_default()
                .to_string();
            if music_id.is_empty() {
                continue;
            }
            let song_name = a.text().collect::<String>().trim().to_string();
            // 第3列：歌手（用于与 SQL 的 shubetu=6 记录匹配）
            let singer = tds[2].text().collect::<String>().trim().to_string();
            result.push((music_id, song_name, singer));
        }
    }
    Ok(result)
}

/// 从 music.php 详情页 HTML 解析作词/作曲/编曲/歌手
///
/// 批评空间音乐详情页创作者信息区为 `table#creaters_information_table`，每行固定
/// `th:类型 td:名称`。仅在该表内遍历，按首列标签把名称写入对应字段。
/// 每个字段值按 `<a>` 标签拆分为多个创作者（用 `<br>` 分隔的情况）。
/// 返回 `(singer, lyricist, composer, arranger)`，每个为 Vec<String>，未找到的为空数组。
fn parse_music_detail(html: &str) -> (Vec<String>, Vec<String>, Vec<String>, Vec<String>) {
    let document = scraper::Html::parse_document(html);
    // #creaters_information_table 为固定选择器，解析失败视为编码错误直接 panic
    let container_sel = scraper::Selector::parse("#creaters_information_table").unwrap();
    let th_sel = scraper::Selector::parse("tr > th:first-child").unwrap();

    let mut singer: Vec<String> = Vec::new();
    let mut lyricist: Vec<String> = Vec::new();
    let mut composer: Vec<String> = Vec::new();
    let mut arranger: Vec<String> = Vec::new();

    // 仅在创作者信息表内遍历：th:first-child 即类型标签，其后首个 td 为名称
    for container in document.select(&container_sel) {
        for th in container.select(&th_sel) {
            let Some(td) = th.next_sibling_element().and_then(|el| {
                if el.value().name() == "td" { Some(el) } else { None }
            }) else {
                continue;
            };
            let value = extract_names_from_cell(td);
            if value.is_empty() {
                continue;
            }
            match th.text().collect::<String>().trim() {
                "歌" => singer = value,
                "作詞" | "作词" => lyricist = value,
                "作曲" => composer = value,
                "編曲" | "编曲" => arranger = value,
                _ => {}
            }
        }
    }

    (singer, lyricist, composer, arranger)
}

/// 从单元格提取多个创作者名
///
/// 优先按 `<a>` 标签拆分（含 creater.php 链接），每个 `<a>` 的合并文本（折叠空白）为一个创作者；
/// 无 `<a>` 时回退到按 `<br>` 拆分纯文本。空条目过滤。
fn extract_names_from_cell(td: scraper::ElementRef) -> Vec<String> {
    let a_sel = scraper::Selector::parse("a").unwrap();
    let a_links: Vec<_> = td.select(&a_sel).collect();
    if !a_links.is_empty() {
        let names: Vec<String> = a_links
            .iter()
            .map(|a| {
                a.text()
                    .collect::<String>()
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .filter(|s| !s.is_empty())
            .collect();
        if !names.is_empty() {
            return names;
        }
    }
    // 无 a 标签：按 <br> 拆分
    td.html()
        .split("<br>")
        .map(|part| {
            scraper::Html::parse_fragment(part)
                .root_element()
                .text()
                .collect::<String>()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        })
        .filter(|s| !s.is_empty())
        .collect()
}

/// 获取作品的音乐详情（爬 game.php 拿 music id，再并发爬 music.php 拿作词作曲）
///
/// 用于作品条目生成的「相关音乐」章节。分类由 SQL（shubetu=6 的 shubetu_detail_name）提供，
/// 本命令只负责获取 music id 对应的曲名与 per-song 创作者（作词/作曲/编曲/歌手）。
/// 前端按曲名匹配 SQL 的分类信息。最大并发 3 个请求；单个失败时跳过该曲。
#[tauri::command]
pub async fn query_work_music_detail(app: tauri::AppHandle, work_id: u64) -> Result<Value, String> {
    Ok(wrap_response(|| do_query_work_music_detail(&app, work_id)).await)
}

async fn do_query_work_music_detail(app: &tauri::AppHandle, work_id: u64) -> Result<Value, String> {
    // 1. 爬作品页 HTML，解析 #music_summary_main 拿 music id + 曲名 + 歌手
    let game_html = fetch_page(app, &format!("game.php?game={work_id}")).await?;
    let music_list = parse_music_summary(&game_html)?;

    // 2. 并发爬取每个 music.php（最大 3 并发），解析作词作曲编曲
    let app = app.clone();
    let details: Vec<Option<Value>> = futures_util::stream::iter(music_list)
        .map(|(music_id, song_name, summary_singer)| {
            let app = app.clone();
            let path = format!("music.php?music={music_id}");
            async move {
                let html = match fetch_page(&app, &path).await {
                    Ok(h) => h,
                    Err(e) => {
                        log::warn!("音乐详情页获取失败 (music_id={music_id})，跳过: {e}");
                        return None;
                    }
                };
                let (detail_singer, lyricist, composer, arranger) = parse_music_detail(&html);
                // 详情页歌手名可能更完整，回退用作品页的歌手名
                let final_singer = if detail_singer.is_empty() {
                    vec![summary_singer]
                } else {
                    detail_singer
                };
                Some(serde_json::json!({
                    "musicId": music_id,
                    "songName": song_name,
                    "singer": final_singer,
                    "lyricist": lyricist,
                    "composer": composer,
                    "arranger": arranger,
                }))
            }
        })
        .buffer_unordered(3)
        .collect()
        .await;

    Ok(serde_json::json!(details
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()))
}
