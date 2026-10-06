//! 飞书表格数据读写模块
//!
//! 通过飞书开放平台 API 读取 Galgame 条目统计表内容并向其追加行，
//! 自动获取并使用 tenant_access_token 鉴权

use std::time::Duration;

use chrono::{Datelike, NaiveDate};
use serde_json::json;

use crate::error::ToolError;
use crate::settings;

/// Galgame 条目统计表的 spreadsheet_token
const SPREADSHEET_TOKEN: &str = "shtcnTQQ5n5HkdGwiiYEtE1FHZ9";

/// Galgame 条目统计表的工作表 ID
const SHEET_ID: &str = "0rCQAp";

/// 飞书请求超时时间（秒）
const REQUEST_TIMEOUT_SECS: u64 = 30;

/// 飞书统计表应用默认 App ID，与前端 `constants.ts` 的 `DEFAULT_FEISHU_APP_ID` 保持一致
const DEFAULT_APP_ID: &str = "cli_a4586356dbfa100c";

/// 从 Tauri Store 读取飞书应用凭证
///
/// App ID 缺失时回退默认值（与前端设置页行为一致）；App Secret 缺失属于配置错误，
/// 返回带错误码的结构化错误，由前端按错误码翻译展示。
fn read_feishu_credentials(app: &tauri::AppHandle) -> Result<(String, String), ToolError> {
    let store = settings::store(app)?;

    let app_id = store
        .get("feishuStatsTableAppId")
        .and_then(|v| v.as_str().map(String::from))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_APP_ID.to_string());

    let app_secret = store
        .get("feishuStatsTableAppSecret")
        .and_then(|v| v.as_str().map(String::from))
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            ToolError::new(
                "feishu_credentials_missing",
                [],
                "未配置飞书统计表 App Secret，请先在设置页面填写",
            )
        })?;

    Ok((app_id, app_secret))
}

/// 按 HTTP 状态分类飞书请求错误，保留服务端返回的业务错误信息。
///
/// 错误码反映失败类别，操作名与上游详情作为插值参数透传；
/// `detail` 保持简体原文，供日志与简体界面展示。
fn format_feishu_error(
    operation: &str,
    status: reqwest::StatusCode,
    code: Option<i64>,
    msg: &str,
    permission_hint: &str,
) -> ToolError {
    // 上游未返回错误码时省略该段，避免把 Option 的 Debug 形式（如 Some(10014)）透传给前端
    let detail = match code {
        Some(c) => format!("{msg}（HTTP {status}，错误码 {c}）"),
        None => format!("{msg}（HTTP {status}）"),
    };
    let params = [
        ("operation", json!(operation)),
        ("detail", json!(detail)),
        ("hint", json!(permission_hint)),
    ];
    match status {
        reqwest::StatusCode::UNAUTHORIZED => ToolError::new(
            "feishu_unauthorized",
            params,
            format!("{operation}失败：飞书访问凭证无效或已过期。{detail}"),
        ),
        reqwest::StatusCode::FORBIDDEN => ToolError::new(
            "feishu_forbidden",
            params,
            format!("{operation}失败：{permission_hint}。{detail}"),
        ),
        reqwest::StatusCode::NOT_FOUND => ToolError::new(
            "feishu_not_found",
            params,
            format!("{operation}失败：目标飞书表格或工作表不存在，请检查配置。{detail}"),
        ),
        reqwest::StatusCode::TOO_MANY_REQUESTS => ToolError::new(
            "feishu_rate_limited",
            params,
            format!("{operation}失败：飞书接口请求过于频繁，请稍后重试。{detail}"),
        ),
        status if status.is_server_error() => ToolError::new(
            "feishu_server_error",
            params,
            format!("{operation}失败：飞书服务暂时异常，请稍后重试。{detail}"),
        ),
        _ => ToolError::new("feishu_error", params, format!("{operation}失败：{detail}")),
    }
}

