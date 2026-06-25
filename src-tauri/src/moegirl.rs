//! 萌百相关方法
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use keyring::Entry;
use reqwest::header::{HeaderMap, HeaderValue, COOKIE, SET_COOKIE, USER_AGENT};
use serde::{Deserialize, Serialize};

use crate::settings;

/// 系统凭据存储的 service 名称
const KEYRING_SERVICE: &str = "com.bearbin.mgp-vn-tool";
/// 萌百 cookies 在凭据存储中的条目名
const COOKIE_ENTRY: &str = "moegirl-cookies";

/// Cookie 数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Cookie {
    name: String,
    value: String,
    domain: String,
}

/// 从系统凭据存储加载已保存的 cookies
fn load_cookies() -> Vec<Cookie> {
    match Entry::new(KEYRING_SERVICE, COOKIE_ENTRY).and_then(|entry| entry.get_password()) {
        Ok(text) => match serde_json::from_str(&text) {
            Ok(cookies) => cookies,
            Err(e) => {
                log::warn!("凭据存储中的 cookies 数据损坏，已忽略: {e}");
                Vec::new()
            }
        },
        Err(keyring::Error::NoEntry) => Vec::new(),
        Err(e) => {
            log::warn!("从凭据存储读取 cookies 失败: {e}");
            Vec::new()
        }
    }
}

/// 持久化的 cookie 列表，跨请求、跨应用生命周期共享
static COOKIES: OnceLock<Arc<Mutex<Vec<Cookie>>>> = OnceLock::new();

/// 标记 cookie 列表是否有未持久化的变更，避免每次请求成功都写磁盘
static COOKIES_DIRTY: AtomicBool = AtomicBool::new(false);

fn cookies() -> &'static Arc<Mutex<Vec<Cookie>>> {
    COOKIES.get_or_init(|| Arc::new(Mutex::new(load_cookies())))
}

/// 将 cookie 列表持久化到系统凭据存储
fn persist_cookies() {
    // 无变更则跳过，避免不必要的磁盘 I/O
    if !COOKIES_DIRTY.swap(false, Ordering::SeqCst) {
        return;
    }
    let entry = match Entry::new(KEYRING_SERVICE, COOKIE_ENTRY) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("无法访问系统凭据存储，cookies 未持久化: {e}");
            return;
        }
    };
    let data = cookies().lock().unwrap();
    if let Ok(json) = serde_json::to_string(&*data) {
        if let Err(e) = entry.set_password(&json) {
            log::warn!("cookies 持久化失败: {e}");
        }
    }
}

/// 根据域名从存储中筛选 cookie，拼成 "n1=v1; n2=v2" 格式
fn cookie_header_for(host: &str) -> Option<String> {
    let data = cookies().lock().unwrap();
    let parts: Vec<String> = data
        .iter()
        .filter(|c| c.domain == host || c.domain == "moegirl.org.cn")
        .map(|c| format!("{}={}", c.name, c.value))
        .collect();
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("; "))
    }
}

/// 从 Set-Cookie 响应头解析并存入存储，同名同域 cookie 会被覆盖
fn store_set_cookie(header: &str, host: &str) {
    if let Some((pair, _)) = header.split_once(';') {
        if let Some((name, value)) = pair.trim().split_once('=') {
            let name = name.trim().to_string();
            let value = value.trim().to_string();
            // 提取 Set-Cookie 中的 Domain 属性，否则使用 host
            let domain = extract_domain(header).unwrap_or_else(|| host.to_string());
            let mut data = cookies().lock().unwrap();
            // 移除同名同域旧 cookie，存入新 cookie
            data.retain(|c| !(c.name == name && c.domain == domain));
            data.push(Cookie {
                name,
                value,
                domain,
            });
            // 标记内存中有未持久化的变更，persist_cookies 会在下次成功响应后写入磁盘
            COOKIES_DIRTY.store(true, Ordering::SeqCst);
        }
    }
}

/// 从 Set-Cookie 头中提取 Domain 属性值，去除前导点
fn extract_domain(header: &str) -> Option<String> {
    header.split(';').find_map(|part| {
        let part = part.trim();
        part.strip_prefix("Domain=")
            .or_else(|| part.strip_prefix("domain="))
            .map(|d| d.trim().trim_start_matches('.').to_string())
    })
}

/// 检查当前是否已登录，返回用户名或 null
#[tauri::command]
pub fn moegirl_check_login() -> Option<String> {
    cookies()
        .lock()
        .unwrap()
        .iter()
        .find(|c| c.name == "moegirlSSOUserName")
        .map(|c| {
            urlencoding::decode(&c.value)
                .unwrap_or_default()
                .into_owned()
        })
}

