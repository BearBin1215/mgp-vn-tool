//! 系统语言探测，用于推断首次启动时的界面语言
//!
//! 界面语言的取值范围与前端 `UiLanguage`（src/i18n/index.ts）保持一致。
//! 前端在用户从未保存过界面语言时通过 [`detect_ui_language_command`] 取得初始值，
//! 后端在窗口显示前用同一函数确定窗口标题，避免启动时标题与界面语言不一致。
use sys_locale::get_locale;

/// 使用香港繁体（而非台湾繁体）的中文地区后缀
const HK_REGION_SUFFIXES: [&str; 2] = ["-hk", "-mo"];

/// 依据系统语言推断界面语言
///
/// 应用仅提供简繁中文，故系统语言为中文时按地区区分变体：
/// 港澳地区返回 `zh-HK`，台湾及其他繁体标签返回 `zh-TW`，
/// 简体标签与未收录语言统一返回 `zh-CN`。
pub fn detect_ui_language() -> &'static str {
    let Some(locale) = get_locale() else {
        return "zh-CN";
    };
    // 统一转为小写的连字符标签，便于比较（如 zh_Hant_HK -> zh-hant-hk）
    let tag = locale.to_lowercase().replace('_', "-");
    if !tag.starts_with("zh") {
        return "zh-CN";
    }
    if HK_REGION_SUFFIXES.iter().any(|suffix| tag.ends_with(suffix)) {
        return "zh-HK";
    }
    // zh-Hant 泛指繁体、未指明地区时按台湾繁体处理
    if tag.contains("hant") || tag.ends_with("-tw") {
        return "zh-TW";
    }
    "zh-CN"
}

/// 前端调用：依据系统语言推断初始界面语言
#[tauri::command]
pub fn detect_ui_language_command() -> String {
    detect_ui_language().to_string()
}
