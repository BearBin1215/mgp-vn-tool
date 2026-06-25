//! 应用设置读取，统一从 Tauri Store 读取 settings.json
use tauri_plugin_store::StoreExt;

/// 设置文件名（位于用户配置目录下）
const SETTINGS_FILE: &str = "settings.json";

/// 获取 settings.json 的 Store 实例
pub fn store(app: &tauri::AppHandle) -> Result<std::sync::Arc<tauri_plugin_store::Store<tauri::Wry>>, String> {
    app.store(SETTINGS_FILE).map_err(|e| format!("无法加载设置存储: {e}"))
}

/// 读取字符串设置项，缺失或类型不符时返回 None
pub fn get_string(app: &tauri::AppHandle, key: &str) -> Option<String> {
    store(app)
        .ok()?
        .get(key)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
}

/// 读取数值设置项（f64），缺失或类型不符时返回 None
pub fn get_f64(app: &tauri::AppHandle, key: &str) -> Option<f64> {
    store(app).ok()?.get(key).and_then(|v| v.as_f64())
}