/// 飞书追加结果；数据写入成功后，样式失败通过警告返回给前端。
#[derive(serde::Serialize)]
pub struct FeishuAppendResult {
    /// 飞书返回的实际写入范围
    pub updated_range: Option<String>,
    /// 数据已写入但样式设置失败时的警告
    pub style_warnings: Vec<ToolError>,
}

/// 统计表追加行的业务字段。物理列顺序和飞书公式对象由后端统一组装。
#[derive(serde::Deserialize)]
pub struct FeishuAppendRow {
    pub original_name: String,
    pub title: String,
    pub brand: String,
    pub release_date: String,
    pub creation_date: String,
}

/// 统计表读取结果的一行业务字段。物理列布局和日期解析由后端统一处理。
#[derive(serde::Serialize)]
pub struct FeishuSheetRow {
    /// 日文原名
    pub original_name: String,
    /// 条目名（原行该列为空时已回退为原名）
    pub title: String,
    /// 制作组织
    pub brand: String,
    /// 发行时间，格式 YYYY-MM-DD
    pub release_date: String,
    /// 创建时间，格式 YYYY-MM-DD
    pub creation_date: String,
}

/// 获取飞书表格内容（自动获取 token 并请求表格）
///
/// 返回已解析为业务字段的结构化行：过滤原名为空的行、条目名回退原名、
/// 日期由 Excel 序列号转为 YYYY-MM-DD，前端无需感知物理列布局。
#[tauri::command]
pub async fn feishu_fetch_sheet(
    app: tauri::AppHandle,
) -> Result<Vec<FeishuSheetRow>, ToolError> {
    let (app_id, app_secret) = read_feishu_credentials(&app)?;
    let client = crate::http::build_client(Duration::from_secs(REQUEST_TIMEOUT_SECS))?;
    let token = feishu_get_token_inner(&app_id, &app_secret, &client).await?;
    // 读取范围 A2:E 跳过表头
    let values = feishu_get_sheet_inner(&token, SPREADSHEET_TOKEN, SHEET_ID, "!A2:E", &client).await?;
    Ok(parse_sheet_rows(values))
}

/// 向统计表末尾追加行数据（自动获取 token 并写入）
///
/// rows 为按创建时间升序排列的业务字段；后端负责组装 A-F 六列值。
/// 已有数据行数在写入前实时读取统计。
/// 日期字段使用 Excel 序列号，公式字段由后端包装为飞书公式对象。
/// 追加成功后会对新增行设置日期、边框和对齐样式。
/// 样式设置失败不会回滚已经写入的数据，调用方可根据返回的警告提示用户。
/// 注意飞书 formatter 仅支持 yyyy/MM/dd 等有限枚举，不支持中文「年/月/日」字面量。
#[tauri::command]
pub async fn feishu_append_rows(
    app: tauri::AppHandle,
    rows: Vec<FeishuAppendRow>,
) -> Result<FeishuAppendResult, ToolError> {
    if rows.is_empty() {
        return Ok(FeishuAppendResult {
            updated_range: None,
            style_warnings: Vec::new(),
        });
    }
    let (app_id, app_secret) = read_feishu_credentials(&app)?;
    let client = crate::http::build_client(Duration::from_secs(REQUEST_TIMEOUT_SECS))?;
    let token = feishu_get_token_inner(&app_id, &app_secret, &client).await?;
    // 统计表可能被多人并发追加，行数须在写入前实时统计，否则序号公式行号会错位
    let existing_row_count = feishu_count_data_rows(&token, &client).await?;
    feishu_append_rows_inner(&token, existing_row_count, rows, &client).await
}

/// 统计统计表当前的数据行数（A 列非空的行，不含表头）
///
/// 新增行序号公式的行号由该值推算；统计表可能被多人并发追加，
/// 因此必须在写入前实时读取，行号错位后已写入的公式无法自动纠正。
async fn feishu_count_data_rows(
    token: &str,
    client: &reqwest::Client,
) -> Result<usize, ToolError> {
    let rows = feishu_get_sheet_inner(token, SPREADSHEET_TOKEN, SHEET_ID, "!A2:A", client).await?;
    Ok(rows
        .iter()
        .filter(|row| row.first().is_some_and(|cell| !cell.trim().is_empty()))
        .count())
}

