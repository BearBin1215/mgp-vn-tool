//! 萌百相关方法
//!
//! cookie 经系统凭据存储（keyring）持久化，跨请求共享于全局 `CookieStoreMutex` 中；
//! 请求的发送与 Set-Cookie 的接收由 reqwest 的 cookie_provider 自动处理。
//! 关键 Cookie 变更通过比对检测，仅在变化时写回磁盘，避免每次请求都触发 I/O；
//! 启动时以加载结果初始化比对基准，keyring 读取失败时不会用空数据覆盖已存凭据。
//!
//! 萌百各子站点（mzh./zh.）共用同一套 cookie 作为登录凭据
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::{Arc, Mutex, OnceLock};

use cookie_store::CookieStore;
use keyring::Entry;
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use reqwest::Url;
use reqwest_cookie_store::CookieStoreMutex;
use serde_json::json;

use crate::error::ToolError;
use crate::settings;

/// 系统凭据存储的 service 名称
const KEYRING_SERVICE: &str = "com.bearbin.mgp-vn-tool";
/// 萌百 cookies 在凭据存储中的条目名
const COOKIE_ENTRY: &str = "moegirl-cookies";
/// 萌百 API 路径，用于 Cookie 的 Path 匹配
const API_PATH: &str = "/api.php";
/// 本地登录态检查使用的固定 URL
const LOGIN_CHECK_URL: &str = "https://mzh.moegirl.org.cn/api.php";
/// 需要跨应用启动持久化的登录凭据 Cookie
const PERSISTENT_COOKIE_NAMES: &[&str] =
    &["moegirlSSOUserID", "moegirlSSOUserName", "moegirlSSOToken"];

/// 萌百 API 默认域名（与前端设置项 moegirlApiHost 的默认值一致）
const DEFAULT_MOEGIRL_HOST: &str = "mzh.moegirl.org.cn";

/// 允许请求的萌百 API 域名白名单，防止域名设置被篡改后请求外发到非萌百站点
const ALLOWED_MOEGIRL_HOSTS: &[&str] = &["mzh.moegirl.org.cn", "zh.moegirl.org.cn"];

/// 从系统凭据存储加载 CookieStore
fn load_cookie_store() -> CookieStore {
    match Entry::new(KEYRING_SERVICE, COOKIE_ENTRY).and_then(|entry| entry.get_password()) {
        Ok(text) => load_cookie_store_json(&text),
        Err(keyring::Error::NoEntry) => CookieStore::default(),
        Err(e) => {
            log::warn!("从凭据存储读取 Cookie 失败: {e}");
            CookieStore::default()
        }
    }
}

/// 从 keyring 中的紧凑 JSON 恢复持久化 Cookie
fn load_cookie_store_json(text: &str) -> CookieStore {
    let url = Url::parse(LOGIN_CHECK_URL).expect("固定的萌百登录检查 URL 必须合法");
    let mut store = CookieStore::default();
    if let Ok(headers) = serde_json::from_str::<Vec<String>>(text) {
        for header in headers {
            if let Err(e) = store.parse(&header, &url) {
                log::warn!("忽略无法恢复的萌百 Cookie: {e}");
            }
        }
        return store;
    }
    // 兼容本次引入 cookie_store 后产生的完整 JSON；下一次写入时会自动压缩为关键 Cookie。
    if let Ok(store) = cookie_store::serde::json::load(Cursor::new(text.as_bytes())) {
        return store;
    }
    // 旧版自定义对象数组缺少完整过期信息，无法安全迁移。
    log::warn!("凭据存储中的 Cookie 数据格式过旧或已损坏，已忽略");
    store
}

/// CookieStore 跨请求共享，会话 Cookie 仅保留在内存中
static COOKIE_STORE: OnceLock<Arc<CookieStoreMutex>> = OnceLock::new();

