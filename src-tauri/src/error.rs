//! 前端可识别的结构化错误
//!
//! 后端不返回最终人类可读文案，而是返回「错误码 + 插值参数 + 简体原文」三元组：
//! 简体界面直接展示 `detail`（与历史行为一致），繁体等界面变体由前端按
//! `error.{code}` 查翻译表翻译；未收录的错误码回退显示 `detail`，永不空白。
//! 上游错误原文（reqwest 英文、批评空间日文等）不翻译，经 [`ToolError::raw`] 透传。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 前端可识别的结构化错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolError {
    /// 稳定错误码（蛇形命名，长期不变，前端按 `error.{code}` 查翻译表）
    pub code: String,
    /// 插值参数（数字、URL、上游原文等），前端原样嵌入翻译模板
    pub params: serde_json::Map<String, Value>,
    /// 简体原文（日志兜底；未收录的错误码回退展示此文本）
    pub detail: String,
}

impl ToolError {
    /// 构建带错误码的结构化错误
    ///
    /// `params` 为翻译模板所需的插值参数；`detail` 为当前简体原文，
    /// 内容应与参数渲染结果一致，供日志与简体界面直接展示。
    pub fn new(
        code: &str,
        params: impl IntoIterator<Item = (&'static str, Value)>,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            code: code.to_string(),
            params: params
                .into_iter()
                .map(|(k, v)| (k.to_string(), v))
                .collect(),
            detail: detail.into(),
        }
    }

    /// 构建无专属错误码的原始错误（上游错误原文透传，前端直接展示 detail）
    pub fn raw(detail: impl Into<String>) -> Self {
        Self::new("raw", [], detail)
    }
}

/// 日志输出时展示简体原文
impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.detail)
    }
}

impl std::error::Error for ToolError {}

/// 字符串错误按原始错误透传，使 `?` 可直接传播历史 `Result<_, String>` 的错误
impl From<String> for ToolError {
    fn from(detail: String) -> Self {
        Self::raw(detail)
    }
}

impl From<&str> for ToolError {
    fn from(detail: &str) -> Self {
        Self::raw(detail)
    }
}

/// 网络层错误按原始错误透传
impl From<reqwest::Error> for ToolError {
    fn from(e: reqwest::Error) -> Self {
        Self::raw(e.to_string())
    }
}
