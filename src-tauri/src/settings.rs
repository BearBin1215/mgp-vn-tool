//! 应用设置读取，统一从 Tauri Store 读取 settings.json
//!
//! 配置文件的解析路径作为前后端共享的单一来源：
//! 本模块的 [`config_file_path`] 负责把文件名解析到「用户配置目录（appConfigDir）」下的绝对路径，
//! 前端通过 [`config_file_path_command`] 命令取得同一路径后再 `Store.load`。
//!
//! 这样前端写入与后端读取必定命中同一文件，
//! 避免任何一方改用相对文件名时被插件按 `BaseDirectory::AppData` 解析到另一个目录：
//! 在 Linux 下 `~/.config` 与 `~/.local/share` 不同，会导致前端写入的设置后端读不到。
use std::path::PathBuf;

use tauri::Manager;
use tauri_plugin_store::StoreExt;

/// 把配置文件名解析为用户配置目录下的绝对路径
///
/// 所有需要读写配置文件的代码（前端经命令、后端经 [`store`]）都应通过此处取得路径，
/// 以保证前后端落在同一文件。
pub fn config_file_path(app: &tauri::AppHandle, filename: &str) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法获取配置目录: {e}"))?;
    Ok(config_dir.join(filename))
}

/// 前端调用：取得配置文件的绝对路径（用于传给 `Store.load`）
#[tauri::command]
pub fn config_file_path_command(app: tauri::AppHandle, filename: String) -> Result<String, String> {
    Ok(config_file_path(&app, &filename)?
        .to_string_lossy()
        .into_owned())
}

/// 获取 settings.json 的 Store 实例
pub fn store(
    app: &tauri::AppHandle,
) -> Result<std::sync::Arc<tauri_plugin_store::Store<tauri::Wry>>, String> {
    let path = config_file_path(app, "settings.json")?;
    app.store(path)
        .map_err(|e| format!("无法加载设置存储: {e}"))
}

/// 读取字符串设置项，缺失或类型不符时返回 None
///
/// 加载 Store 失败（如配置目录解析失败、文件权限错误）会记录 error 日志后返回 None，
/// 避免静默吞错导致问题难以诊断。
pub fn get_string(app: &tauri::AppHandle, key: &str) -> Option<String> {
    store(app)
        .map_err(|e| log::error!("读取设置失败（key={key}）: {e}"))
        .ok()?
        .get(key)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
}

/// 读取数值设置项（f64），缺失或类型不符时返回 None
pub fn get_f64(app: &tauri::AppHandle, key: &str) -> Option<f64> {
    store(app)
        .map_err(|e| log::error!("读取设置失败（key={key}）: {e}"))
        .ok()?
        .get(key)
        .and_then(|v| v.as_f64())
}
