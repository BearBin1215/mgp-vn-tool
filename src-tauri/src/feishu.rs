//! 飞书表格数据读取模块
//!
//! 通过飞书开放平台 API 获取 Galgame 条目统计表内容，自动获取并使用 tenant_access_token 鉴权

/// 获取飞书表格内容（自动获取 token 并请求表格）
#[tauri::command]
pub async fn feishu_fetch_sheet(
    app_id: String,
    app_secret: String,
) -> Result<Vec<Vec<String>>, String> {
    let token = feishu_get_token_inner(&app_id, &app_secret).await?;
    // Galgame 条目统计表：spreadsheet_token / 工作表 ID / 读取范围（A2:E 跳过表头）
    feishu_get_sheet_inner(
        &token,
        "shtcnTQQ5n5HkdGwiiYEtE1FHZ9",
        "0rCQAp",
        "!A2:E",
    )
    .await
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
