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
/// rows 的每一行为 A~F 六列的值，顺序须与表格列定义一致，由调用方按创建时间升序排列。
/// 单元格值使用 `serde_json::Value` 以支持混合类型：日期列须传数值型 Excel 序列号、
/// 文本/公式列传字符串。追加成功后会对新增的 D、E 两列设置日期格式：
/// `yyyy/MM/dd`（左对齐，与界面手输日期单元格对齐一致），并对 F 列设数字格式
/// 以确保 `=COUNTIF(...)` 公式被识别为公式而非文本，否则新单元格会沿用默认
/// 「常规」格式而把序列号显示为裸数字、把公式显示为文本。
/// 注意飞书 formatter 仅支持 yyyy/MM/dd 等有限枚举，不支持中文「年/月/日」字面量。
#[tauri::command]
pub async fn feishu_append_rows(
    app_id: String,
    app_secret: String,
    rows: Vec<Vec<serde_json::Value>>,
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
/// 应用无编辑权限时接口返回 HTTP 403/400，转为可操作的中文提示。
/// 写入成功后解析响应里的实际写入范围，对其中 D、E 列设置日期格式。
async fn feishu_append_rows_inner(
    token: &str,
    rows: Vec<Vec<serde_json::Value>>,
) -> Result<(), String> {
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

    // 数据已写入，接下来仅补充单元格样式（非致命）：即使设格式失败，
    // 数据也已落盘，因此仅记录日志而不中断整体流程。
    // 飞书 v2 values_append 的成功响应中，实际写入范围位于 data.updates.updatedRange
    let updated_range = data["data"]["updates"]["updatedRange"].as_str();
    match updated_range {
        Some(range) => {
            if let Err(e) = set_new_row_style_inner(token, range).await {
                log::warn!("飞书新增行样式设置失败（数据已写入）\n  {e}");
            }
        }
        None => {
            log::warn!(
                "飞书新增行日期格式设置跳过：响应中未找到 data.updates.updatedRange\n  响应: {data}"
            );
        }
    }

    Ok(())
}

/// 根据追加接口返回的实际写入范围（形如 `0rCQAp!A869:F870`），
/// 对新增行设置样式使其与界面手输单元格观感一致：
///   - D:E 设日期格式（yyyy/MM/dd 左对齐）
///   - F 列设常规格式（按线上旧行，居中），与旧行观感一致（公式由前端以公式对象写入）
///
/// 使用单条「设置单元格样式」接口（PUT /style，请求体顶层为 `appendStyle`）。
///
/// 关于 F 列：前端以飞书公式对象 `{type:"formula",text:"=COUNTIF(...)"}` 写入，
/// 飞书会识别为公式自动计算。线上其他行本列为「常规」格式并居中，此处显式设
/// 居中（hAlign:1）与其观感一致（不设置 formatter 即常规格式）。统计表后续可能
/// 手动补录前序数据，保留公式可在补录后自动重算序号，因此不能改为写入静态数字。
///
/// 飞书追加接口不会自动继承已有单元格的日期格式，新行的 D、E 列默认为「常规」，
/// 若只写入数值型序列号会显示成裸数字；显式设置日期格式后才会渲染为日期。
/// 飞书 formatter 仅支持 yyyy/MM/dd 等有限枚举，不支持中文「年/月/日」字面量
/// （界面手输日期的中文呈现是 date 类型渲染，API 无法复现）。
async fn set_new_row_style_inner(token: &str, updated_range: &str) -> Result<(), String> {
    // 解析 `{sheetId}!{col}{row}:{col}{row}` 中的首尾行号
    let range_part = updated_range
        .split('!')
        .nth(1)
        .ok_or_else(|| format!("无法解析写入范围: {updated_range}"))?;
    let mut parts = range_part.split(':');
    let start = parts
        .next()
        .ok_or_else(|| format!("无法解析写入范围起始: {updated_range}"))?;
    let end = parts
        .next()
        .ok_or_else(|| format!("无法解析写入范围结束: {updated_range}"))?;
    let start_row = start
        .trim_start_matches(|c: char| c.is_ascii_alphabetic())
        .parse::<i64>()
        .map_err(|_| format!("无法解析写入范围起始行号: {updated_range}"))?;
    let end_row = end
        .trim_start_matches(|c: char| c.is_ascii_alphabetic())
        .parse::<i64>()
        .map_err(|_| format!("无法解析写入范围结束行号: {updated_range}"))?;

    // D:E 设日期格式（左对齐），对应旧行界面手输日期单元格的观感
    let date_range = format!("{SHEET_ID}!D{start_row}:E{end_row}");
    let date_body = serde_json::json!({
        "appendStyle": {
            "range": date_range,
            "style": {
                "formatter": "yyyy/MM/dd",
                "hAlign": 0,
            },
        }
    });
    set_style_request(token, &date_body, "日期格式").await?;

    // F 列为序号公式（=COUNTIF），线上其他行均为「常规」格式并居中。此处将其
    // 显式设为常规（不带 formatter）+ 居中（hAlign:1），既与旧行观感一致，
    // 又避免被判定为「文本」格式（文本格式会把 `=COUNTIF` 当字符串而不计算）。
    // 注意：仅「文本」格式会抑制公式，常规/数字等格式下飞书会自动计算。
    let formula_range = format!("{SHEET_ID}!F{start_row}:F{end_row}");
    let formula_body = serde_json::json!({
        "appendStyle": {
            "range": formula_range,
            "style": {
                "hAlign": 1,
            },
        }
    });
    set_style_request(token, &formula_body, "公式常规格式").await?;

    Ok(())
}

/// 调用单条「设置单元格样式」接口（PUT /style），校验飞书响应并原样返回错误信息。
///
/// 请求体顶层为 `appendStyle`，内含 `range` 与 `style`。飞书返回 `{"code":0,"msg":"success"}`
/// 表示成功；非 0 或 HTTP 非 2xx 视为失败，错误信息附带飞书返回的 msg 与完整响应体，
/// 便于排查字段是否被拒。仅在失败时输出日志，正常运行不打扰。`desc` 用于区分本次设置的是
/// 日期格式还是公式格式。
async fn set_style_request(
    token: &str,
    body: &serde_json::Value,
    desc: &str,
) -> Result<(), String> {
    let style_url = format!(
        "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/{SPREADSHEET_TOKEN}/style"
    );

    let client = reqwest::Client::new();
    let resp = client
        .put(&style_url)
        .header("Authorization", format!("Bearer {token}"))
        .json(body)
        .send()
        .await
        .map_err(|e| {
            format!("飞书设置单元格样式（{desc}）请求失败: {e}")
        })?;

    let status = resp.status();
    let raw = resp.text().await.map_err(|e| {
        format!("飞书设置单元格样式（{desc}）响应读取失败: {e}")
    })?;

    let data: serde_json::Value = serde_json::from_str(&raw).unwrap_or(serde_json::Value::Null);
    let code = data["code"].as_i64();

    if !status.is_success() || code != Some(0) {
        let msg = data["msg"].as_str().unwrap_or("未知错误");
        // 失败时记录完整请求体与飞书响应，便于定位字段被拒等问题
        log::error!(
            "飞书设置单元格样式（{desc}）失败\n  URL: {style_url}\n  Body: {}\n  状态码: {status}\n  响应: {raw}\n  错误: {msg}",
            serde_json::to_string(body).unwrap_or_default()
        );
        return Err(format!("飞书设置单元格样式（{desc}）失败: {msg}（响应: {raw}）"));
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