/// 将原始表格行解析为业务字段行
///
/// 列布局：A 原名、B 条目名、C 制作组织、D 发行时间、E 创建时间。
/// 原名为空的行（历史遗留空行）直接过滤；条目名为空时回退使用原名；
/// 日期列的 Excel 序列号统一转为 YYYY-MM-DD，无法解析的值原样保留。
fn parse_sheet_rows(rows: Vec<Vec<String>>) -> Vec<FeishuSheetRow> {
    rows.into_iter()
        .filter_map(|row| {
            let cell = |index: usize| {
                row.get(index)
                    .map(String::as_str)
                    .unwrap_or("")
                    .trim()
                    .to_string()
            };
            let original_name = cell(0);
            if original_name.is_empty() {
                return None;
            }
            let title = {
                let raw = cell(1);
                if raw.is_empty() { original_name.clone() } else { raw }
            };
            Some(FeishuSheetRow {
                brand: cell(2),
                release_date: excel_serial_to_date_string(&cell(3)),
                creation_date: excel_serial_to_date_string(&cell(4)),
                original_name,
                title,
            })
        })
        .collect()
}

/// 追加行数据到统计表工作表末尾
///
/// 使用 sheets v2 追加接口并以 INSERT_ROWS 方式插入新行，不会覆盖已有数据；
/// 应用无编辑权限时接口返回 HTTP 403，转换为可操作的中文提示。
/// 写入成功后解析响应里的实际写入范围，并批量设置新增行样式。
async fn feishu_append_rows_inner(
    token: &str,
    existing_row_count: usize,
    rows: Vec<FeishuAppendRow>,
    client: &reqwest::Client,
) -> Result<FeishuAppendResult, ToolError> {
    let url = format!(
        "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/{SPREADSHEET_TOKEN}/values_append"
    );
    // 追加范围覆盖统计表的 A-F 六列，服务端从首个可用空行开始写入。
    let values: Vec<Vec<serde_json::Value>> = rows
        .into_iter()
        .enumerate()
        .map(|(index, row)| {
            let row_number = existing_row_count + index + 2;
            vec![
                serde_json::Value::String(row.original_name),
                serde_json::Value::String(row.title),
                serde_json::Value::String(row.brand),
                date_to_excel_value(&row.release_date),
                date_to_excel_value(&row.creation_date),
                serde_json::json!({
                    "type": "formula",
                    "text": format!("=COUNTIF(C$2:C{row_number},C{row_number})")
                }),
            ]
        })
        .collect();
    let row_count = values.len();
    let body = serde_json::json!({
        "valueRange": {
            "range": format!("{SHEET_ID}!A1:F{row_count}"),
            "values": values,
        }
    });

    let resp = client
        .post(&url)
        .query(&[("insertDataOption", "INSERT_ROWS")])
        .header("Authorization", format!("Bearer {token}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            log::error!("飞书追加行请求失败\n  URL: {url}\n  错误: {e}");
            ToolError::raw(e.to_string())
        })?;

    let status = resp.status();
    let data: serde_json::Value = resp.json().await?;
    let code = data["code"].as_i64();

    if !status.is_success() || code != Some(0) {
        let msg = data["msg"].as_str().unwrap_or("未知错误");
        log::error!(
            "飞书追加行失败\n  URL: {url}\n  状态码: {status}\n  错误码: {code:?}\n  响应: {msg}"
        );
        return Err(format_feishu_error(
            "追加统计表数据",
            status,
            code,
            msg,
            "应用没有该表格的编辑权限，请开通 sheets:spreadsheet 权限并将应用添加为表格协作者",
        ));
    }

    // 数据已写入；样式失败不回滚数据，但通过返回值通知前端。
    // 飞书 v2 values_append 的成功响应中，实际写入范围位于 data.updates.updatedRange
    let updated_range = data["data"]["updates"]["updatedRange"].as_str();
    log::info!(
        "飞书统计表追加成功（{row_count} 行，写入范围: {}）",
        updated_range.unwrap_or("未知")
    );
    let mut style_warnings = Vec::new();
    if let Some(range) = updated_range {
        if let Err(e) = set_new_row_style_inner(token, range, client).await {
            log::warn!("飞书新增行样式设置失败（数据已写入）\n  {e}");
            style_warnings.push(e);
        }
    } else {
        let warning = ToolError::new(
            "feishu_missing_updated_range",
            [],
            "追加成功，但飞书响应缺少实际写入范围，无法设置新增行样式",
        );
        log::warn!("{}\n  响应: {data}", warning.detail);
        style_warnings.push(warning);
    }

    Ok(FeishuAppendResult {
        updated_range: updated_range.map(ToString::to_string),
        style_warnings,
    })
}