/// 已持久化 Cookie 的序列化基准（启动时加载的快照或上次成功写入的结果），
/// 用于检测是否需要重新写入
static LAST_PERSISTED: Mutex<Option<String>> = Mutex::new(None);

/// 初始化全局 CookieStore
///
/// 启动时将加载到的 Cookie 快照记为持久化基准：keyring 读取失败（其中内容未知）时
/// 基准为空列表，后续未登录的成功请求不会把空 Cookie 覆盖写入凭据存储
fn cookie_store() -> &'static Arc<CookieStoreMutex> {
    COOKIE_STORE.get_or_init(|| {
        let store = load_cookie_store();
        if let Ok(snapshot) = serialize_persistent_cookies(&store) {
            *LAST_PERSISTED.lock().expect("持久化状态锁中毒") = Some(snapshot);
        }
        Arc::new(CookieStoreMutex::new(store))
    })
}

/// 将关键登录 Cookie 序列化为适合 keyring 限制的紧凑 JSON
///
/// 结果排序以保证序列化稳定，便于与上次写入内容比对检测变更。
fn serialize_persistent_cookies(store: &CookieStore) -> Result<String, serde_json::Error> {
    let mut headers: Vec<String> = store
        .iter_unexpired()
        .filter(|cookie| cookie.is_persistent() && PERSISTENT_COOKIE_NAMES.contains(&cookie.name()))
        .map(|cookie| {
            let raw: cookie_store::RawCookie<'static> = cookie.clone().into();
            raw.to_string()
        })
        .collect();
    headers.sort();
    serde_json::to_string(&headers)
}

/// 将关键登录 Cookie 写入系统凭据存储，内容与基准一致时跳过
///
/// `force` 为 true 时跳过基准比对，用于登出等必须覆盖凭据存储的场景
fn persist_cookies(force: bool) {
    let json = {
        let store = cookie_store()
            .lock()
            .expect("Cookie 锁中毒，数据可能不一致");
        match serialize_persistent_cookies(&store) {
            Ok(json) => json,
            Err(e) => {
                log::warn!("Cookie 序列化失败: {e}");
                return;
            }
        }
    };
    if !force
        && LAST_PERSISTED
            .lock()
            .expect("持久化状态锁中毒")
            .as_deref()
            == Some(json.as_str())
    {
        return;
    }
    let entry = match Entry::new(KEYRING_SERVICE, COOKIE_ENTRY) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("无法访问系统凭据存储，cookies 未持久化: {e}");
            return;
        }
    };
    // 写失败时不更新 LAST_PERSISTED，下次成功响应后会重新尝试写入
    match entry.set_password(&json) {
        Ok(()) => {
            *LAST_PERSISTED.lock().expect("持久化状态锁中毒") = Some(json);
        }
        Err(e) => log::warn!("Cookie 持久化失败: {e}"),
    }
}

/// 从适用于萌百 API 的未过期 Cookie 中读取登录用户名
fn login_username(store: &CookieStore) -> Option<String> {
    let url = Url::parse(LOGIN_CHECK_URL).expect("固定的萌百登录检查 URL 必须合法");
    let mut username = None;
    let mut has_token = false;
    for (name, value) in store.get_request_values(&url) {
        match name {
            "moegirlSSOUserName" if !value.is_empty() => username = Some(value),
            "moegirlSSOToken" if !value.is_empty() => has_token = true,
            _ => {}
        }
    }
    if !has_token {
        return None;
    }
    Some(
        urlencoding::decode(username?)
            .unwrap_or_default()
            .into_owned(),
    )
}

/// 检查当前是否已登录，返回用户名或 null
#[tauri::command]
pub fn moegirl_check_login() -> Option<String> {
    let store = cookie_store()
        .lock()
        .expect("Cookie 锁中毒，数据可能不一致");
    login_username(&store)
}

