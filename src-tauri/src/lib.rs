use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, Emitter};
use tauri_plugin_autostart::MacosLauncher;

// 모든 창이 함께 쓰는 저장 파일과 그 백업 파일 이름
const STORE_FILE: &str = "tidy-task-config.json";
const BACKUP_FILE: &str = "tidy-task-config.backup.json";
const BACKUP_PREV_FILE: &str = "tidy-task-config.backup-prev.json";

#[tauri::command]
fn save_custom_font(app: tauri::AppHandle, name: String, bytes: Vec<u8>) -> Result<String, String> {
    // 파일 이름에서 경로 부분을 모두 떼어 냅니다.
    // 왜: "..\\..\\x.ttf" 같은 이름이 들어오면 앱 폴더 밖에 파일이 써질 수 있기 때문입니다.
    let file_name = Path::new(&name)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty() && *n != "." && *n != "..")
        .ok_or_else(|| "올바르지 않은 폰트 파일 이름입니다.".to_string())?
        .to_string();

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
    }

    let font_path = app_data_dir.join(&file_name);
    fs::write(&font_path, bytes).map_err(|e| e.to_string())?;

    Ok(font_path.to_string_lossy().into_owned())
}

// 파일을 읽어 "JSON 객체"로 해석되면 그 내용을 돌려줍니다. (읽기·해석 실패 시 None)
fn read_json_object(path: &Path) -> Option<serde_json::Map<String, serde_json::Value>> {
    let bytes = fs::read(path).ok()?;
    match serde_json::from_slice::<serde_json::Value>(&bytes).ok()? {
        serde_json::Value::Object(map) => Some(map),
        _ => None,
    }
}

fn file_len(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

// ✨ [데이터 안전장치] 앱이 저장 파일을 읽기 전에 백업하고, 손상됐다면 백업에서 복구합니다.
// 왜 필요한가:
//   저장 플러그인은 파일을 읽다가 실패하면(전원 차단으로 반쯤 잘린 파일 등) 오류를 알리지 않고
//   빈 저장소로 시작합니다. 그 상태에서 한 번이라도 저장하면 모든 창의 메모가 빈 값으로 덮입니다.
// 왜 setup에서 하는가: 창의 화면(JS)은 이벤트 루프가 돌기 시작한 뒤에야 로드되므로,
//   여기서의 점검은 어떤 창이 저장소를 열기보다 항상 먼저 끝납니다.
fn protect_store_file(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let main = dir.join(STORE_FILE);
    // 파일이 없으면 첫 실행(또는 사용자가 직접 지운 것)이므로 아무것도 하지 않습니다.
    if !main.exists() {
        return;
    }
    let backup = dir.join(BACKUP_FILE);
    let prev = dir.join(BACKUP_PREV_FILE);

    if read_json_object(&main).is_some() {
        // 정상 파일: 백업을 한 세대 밀어 두고 최신본을 백업합니다.
        // 단, 파일이 절반 이하로 급격히 줄었다면 기존 백업은 지우지 않고 보조 칸에만 기록합니다.
        // (버그로 데이터가 비워진 파일이 멀쩡한 백업을 덮어쓰는 일을 막기 위함입니다)
        let shrunk_a_lot = read_json_object(&backup).is_some() && file_len(&main) * 2 < file_len(&backup);
        if shrunk_a_lot {
            let _ = fs::copy(&main, &prev);
        } else {
            if read_json_object(&backup).is_some() {
                let _ = fs::copy(&backup, &prev);
            }
            let _ = fs::copy(&main, &backup);
        }
        return;
    }

    // 손상된 파일: 지우지 않고 이름을 바꿔 보존한 뒤, 정상 백업이 있으면 그것으로 되돌립니다.
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let _ = fs::copy(&main, dir.join(format!("tidy-task-config.corrupt-{stamp}.json")));
    for candidate in [&backup, &prev] {
        if read_json_object(candidate).is_some() && fs::copy(candidate, &main).is_ok() {
            log::warn!("저장 파일이 손상되어 백업({})에서 복구했습니다.", candidate.display());
            break;
        }
    }
}

#[derive(serde::Serialize)]
struct StoreHealth {
    exists: bool,
    bytes: u64,
    key_count: usize,
    parse_ok: bool,
}

// 디스크의 저장 파일 상태를 알려 줍니다.
// 왜: JS 쪽에서 "파일에는 데이터가 있는데 저장소가 비어 있다"(= 읽기 실패)를 가려내
//     저장을 잠그기 위해 사용합니다. 저장 플러그인은 이 실패를 스스로 알려 주지 않습니다.
#[tauri::command]
fn store_health(app: tauri::AppHandle) -> StoreHealth {
    let Ok(dir) = app.path().app_data_dir() else {
        return StoreHealth { exists: false, bytes: 0, key_count: 0, parse_ok: false };
    };
    let main = dir.join(STORE_FILE);
    let exists = main.exists();
    let parsed = read_json_object(&main);
    StoreHealth {
        exists,
        bytes: file_len(&main),
        key_count: parsed.as_ref().map(|m| m.len()).unwrap_or(0),
        parse_ok: parsed.is_some(),
    }
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
        .invoke_handler(tauri::generate_handler![save_custom_font, exit_app, store_health])
        .setup(|app| {
            // 어떤 창보다 먼저 저장 파일을 점검·백업합니다.
            protect_store_file(app.handle());

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