/// 将 YYYY-MM-DD 日期转换为飞书日期单元格使用的 Excel 序列号。
/// 空值或无法解析的值原样写入，便于前端保留人工补录空间。
fn date_to_excel_value(date: &str) -> serde_json::Value {
    if date.is_empty() {
        return serde_json::Value::String(String::new());
    }
    let Ok(parsed) = NaiveDate::parse_from_str(date, "%Y-%m-%d") else {
        return serde_json::Value::String(date.to_string());
    };
    let epoch = NaiveDate::from_ymd_opt(1899, 12, 30).expect("固定的 Excel 日期基准必须有效");
    serde_json::Value::Number((parsed - epoch).num_days().into())
}

/// 将 Excel 序列号（字符串形式）转为 YYYY-MM-DD，是 `date_to_excel_value` 的逆变换。
/// 空值、非数值或非正数原样返回，带时间的小数部分截断到所在日。
fn excel_serial_to_date_string(value: &str) -> String {
    let Ok(serial) = value.parse::<f64>() else {
        return value.to_string();
    };
    if !serial.is_finite() || serial <= 0.0 {
        return value.to_string();
    }
    // 与写入侧使用同一 Excel 日期基准（1899-12-30）
    let epoch = NaiveDate::from_ymd_opt(1899, 12, 30).expect("固定的 Excel 日期基准必须有效");
    epoch
        .checked_add_signed(chrono::Duration::days(serial.trunc() as i64))
        // chrono 未启用 alloc feature，无法用其 format 方法，手动拼接 YYYY-MM-DD
        .map(|d| format!("{:04}-{:02}-{:02}", d.year(), d.month(), d.day()))
        .unwrap_or_else(|| value.to_string())
}

/// 根据追加接口返回的实际写入范围（形如 `0rCQAp!A869:F870`），
/// 对新增行设置样式使其与界面手输单元格观感一致：
///   - D:E 设日期格式（yyyy/MM/dd 左对齐）
///   - A:F 设置右边框，补齐 A~F 列之间及 F 列右侧的竖向边框
///   - F 列设常规格式并居中，与线上旧行观感一致
///
/// 使用批量「设置单元格样式」接口，在一次请求中提交三组范围。
///
/// F 列由后端以飞书公式对象写入，飞书会自动计算制作组织序号；此处保持常规格式并居中。
///
/// 飞书追加接口不会自动继承已有单元格的日期格式，新行的 D、E 列默认为「常规」，
/// 若只写入数值型序列号会显示成裸数字；显式设置日期格式后才会渲染为日期。
/// 飞书 formatter 仅支持 yyyy/MM/dd 等有限枚举，不支持中文「年/月/日」字面量
/// （界面手输日期的中文呈现是 date 类型渲染，API 无法复现）。
async fn set_new_row_style_inner(
    token: &str,
    updated_range: &str,
    client: &reqwest::Client,
) -> Result<(), ToolError> {
    // 解析 `{sheetId}!{col}{row}:{col}{row}` 中的首尾行号
    let range_part = updated_range
        .split('!')
        .nth(1)
        .ok_or_else(|| ToolError::raw(format!("无法解析写入范围: {updated_range}")))?;
    let mut parts = range_part.split(':');
    let start = parts
        .next()
        .ok_or_else(|| ToolError::raw(format!("无法解析写入范围起始: {updated_range}")))?;
    let end = parts
        .next()
        .ok_or_else(|| ToolError::raw(format!("无法解析写入范围结束: {updated_range}")))?;
    let start_row = start
        .trim_start_matches(|c: char| c.is_ascii_alphabetic())
        .parse::<i64>()
        .map_err(|_| ToolError::raw(format!("无法解析写入范围起始行号: {updated_range}")))?;
    let end_row = end
        .trim_start_matches(|c: char| c.is_ascii_alphabetic())
        .parse::<i64>()
        .map_err(|_| ToolError::raw(format!("无法解析写入范围结束行号: {updated_range}")))?;

    let column_range = |column: char| format!("{SHEET_ID}!{column}{start_row}:{column}{end_row}");
    let body = serde_json::json!({
        "data": [
            {
                "ranges": [column_range('A'), column_range('B'), column_range('C')],
                "style": {
                    "borderType": "RIGHT_BORDER",
                    "borderColor": "#000000"
                }
            },
            {
                "ranges": [column_range('D'), column_range('E')],
                "style": {
                    "formatter": "yyyy/MM/dd",
                    "hAlign": 0,
                    "borderType": "RIGHT_BORDER",
                    "borderColor": "#000000"
                }
            },
            {
                "ranges": [column_range('F')],
                "style": {
                    "hAlign": 1,
                    "borderType": "RIGHT_BORDER",
                    "borderColor": "#000000"
                }
            }
        ]
    });
    set_styles_batch_request(token, &body, client).await
}

