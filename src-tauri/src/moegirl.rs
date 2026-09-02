//! 萌百相关方法
//!
//! cookie 经系统凭据存储（keyring）持久化，跨请求共享于全局 `OnceLock` 中；
//! 响应失败时按设置的重试次数与间隔重试。cookie 变更标记为 dirty，在下次成功
//! 响应后批量写回磁盘，避免每次请求都触发 I/O。
//!
//! 萌百各子站点（mzh./zh.）共用同一套 cookie 作为登录凭据
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use cookie_store::{CookieError, CookieStore};
use keyring::Entry;
use reqwest::header::{HeaderMap, HeaderValue, COOKIE, SET_COOKIE, USER_AGENT};
use reqwest::Url;
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
        COOKIES_DIRTY.store(true, Ordering::SeqCst);
        return store;
    }
    // 旧版自定义对象数组缺少完整过期信息，无法安全迁移。
    log::warn!("凭据存储中的 Cookie 数据格式过旧或已损坏，已忽略");
    COOKIES_DIRTY.store(true, Ordering::SeqCst);
    store
}

/// CookieStore 跨请求共享，会话 Cookie 仅保留在内存中
static COOKIE_STORE: OnceLock<Arc<Mutex<CookieStore>>> = OnceLock::new();

/// 标记 cookie 列表是否有未持久化的变更，避免每次请求成功都写磁盘
static COOKIES_DIRTY: AtomicBool = AtomicBool::new(false);

fn cookie_store() -> &'static Arc<Mutex<CookieStore>> {
    COOKIE_STORE.get_or_init(|| Arc::new(Mutex::new(load_cookie_store())))
}

/// 将关键登录 Cookie 序列化为适合 keyring 限制的紧凑 JSON
fn serialize_persistent_cookies(store: &CookieStore) -> Result<String, serde_json::Error> {
    let headers: Vec<String> = store
        .iter_unexpired()
        .filter(|cookie| cookie.is_persistent() && PERSISTENT_COOKIE_NAMES.contains(&cookie.name()))
        .map(|cookie| {
            let raw: cookie_store::RawCookie<'static> = cookie.clone().into();
            raw.to_string()
        })
        .collect();
    serde_json::to_string(&headers)
}

/// 将未过期的持久化 Cookie 写入系统凭据存储
fn persist_cookies() {
    if !COOKIES_DIRTY.load(Ordering::SeqCst) {
        return;
    }
    let entry = match Entry::new(KEYRING_SERVICE, COOKIE_ENTRY) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("无法访问系统凭据存储，cookies 未持久化: {e}");
            return;
        }
    };
    let store = cookie_store()
        .lock()
        .expect("Cookie 锁中毒，数据可能不一致");
    let json = match serialize_persistent_cookies(&store) {
        Ok(json) => json,
        Err(e) => {
            log::warn!("Cookie 序列化失败: {e}");
            return;
        }
    };
    match entry.set_password(&json) {
        Ok(()) => {
            // 持有 Cookie 锁时写入，避免成功写入后又错误清除并发更新的 dirty 标记。
            COOKIES_DIRTY.store(false, Ordering::SeqCst);
        }
        Err(e) => log::warn!("Cookie 持久化失败: {e}"),
    }
}

/// 获取指定 URL 应携带的 Cookie 请求头
fn cookie_header_for(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    if url.scheme() != "https" || !ALLOWED_MOEGIRL_HOSTS.contains(&host) {
        return None;
    }
    let store = cookie_store()
        .lock()
        .expect("Cookie 锁中毒，数据可能不一致");
    let parts: Vec<String> = store
        .get_request_values(url)
        .map(|(name, value)| format!("{name}={value}"))
        .collect();
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("; "))
    }
}

/// 将响应中的 Set-Cookie 交给 CookieStore 按 RFC 规则处理
fn store_set_cookie(header: &str, url: &Url) {
    let mut store = cookie_store()
        .lock()
        .expect("Cookie 锁中毒，数据可能不一致");
    match store.parse(header, url) {
        Ok(_) => COOKIES_DIRTY.store(true, Ordering::SeqCst),
        // 删除不存在的过期 Cookie 是合法的无状态变更，无需记录警告。
        Err(CookieError::Expired) => {}
        Err(e) => log::warn!("无法存储萌百 Cookie: {e}"),
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

/// 向萌娘百科 API 发送请求，自动携带 cookie、Referer 和默认参数，支持失败重试
#[tauri::command]
pub async fn moegirl_request(
    app: tauri::AppHandle,
    host: String,
    method: String,
    params: HashMap<String, serde_json::Value>,
    user_agent: Option<String>,
) -> Result<serde_json::Value, ToolError> {
    // 读取重试配置
    let max_retries = settings::get_f64(&app, "moegirlRetries")
        .map(|v| v as u32)
        .unwrap_or(1);
    let retry_delay = settings::get_f64(&app, "moegirlRetryDelay")
        .map(|v| v as u64)
        .unwrap_or(1000);

    // 校验请求域名是否在白名单内，避免域名设置被篡改后请求外发到非萌百站点
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
    if let Some(ua) = user_agent.as_deref().filter(|s| !s.is_empty()) {
        if let Ok(hv) = HeaderValue::from_str(ua) {
            headers.insert(USER_AGENT, hv);
        }
    }
    let client = reqwest::Client::builder()
        .default_headers(headers)
        .build()?;

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

        let mut request = match method.to_uppercase().as_str() {
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
        if let Some(cookie_str) = cookie_header_for(&url) {
            if let Ok(value) = HeaderValue::from_str(&cookie_str) {
                request = request.header(COOKIE, value);
            }
        }
        let resp = request.send().await;

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
                store_set_cookie(set_cookie, &url);
            }
        }

        let status = resp.status();
        let text = resp.text().await?;

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
    Err(ToolError::new(
        "moegirl_request_failed",
        [
            ("retries", json!(max_retries)),
            ("detail", json!(last_error)),
        ],
        format!("请求失败（重试 {max_retries} 次后）: {last_error}"),
    ))
}

/// 清除内存和凭据存储中的 cookie，实现登出
#[tauri::command]
pub fn moegirl_logout() {
    cookie_store()
        .lock()
        .expect("Cookie 锁中毒，数据可能不一致")
        .clear();
    // 标记变更并立即持久化空 cookie 列表，覆盖凭据存储中的旧数据
    COOKIES_DIRTY.store(true, Ordering::SeqCst);
    persist_cookies();
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