/// 把 (键, 值) 列表转为请求参数 map，供萌百 API 内部调用构造参数
fn json_params(list: &[(&str, serde_json::Value)]) -> HashMap<String, serde_json::Value> {
    list.iter()
        .map(|(k, v)| ((*k).to_string(), v.clone()))
        .collect()
}

/// 发送一次萌百 API 请求，自动携带 cookie 并补全默认参数，支持失败重试
///
/// User-Agent 缺失或为空时回退到 [`crate::http`] 的统一标识。
async fn send_request(
    app: &tauri::AppHandle,
    method: &str,
    params: &HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value, ToolError> {
    // 读取重试配置
    let max_retries = settings::get_f64(app, "moegirlRetries")
        .map(|v| v as u32)
        .unwrap_or(1);
    let retry_delay = settings::get_f64(app, "moegirlRetryDelay")
        .map(|v| v as u64)
        .unwrap_or(1000);
    // 批量查询单批最多 500 标题，超时上限较其他数据源放宽
    let timeout_secs = settings::get_f64(app, "moegirlTimeout")
        .filter(|v| v.is_finite())
        .map(|v| v.clamp(5.0, 300.0) as u64)
        .unwrap_or(30);

    // 读取请求域名并校验白名单，避免域名设置被篡改后请求外发到非萌百站点
    let host = settings::get_string(app, "moegirlApiHost")
        .unwrap_or_else(|| DEFAULT_MOEGIRL_HOST.to_string());
    if !ALLOWED_MOEGIRL_HOSTS.contains(&host.as_str()) {
        return Err(ToolError::new(
            "moegirl_invalid_host",
            [("host", json!(host))],
            format!("非法的萌百域名: {host}"),
        ));
    }

    let url = Url::parse(&format!("https://{host}{API_PATH}"))
        .map_err(|e| ToolError::raw(format!("萌百 API URL 构建失败: {e}")))?;

    // 构建请求头
    let mut headers = HeaderMap::new();
    let user_agent = settings::get_string(app, "moegirlUserAgent")
        .filter(|ua| !ua.is_empty())
        .unwrap_or_else(crate::http::default_user_agent);
    if let Ok(hv) = HeaderValue::from_str(&user_agent) {
        headers.insert(USER_AGENT, hv);
    }
    let client = reqwest::Client::builder()
        .default_headers(headers)
        .cookie_provider(Arc::clone(cookie_store()))
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()?;

    // 将参数值转为字符串，数组用 | 拼接，并添加默认参数
    let mut string_params: HashMap<String, String> = HashMap::new();
    for (key, value) in params {
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
    // 最后一次失败是否为超时，用于区分最终错误码
    let mut last_error_is_timeout = false;
    let attempts = max_retries + 1;

    for attempt in 0..attempts {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(retry_delay)).await;
        }

        let request = match method.to_uppercase().as_str() {
            "GET" => client.get(url.clone()).query(&string_params),
            "POST" => client.post(url.clone()).form(&string_params),
            _ => {
                return Err(ToolError::new(
                    "moegirl_unsupported_method",
                    [("method", json!(method))],
                    format!("Unsupported method: {method}"),
                ));
            }
        };
        let resp = request.send().await;

        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                last_error = e.to_string();
                last_error_is_timeout = e.is_timeout();
                log::error!(
                    "萌娘百科请求失败（第 {} 次）\n  URL: {url}\n  方法: {method}\n  错误: {last_error}",
                    attempt + 1
                );
                continue;
            }
        };

        let status = resp.status();
        // 响应体读取失败（含读取阶段超时）同样计入重试
        let text = match resp.text().await {
            Ok(text) => text,
            Err(e) => {
                last_error = e.to_string();
                last_error_is_timeout = e.is_timeout();
                log::error!(
                    "萌娘百科请求失败（第 {} 次）\n  URL: {url}\n  方法: {method}\n  错误: {last_error}",
                    attempt + 1
                );
                continue;
            }
        };

        // HTTP 非 2xx 时重试
        if !status.is_success() {
            last_error = format!("HTTP {status}: {text}");
            last_error_is_timeout = false;
            log::error!(
                "萌娘百科请求失败（第 {} 次）\n  URL: {url}\n  方法: {method}\n  状态码: {status}\n  响应: {text}",
                attempt + 1
            );
            continue;
        }

        persist_cookies(false);

        let data: serde_json::Value = serde_json::from_str(&text).map_err(|_| {
            ToolError::new(
                "moegirl_non_json_response",
                [("detail", json!(text))],
                format!("非 JSON 响应: {text}"),
            )
        })?;

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
            return Err(ToolError::new(
                "moegirl_api_error",
                [("code", json!(code)), ("info", json!(info))],
                format!("萌娘百科 API 错误 [{code}]: {info}"),
            ));
        }

        return Ok(data);
    }

    log::error!(
        "萌娘百科请求失败（重试 {max_retries} 次后）\n  URL: {url}\n  方法: {method}\n  最后错误: {last_error}"
    );
    let err = if last_error_is_timeout {
        ToolError::new(
            "moegirl_timeout",
            [("seconds", json!(timeout_secs))],
            format!("请求超时（{timeout_secs}秒）"),
        )
    } else {
        ToolError::new(
            "moegirl_request_failed",
            [
                ("retries", json!(max_retries)),
                ("detail", json!(last_error)),
            ],
            format!("请求失败（重试 {max_retries} 次后）: {last_error}"),
        )
    };
    Err(err)
}