/// 调用批量「设置单元格样式」接口（PUT /styles_batch_update）。
///
/// 请求体包含多个范围和对应样式。飞书返回 `{"code":0,"msg":"success"}` 表示成功；
/// 非 0 或 HTTP 非 2xx 视为失败，错误信息附带飞书返回的 msg 与完整响应体，便于排查。
async fn set_styles_batch_request(
    token: &str,
    body: &serde_json::Value,
    client: &reqwest::Client,
) -> Result<(), ToolError> {
    let style_url = format!(
        "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/{SPREADSHEET_TOKEN}/styles_batch_update"
    );

    let resp = client
        .put(&style_url)
        .header("Authorization", format!("Bearer {token}"))
        .json(body)
        .send()
        .await
        .map_err(|e| {
            log::error!("飞书设置单元格样式请求失败: {e}");
            ToolError::raw(e.to_string())
        })?;

    let status = resp.status();
    let raw = resp.text().await.map_err(|e| {
        log::error!("飞书设置单元格样式响应读取失败: {e}");
        ToolError::raw(e.to_string())
    })?;

    let data: serde_json::Value = serde_json::from_str(&raw).unwrap_or(serde_json::Value::Null);
    let code = data["code"].as_i64();

    if !status.is_success() || code != Some(0) {
        let msg = data["msg"].as_str().unwrap_or("未知错误");
        // 失败时记录完整请求体与飞书响应，便于定位字段被拒等问题
        log::error!(
            "飞书设置单元格样式失败\n  URL: {style_url}\n  Body: {}\n  状态码: {status}\n  响应: {raw}\n  错误: {msg}",
            serde_json::to_string(body).unwrap_or_default()
        );
        return Err(format_feishu_error(
            "设置单元格样式",
            status,
            code,
            msg,
            "应用没有该表格的编辑权限，请开通 sheets:spreadsheet 权限并将应用添加为表格协作者",
        ));
    }

    Ok(())
}

/// 获取飞书 tenant_access_token
async fn feishu_get_token_inner(
    app_id: &str,
    app_secret: &str,
    client: &reqwest::Client,
) -> Result<String, ToolError> {
    let url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
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
            ToolError::raw(e.to_string())
        })?;

    let status = resp.status();
    let data: serde_json::Value = resp.json().await?;

    if !status.is_success() || data["code"].as_i64() != Some(0) {
        let msg = data["msg"].as_str().unwrap_or("未知错误");
        log::error!("飞书获取 token 失败\n  URL: {url}\n  状态码: {status}\n  响应: {msg}");
        return Err(format_feishu_error(
            "获取飞书访问凭证",
            status,
            data["code"].as_i64(),
            msg,
            "应用凭证或租户授权无效，请检查 App ID 和 App Secret",
        ));
    }

    data["tenant_access_token"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| {
            let msg = data["msg"].as_str().unwrap_or("未知错误");
            ToolError::raw(format!("获取 token 失败: {msg}"))
        })
}