/// 向萌娘百科 API 发送请求，自动携带 cookie、Referer 和默认参数，支持失败重试
#[tauri::command]
pub async fn moegirl_request(
    app: tauri::AppHandle,
    host: String,
    method: String,
    params: HashMap<String, serde_json::Value>,
    user_agent: Option<String>,
) -> Result<serde_json::Value, String> {
    // 读取重试配置
    let max_retries = settings::get_f64(&app, "moegirlRetries")
        .map(|v| v as u32)
        .unwrap_or(1);
    let retry_delay = settings::get_f64(&app, "moegirlRetryDelay")
        .map(|v| v as u64)
        .unwrap_or(1000);

    let url = format!("https://{host}/api.php");

    // 构建请求头
    let mut headers = HeaderMap::new();
    if let Some(ua) = user_agent.as_deref().filter(|s| !s.is_empty()) {
        if let Ok(hv) = HeaderValue::from_str(ua) {
            headers.insert(USER_AGENT, hv);
        }
    }
    if let Some(cookie_str) = cookie_header_for(&host) {
        if let Ok(hv) = HeaderValue::from_str(&cookie_str) {
            headers.insert(COOKIE, hv);
        }
    }

    let client = reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())?;

    // 将参数值转为字符串，数组用 | 拼接，并添加默认参数
    let mut string_params: HashMap<String, String> = HashMap::new();
    for (key, value) in &params {
        let s = match value {
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::Bool(b) => b.to_string(),
            serde_json::Value::Array(arr) => arr
                .iter()
                .map(|v| match v {
                    serde_json::Value::String(s) => s.clone(),
                    serde_json::Value::Number(n) => n.to_string(),
                    _ => v.to_string(),
                })
                .collect::<Vec<_>>()
                .join("|"),
            serde_json::Value::Null => continue,
            _ => value.to_string(),
        };
        string_params.insert(key.clone(), s);
    }
    // 没有 format 参数时，默认传入 json ；格式为 json 时，添加 utf8 和 formatversion 参数
    string_params
        .entry("format".to_string())
        .or_insert_with(|| "json".to_string());
    if string_params.get("format").map(String::as_str) == Some("json") {
        string_params
            .entry("utf8".to_string())
            .or_insert_with(|| "1".to_string());
        string_params
            .entry("formatversion".to_string())
            .or_insert_with(|| "2".to_string());
    }

    let mut last_error = String::new();
    let attempts = max_retries + 1;

    for attempt in 0..attempts {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(retry_delay)).await;
        }

        let resp = match method.to_uppercase().as_str() {
            "GET" => client.get(&url).query(&string_params).send().await,
            "POST" => client.post(&url).form(&string_params).send().await,
            _ => return Err(format!("Unsupported method: {method}")),
        };

        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                last_error = e.to_string();
                log::error!(
                    "萌娘百科请求失败（第 {} 次）\n  URL: {url}\n  方法: {method}\n  错误: {last_error}",
                    attempt + 1
                );
                continue;
            }
        };

        // 处理响应中的 Set-Cookie
        for value in resp.headers().get_all(SET_COOKIE).iter() {
            if let Ok(set_cookie) = value.to_str() {
                store_set_cookie(set_cookie, &host);
            }
        }

        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;

        // HTTP 非 2xx 时重试
        if !status.is_success() {
            last_error = format!("HTTP {status}: {text}");
            log::error!(
                "萌娘百科请求失败（第 {} 次）\n  URL: {url}\n  方法: {method}\n  状态码: {status}\n  响应: {text}",
                attempt + 1
            );
            continue;
        }

        persist_cookies();

        let data: serde_json::Value =
            serde_json::from_str(&text).map_err(|_| format!("非 JSON 响应: {text}"))?;

        // 检查 API 级别错误（MediaWiki 即使 HTTP 200 也可能包含 error 字段）
        if let Some(error) = data.get("error") {
            let code = error
                .get("code")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let info = error
                .get("info")
                .and_then(|v| v.as_str())
                .unwrap_or("未知错误");
            log::error!(
                "萌娘百科 API 错误\n  URL: {url}\n  方法: {method}\n  错误码: {code}\n  信息: {info}"
            );
            return Err(format!("萌娘百科 API 错误 [{code}]: {info}"));
        }

        return Ok(data);
    }

    log::error!(
        "萌娘百科请求失败（重试 {max_retries} 次后）\n  URL: {url}\n  方法: {method}\n  最后错误: {last_error}"
    );
    Err(format!("请求失败（重试 {max_retries} 次后）: {last_error}"))
}

/// 清除内存和凭据存储中的 cookie，实现登出
#[tauri::command]
pub fn moegirl_logout() {
    cookies().lock().unwrap().clear();
    // 标记变更并立即持久化空 cookie 列表，覆盖凭据存储中的旧数据
    COOKIES_DIRTY.store(true, Ordering::SeqCst);
    persist_cookies();
}
