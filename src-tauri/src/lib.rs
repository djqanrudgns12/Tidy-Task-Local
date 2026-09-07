use std::fs;
use tauri::{Manager, Emitter};
use tauri_plugin_autostart::MacosLauncher;

#[tauri::command]
fn save_custom_font(app: tauri::AppHandle, name: String, bytes: Vec<u8>) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
    }

    let font_path = app_data_dir.join(&name);
    fs::write(&font_path, bytes).map_err(|e| e.to_string())?;

    Ok(font_path.to_string_lossy().into_owned())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ✨ 1. notification 플러그인 초기화 줄 삭제됨
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                let windows = app.webview_windows();
                let destroyed_label = window.label();

                // 살아있는 메모장(main 또는 note-x)이나 리마인더가 있는지 확인합니다.
                let mut has_active_notes = false;
                for label in windows.keys() {
                    // 삭제 중인 창 자신은 제외하고 남은 창이 있는지 검사합니다.
                    if label != destroyed_label && (label == "main" || label.starts_with("note-") || label.starts_with("tinynote-") || label == "reminder") {
                        has_active_notes = true;
                        break;
                    }
                }

                if !has_active_notes {
                    app.exit(0);
                }
            }
        })
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            } else {
                // ✨ 2. 메인 창이 없을 때 새로 띄워주는 방어 로직 추가
                let _ = tauri::WebviewWindowBuilder::new(
                    app,
                    "main",
                    tauri::WebviewUrl::App("index.html".into())
                )
                .title("Tidy Task")
                .inner_size(350.0, 500.0)
                .min_inner_size(250.0, 300.0)
                .decorations(false)
                .transparent(true)
                .resizable(true)
                .build();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_custom_font, exit_app])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::TrayIconBuilder;
                use tauri::Manager;

                let open_i = MenuItem::with_id(app, "open", "열기 (Open)", true, None::<&str>)?;
                let new_main_i = MenuItem::with_id(app, "new_main", "새 Tidy Task", true, None::<&str>)?;
                let new_tiny_i = MenuItem::with_id(app, "new_tiny", "새 Tiny Note", true, None::<&str>)?;
                let reset_coord_i = MenuItem::with_id(app, "reset_coord", "좌표 초기화", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "종료 (Quit)", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open_i, &new_main_i, &new_tiny_i, &reset_coord_i, &quit_i])?;

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().cloned().unwrap())
                    .menu(&menu)
                    .tooltip("Tidy Task")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            } else {
                                // ✨ 3. 트레이 메뉴 '열기' 시에도 방어 로직 추가
                                let _ = tauri::WebviewWindowBuilder::new(
                                    app,
                                    "main",
                                    tauri::WebviewUrl::App("index.html".into())
                                )
                                .title("Tidy Task")
                                .inner_size(350.0, 500.0)
                                .min_inner_size(250.0, 300.0)
                                .decorations(false)
                                .transparent(true)
                                .resizable(true)
                                .build();
                            }
                        }
                        "new_main" => {
                            if let Some(main_win) = app.get_webview_window("main") {
                                let _ = main_win.emit("spawn-new-window", ());
                            }
                        }
                        "new_tiny" => {
                            if let Some(main_win) = app.get_webview_window("main") {
                                let _ = main_win.emit("spawn-tiny-note", ());
                            }
                        }
                        "reset_coord" => {
                            if let Some(main_win) = app.get_webview_window("main") {
                                let _ = main_win.emit("req-reset-coordinates", ());
                            }
                        }
                        _ => (),
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            } else {
                                // ✨ 4. 트레이 아이콘 '더블 클릭' 시에도 방어 로직 추가
                                let _ = tauri::WebviewWindowBuilder::new(
                                    tray.app_handle(),
                                    "main",
                                    tauri::WebviewUrl::App("index.html".into())
                                )
                                .title("Tidy Task")
                                .inner_size(350.0, 500.0)
                                .min_inner_size(250.0, 300.0)
                                .decorations(false)
                                .transparent(true)
                                .resizable(true)
                                .build();
                            }
                        }
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}