/// 获取飞书表格内容
async fn feishu_get_sheet_inner(
    token: &str,
    spreadsheet_token: &str,
    sheet_id: &str,
    range: &str,
    client: &reqwest::Client,
) -> Result<Vec<Vec<String>>, ToolError> {
    let url = format!(
        "https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/{}/values/{}{}",
        spreadsheet_token, sheet_id, range
    );

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| {
            log::error!("飞书读取表格请求失败\n  URL: {url}\n  错误: {e}");
            ToolError::raw(e.to_string())
        })?;

    let status = resp.status();
    let data: serde_json::Value = resp.json().await?;

    if !status.is_success() || data["code"].as_i64() != Some(0) {
        let msg = data["msg"].as_str().unwrap_or("未知错误");
        log::error!(
            "飞书读取表格失败\n  URL: {url}\n  状态码: {status}\n  错误码: {:?}\n  响应: {msg}",
            data["code"].as_i64()
        );
        return Err(format_feishu_error(
            "读取统计表",
            status,
            data["code"].as_i64(),
            msg,
            "应用没有该表格的查看权限，请检查表格协作者授权",
        ));
    }

    let values = data["data"]["valueRange"]["values"]
        .as_array()
        .ok_or_else(|| {
            let msg = data["msg"].as_str().unwrap_or("未知错误");
            format_feishu_error(
                "读取统计表",
                status,
                data["code"].as_i64(),
                msg,
                "应用没有该表格的查看权限，请检查表格协作者授权",
            )
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Excel 序列号与 YYYY-MM-DD 互为逆变换
    #[test]
    fn excel_date_round_trip() {
        for date in ["2024-02-29", "1999-12-31", "2026-10-06"] {
            let serial = date_to_excel_value(date);
            // 序列号为数值型 JSON 值，转成字符串后再做逆变换
            assert_eq!(excel_serial_to_date_string(&serial.to_string()), date);
        }
    }

    /// 无法解析的值和非正数原样返回
    #[test]
    fn excel_serial_keeps_unparseable_values() {
        for value in ["", "abc", "0", "-1"] {
            assert_eq!(excel_serial_to_date_string(value), value);
        }
    }

    /// 带时间的小数序列号截断到所在日
    #[test]
    fn excel_serial_truncates_time_part() {
        assert_eq!(excel_serial_to_date_string("45123.75"), "2023-07-16");
    }

    /// 解析业务字段行：空行过滤、条目名回退、日期转换、短行补空
    #[test]
    fn parse_sheet_rows_maps_business_fields() {
        let rows = vec![
            vec![
                " 架空の森 ".to_string(),
                String::new(),
                "Brand".to_string(),
                "45123".to_string(),
                "45000".to_string(),
            ],
            vec![String::new(); 5],
            vec!["短行".to_string()],
        ];
        let parsed = parse_sheet_rows(rows);
        assert_eq!(parsed.len(), 2);

        assert_eq!(parsed[0].original_name, "架空の森");
        // 条目名为空时回退为原名
        assert_eq!(parsed[0].title, "架空の森");
        assert_eq!(parsed[0].brand, "Brand");
        assert_eq!(parsed[0].release_date, "2023-07-16");
        assert_eq!(parsed[0].creation_date, "2023-03-15");

        // 缺失列补空字符串
        assert_eq!(parsed[1].original_name, "短行");
        assert_eq!(parsed[1].title, "短行");
        assert_eq!(parsed[1].brand, "");
        assert_eq!(parsed[1].release_date, "");
        assert_eq!(parsed[1].creation_date, "");
    }
}
