//! 飞书表格数据读写模块
//!
//! 通过飞书开放平台 API 读取 Galgame 条目统计表内容并向其追加行，
//! 自动获取并使用 tenant_access_token 鉴权

/// Galgame 条目统计表的 spreadsheet_token
// const SPREADSHEET_TOKEN: &str = "shtcnTQQ5n5HkdGwiiYEtE1FHZ9";
const SPREADSHEET_TOKEN: &str = "VUppstQ8OhgmQItNt6tc0LudnMf";

/// Galgame 条目统计表的工作表 ID
const SHEET_ID: &str = "0rCQAp";

/// 获取飞书表格内容（自动获取 token 并请求表格）
#[tauri::command]
pub async fn feishu_fetch_sheet(
    app_id: String,
    app_secret: String,
) -> Result<Vec<Vec<String>>, String> {
    let token = feishu_get_token_inner(&app_id, &app_secret).await?;
    // 读取范围 A2:E 跳过表头
    feishu_get_sheet_inner(&token, SPREADSHEET_TOKEN, SHEET_ID, "!A2:E").await
}

/// 向统计表末尾追加行数据（自动获取 token 并写入）
///
/// rows 的每一行为 A~E 五列的值，顺序须与表格列定义一致，由调用方按创建时间升序排列
#[tauri::command]
pub async fn feishu_append_rows(
    app_id: String,
    app_secret: String,
    rows: Vec<Vec<String>>,
) -> Result<(), String> {
    if rows.is_empty() {
        return Ok(());
    }
    let token = feishu_get_token_inner(&app_id, &app_secret).await?;
    feishu_append_rows_inner(&token, rows).await
}

/// 追加行数据到统计表工作表末尾
///
/// 使用 sheets v2 追加接口并以 INSERT_ROWS 方式插入新行，不会覆盖已有数据；
/// 应用无编辑权限时接口返回 HTTP 403/400，转为可操作的中文提示
async fn feishu_append_rows_inner(token: &str, rows: Vec<Vec<String>>) -> Result<(), String> {
    let url = format!(
        "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/{SPREADSHEET_TOKEN}/values_append"
    );
    // 定位区域需覆盖目标列 A~F 且不小于追加数据的占用范围（1..=n 行）；
    // 表格 F 列为 COUNTIF 公式，随每行一起写入，服务端从空行处开始写入
    let body = serde_json::json!({
        "valueRange": {
            "range": format!("{SHEET_ID}!A1:F{}", rows.len()),
            "values": rows,
        }
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .query(&[("insertDataOption", "INSERT_ROWS")])
        .header("Authorization", format!("Bearer {token}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            log::error!("飞书追加行请求失败\n  URL: {url}\n  错误: {e}");
            e.to_string()
        })?;

    let status = resp.status();
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let code = data["code"].as_i64();

    if !status.is_success() || code != Some(0) {
        let msg = data["msg"].as_str().unwrap_or("未知错误");
        log::error!("飞书追加行失败\n  URL: {url}\n  状态码: {status}\n  错误码: {code:?}\n  响应: {msg}");
        if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::BAD_REQUEST {
            return Err(format!(
                "追加失败：应用可能没有该表格的编辑权限（{msg}）。\
                 请在飞书开放平台为应用开通电子表格编辑权限（sheets:spreadsheet），\
                 并联系表主将应用添加为表格协作者"
            ));
        }
        return Err(format!("追加失败: {msg}"));
    }

    Ok(())
}

/// 获取飞书 tenant_access_token
async fn feishu_get_token_inner(app_id: &str, app_secret: &str) -> Result<String, String> {
    let url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
    let client = reqwest::Client::new();
    let resp = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(
            serde_json::json!({
                "app_id": app_id,
                "app_secret": app_secret,
            })
            .to_string(),
        )
        .send()
        .await
        .map_err(|e| {
            log::error!("飞书获取 token 请求失败\n  URL: {url}\n  错误: {e}");
            e.to_string()
        })?;

    let status = resp.status();
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    if !status.is_success() || data["code"].as_i64() != Some(0) {
        let msg = data["msg"].as_str().unwrap_or("未知错误");
        log::error!("飞书获取 token 失败\n  URL: {url}\n  状态码: {status}\n  响应: {msg}");
    }

    data["tenant_access_token"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| {
            let msg = data["msg"].as_str().unwrap_or("未知错误");
            format!("获取 token 失败: {msg}")
        })
}

/// 获取飞书表格内容
async fn feishu_get_sheet_inner(
    token: &str,
    spreadsheet_token: &str,
    sheet_id: &str,
    range: &str,
) -> Result<Vec<Vec<String>>, String> {
    let url = format!(
        "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/{}/values/{}{}",
        spreadsheet_token, sheet_id, range
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| {
            log::error!("飞书读取表格请求失败\n  URL: {url}\n  错误: {e}");
            e.to_string()
        })?;

    let status = resp.status();
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    if !status.is_success() || data["code"].as_i64() != Some(0) {
        let msg = data["msg"].as_str().unwrap_or("未知错误");
        log::error!("飞书读取表格失败\n  URL: {url}\n  状态码: {status}\n  响应: {msg}");
    }

    let values = data["data"]["valueRange"]["values"]
        .as_array()
        .ok_or_else(|| {
            let msg = data["msg"].as_str().unwrap_or("未知错误");
            format!("读取表格失败: {msg}")
        })?;

    let result: Vec<Vec<String>> = values
        .iter()
        .map(|row| {
            row.as_array()
                .map(|cells| {
                    cells
                        .iter()
                        .map(|c| match c {
                            serde_json::Value::String(s) => s.clone(),
                            serde_json::Value::Number(n) => n.to_string(),
                            serde_json::Value::Bool(b) => b.to_string(),
                            serde_json::Value::Null => String::new(),
                            _ => c.to_string(),
                        })
                        .collect()
                })
                .unwrap_or_default()
        })
        .collect();

    Ok(result)
}
