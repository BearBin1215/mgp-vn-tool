mod bangumi;
mod erogamescape;
mod feishu;
mod http;
mod moegirl;
mod settings;
mod vndb;

use tauri::window::Color;
use tauri::Manager;

/// 启动 Tauri 应用，注册插件和命令
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            settings::config_file_path_command,
            moegirl::moegirl_request,
            moegirl::moegirl_check_login,
            moegirl::moegirl_logout,
            feishu::feishu_fetch_sheet,
            erogamescape::check_connectivity,
            erogamescape::query_creator_works,
            erogamescape::search_creators,
            vndb::query_vndb_producer,
            vndb::search_vndb_producers,
            bangumi::query_bangumi_company,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            // 根据颜色主题设置窗口主题和 webview 背景色，减少闪屏
            // （仅 dark/light 生效；其他值或未设置时直接返回，不做处理）
            if let Some(color_mode) = settings::get_string(&app.handle(), "colorMode") {
                let (theme, bg_color) = match color_mode.as_str() {
                    "dark" => (Some(tauri::Theme::Dark), Some(Color(0, 0, 0, 255))),
                    "light" => (Some(tauri::Theme::Light), Some(Color(255, 255, 255, 255))),
                    _ => return Ok(()),
                };
                let _ = window.set_theme(theme);
                let _ = window.set_background_color(bg_color);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri 应用启动失败");
}