/// 向萌娘百科 API 发送请求
#[tauri::command]
pub async fn moegirl_request(
    app: tauri::AppHandle,
    method: String,
    params: HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value, ToolError> {
    send_request(&app, &method, &params).await
}

/// 登录萌娘百科：获取登录 token 并提交 clientlogin，成功时返回用户名
///
/// 失败原因按 MediaWiki 原文透传，不做简繁转换，避免改变服务端语义。
#[tauri::command]
pub async fn moegirl_login(
    app: tauri::AppHandle,
    username: String,
    password: String,
) -> Result<String, ToolError> {
    // login token 为一次性凭据，随登录请求消耗，无需缓存
    let token_res = send_request(
        &app,
        "POST",
        &json_params(&[
            ("action", json!("query")),
            ("meta", json!("tokens")),
            ("type", json!("login")),
        ]),
    )
    .await?;
    let logintoken = token_res
        .pointer("/query/tokens/logintoken")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            ToolError::new(
                "moegirl_token_missing",
                [("token_type", json!("login"))],
                "获取 login Token 失败",
            )
        })?;

    let login_res = send_request(
        &app,
        "POST",
        &json_params(&[
            ("action", json!("clientlogin")),
            ("username", json!(username.clone())),
            ("password", json!(password)),
            ("rememberMe", json!("1")),
            ("loginreturnurl", json!(LOGIN_CHECK_URL)),
            ("logintoken", json!(logintoken)),
        ]),
    )
    .await;

    // 登录失败可能以顶层 error 字段返回（send_request 已转为 moegirl_api_error），也可能在 clientlogin 对象内
    let data = match login_res {
        Ok(data) => data,
        Err(e) if e.code == "moegirl_api_error" => {
            let info = e
                .params
                .get("info")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            return Err(login_failure(info));
        }
        Err(e) => return Err(e),
    };

    let clientlogin = data.get("clientlogin");
    let status = clientlogin
        .and_then(|c| c.get("status"))
        .and_then(serde_json::Value::as_str);
    if status == Some("PASS") {
        return Ok(clientlogin
            .and_then(|c| c.get("username"))
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
            .unwrap_or(username));
    }
    let message = clientlogin
        .and_then(|c| c.get("message"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    Err(login_failure(message))
}

/// 生成登录失败错误：有服务端原因时原文透传，无原因时用错误码交由前端翻译
fn login_failure(message: &str) -> ToolError {
    if message.is_empty() {
        ToolError::new("moegirl_login_failed", [], "登录失败")
    } else {
        ToolError::raw(message.to_string())
    }
}

/// 清除内存和凭据存储中的 cookie，实现登出
#[tauri::command]
pub fn moegirl_logout() {
    cookie_store()
        .lock()
        .expect("Cookie 锁中毒，数据可能不一致")
        .clear();
    // 登出是用户显式操作，强制写入空 cookie 列表，覆盖凭据存储中的旧数据
    persist_cookies(true);
}

#[cfg(test)]
mod tests {
    use cookie_store::CookieStore;
    use reqwest::Url;

    use super::{load_cookie_store_json, login_username, serialize_persistent_cookies};

    /// 构造测试使用的萌百 API URL
    fn test_url() -> Url {
        Url::parse("https://mzh.moegirl.org.cn/api.php").unwrap()
    }

    /// 验证 keyring 格式仅保存长期 SSO Cookie，且大小低于 Windows 凭据限制
    #[test]
    fn persists_only_persistent_cookies() {
        let url = test_url();
        let mut store = CookieStore::default();
        store
            .parse(
                "moegirlSSO_session=session; Path=/; Domain=.moegirl.org.cn; HttpOnly",
                &url,
            )
            .unwrap();
        store
            .parse(
                "moegirlSSOUserID=882152; Max-Age=15552000; Path=/; Domain=.moegirl.org.cn; HttpOnly",
                &url,
            )
            .unwrap();
        store
            .parse(
                "moegirlSSOUserName=BearBot; Max-Age=15552000; Path=/; Domain=.moegirl.org.cn; HttpOnly",
                &url,
            )
            .unwrap();
        store
            .parse(
                "moegirlSSOToken=token; Max-Age=15552000; Path=/; Domain=.moegirl.org.cn; HttpOnly",
                &url,
            )
            .unwrap();
        store
            .parse(
                "cpPosIndex=route; Max-Age=10; Path=/; Domain=.moegirl.org.cn; HttpOnly",
                &url,
            )
            .unwrap();

        let data = serialize_persistent_cookies(&store).unwrap();
        assert!(data.encode_utf16().count() < 2_560);
        let headers: Vec<String> = serde_json::from_str(&data).unwrap();
        assert_eq!(headers.len(), 3);

        let restored = load_cookie_store_json(&data);
        let values: Vec<_> = restored.get_request_values(&url).collect();
        assert!(values.contains(&("moegirlSSOToken", "token")));
        assert!(!values.iter().any(|(name, _)| *name == "moegirlSSO_session"));
        assert!(!values.iter().any(|(name, _)| *name == "cpPosIndex"));
    }

    /// 验证服务端通过 Max-Age=0 删除已有 Cookie
    #[test]
    fn removes_cookie_with_zero_max_age() {
        let url = test_url();
        let mut store = CookieStore::default();
        store
            .parse("moegirlSSOToken=token; Max-Age=60; Path=/", &url)
            .unwrap();
        store
            .parse("moegirlSSOToken=; Max-Age=0; Path=/", &url)
            .unwrap();
        assert!(!store
            .get_request_values(&url)
            .any(|(name, _)| name == "moegirlSSOToken"));
    }

    /// 验证只有用户名和令牌 Cookie 同时有效时才判定为已登录
    #[test]
    fn requires_username_and_token_for_login() {
        let url = test_url();
        let mut store = CookieStore::default();
        store
            .parse(
                "moegirlSSOUserName=BearBot; Max-Age=60; Path=/; Domain=.moegirl.org.cn",
                &url,
            )
            .unwrap();
        assert_eq!(login_username(&store), None);

        store
            .parse(
                "moegirlSSOToken=token; Max-Age=60; Path=/; Domain=.moegirl.org.cn",
                &url,
            )
            .unwrap();
        assert_eq!(login_username(&store), Some("BearBot".to_string()));
    }
}
