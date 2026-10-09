//! 共享 HTTP 客户端构建工具。
//!
//! 各数据源模块复用本模块构建的 reqwest 客户端，统一 User-Agent 标识与超时设置。

use std::time::Duration;

use crate::error::ToolError;

/// 构建统一 User-Agent 字符串
///
/// 形如 `BearBin1215/mgp-vn-tool/{version} (https://github.com/BearBin1215/mgp-vn-tool)`，
/// 满足 Bangumi 等数据源对非浏览器请求附带开发者标识的要求。
pub(crate) fn default_user_agent() -> String {
    format!(
        "BearBin1215/mgp-vn-tool/{} (https://github.com/BearBin1215/mgp-vn-tool)",
        env!("CARGO_PKG_VERSION")
    )
}

/// 构建带统一 User-Agent 的 reqwest 客户端
///
/// 超时由调用方按数据源配置传入。
pub fn build_client(timeout: Duration) -> Result<reqwest::Client, ToolError> {
    Ok(reqwest::Client::builder()
        .timeout(timeout)
        .user_agent(default_user_agent())
        .build()?)
}
