use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Manager, Emitter};
use tauri_plugin_autostart::MacosLauncher;
mod neis;
mod analytics;

// 모든 창이 함께 쓰는 저장 파일과 그 백업 파일 이름
const STORE_FILE: &str = "tidy-task-config.json";
const BACKUP_FILE: &str = "tidy-task-config.backup.json";
const BACKUP_PREV_FILE: &str = "tidy-task-config.backup-prev.json";

// 트레이 "종료" 후 창들이 마지막 입력을 저장할 수 있도록 기다리는 시간
const QUIT_FLUSH_WAIT: Duration = Duration::from_millis(800);

// 시작 후 이 시간이 지나도 main 창이 숨어 있거나 화면 밖이면 Rust가 직접 꺼냅니다.
const STARTUP_REVEAL_DELAY: Duration = Duration::from_secs(8);
// 앱을 켜 둔 동안 저장 파일을 백업하는 간격 (사용 중 전원이 꺼졌을 때 잃는 범위를 줄이기 위함)
const PERIODIC_BACKUP_INTERVAL: Duration = Duration::from_secs(5 * 60);
// 창을 끌어 옮기려면 제목줄이 최소한 이만큼(논리 px) 화면 안에 보여야 합니다. (JS windowPlacement.js와 같은 값)
const MIN_GRAB_WIDTH: f64 = 80.0;
const MIN_GRAB_HEIGHT: f64 = 24.0;
const TITLE_STRIP_HEIGHT: f64 = 32.0;

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

// 정상인 저장 파일을 백업합니다. 백업을 한 세대(prev) 밀어 두고 최신본을 백업 칸에 둡니다.
// 단, 파일이 절반 이하로 급격히 줄었다면 기존 백업은 지우지 않고 보조 칸에만 기록합니다.
// (버그로 데이터가 비워진 파일이 멀쩡한 백업을 덮어쓰는 일을 막기 위함입니다)
fn rotate_backups(dir: &Path) {
    let main = dir.join(STORE_FILE);
    let Ok(current) = fs::read(&main) else { return };
    if !matches!(serde_json::from_slice::<serde_json::Value>(&current), Ok(serde_json::Value::Object(_))) {
        return;
    }
    let backup = dir.join(BACKUP_FILE);
    let prev = dir.join(BACKUP_PREV_FILE);
    // 내용이 그대로면 아무것도 하지 않습니다 (주기 백업이 이전 세대를 밀어내지 않도록).
    if fs::read(&backup).ok().as_deref() == Some(current.as_slice()) {
        return;
    }
    let backup_ok = read_json_object(&backup).is_some();
    let shrunk_a_lot = backup_ok && (current.len() as u64) * 2 < file_len(&backup);
    if shrunk_a_lot {
        let _ = fs::write(&prev, &current);
    } else {
        if backup_ok {
            let _ = fs::copy(&backup, &prev);
        }
        let _ = fs::write(&backup, &current);
    }
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
    if read_json_object(&main).is_some() {
        rotate_backups(&dir);
        return;
    }

    // 손상된 파일: 지우지 않고 이름을 바꿔 보존한 뒤, 정상 백업이 있으면 그것으로 되돌립니다.
    let backup = dir.join(BACKUP_FILE);
    let prev = dir.join(BACKUP_PREV_FILE);
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

// 사각형 (x, y, 너비, 높이) — 모두 물리 픽셀
type PixelRect = (i64, i64, i64, i64);

// 창의 제목줄이 작업영역 안에서 "잡을 수 있을 만큼" 보이는지 판단합니다. (JS windowPlacement.js와 같은 규칙)
fn is_title_strip_visible(window: PixelRect, work: PixelRect, scale: f64) -> bool {
    let (wx, wy, ww, wh) = window;
    let (ax, ay, aw, ah) = work;
    let strip_h = ((TITLE_STRIP_HEIGHT * scale) as i64).min(wh);
    let visible_w = (wx + ww).min(ax + aw) - wx.max(ax);
    let visible_h = (wy + strip_h).min(ay + ah) - wy.max(ay);
    let need_w = ((MIN_GRAB_WIDTH * scale) as i64).min(ww);
    let need_h = ((MIN_GRAB_HEIGHT * scale) as i64).min(strip_h);
    visible_w >= need_w && visible_h >= need_h
}

// 작업영역 가운데(창이 더 크면 왼쪽 위)에 놓일 좌표를 계산합니다.
fn centered_in(work: PixelRect, width: i64, height: i64) -> (i64, i64) {
    let (ax, ay, aw, ah) = work;
    (ax + ((aw - width) / 2).max(0), ay + ((ah - height) / 2).max(0))
}

// 창이 어느 모니터에서도 제목줄을 잡을 수 없는 위치(화면 밖)라면 주 모니터 작업영역 가운데로 옮깁니다.
// 왜: 모니터 구성·배율이 바뀌면 저장된 좌표가 화면 밖을 가리켜, 트레이의 "좌표 초기화" 전까지 창이 보이지 않았습니다.
fn ensure_window_on_screen(window: &tauri::WebviewWindow) {
    // 최소화된 창의 좌표(-32000)는 위치가 아니므로 건드리지 않습니다.
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let (Ok(position), Ok(size), Ok(monitors)) =
        (window.outer_position(), window.outer_size(), window.available_monitors())
    else {
        return;
    };
    if monitors.is_empty() {
        return;
    }
    let rect: PixelRect = (position.x as i64, position.y as i64, size.width as i64, size.height as i64);
    let work_of = |m: &tauri::Monitor| -> PixelRect {
        let area = m.work_area();
        (area.position.x as i64, area.position.y as i64, area.size.width as i64, area.size.height as i64)
    };
    if monitors.iter().any(|m| is_title_strip_visible(rect, work_of(m), m.scale_factor())) {
        return;
    }
    // 주 모니터: 윈도우에서는 가상 화면 좌표 (0, 0)을 포함하는 모니터입니다.
    let primary = monitors
        .iter()
        .find(|m| {
            let p = m.position();
            let s = m.size();
            p.x <= 0 && p.y <= 0 && p.x as i64 + s.width as i64 > 0 && p.y as i64 + s.height as i64 > 0
        })
        .unwrap_or(&monitors[0]);
    let (x, y) = centered_in(work_of(primary), rect.2, rect.3);
    log::warn!("창이 화면 밖({}, {})에 있어 주 모니터 가운데({}, {})로 옮깁니다.", position.x, position.y, x, y);
    let _ = window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
}

// main 창을 앞으로 가져오거나, 닫혀 있으면 새로 만듭니다.
// 왜 함수로 모았는가: 두 번째 실행·트레이 "열기"·트레이 더블클릭 세 곳에 같은 코드가 복사돼 있었습니다.
fn show_or_create_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        // 트레이 "열기"만 눌러도 화면 밖에 있던 창을 끌어옵니다.
        ensure_window_on_screen(&window);
    } else {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ✨ 1. notification 플러그인 초기화 줄 삭제됨
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                let windows = app.webview_windows();
                let destroyed_label = window.label();

                // 살아있는 메모장(main 또는 note-x)이나 리마인더·아카이브가 있는지 확인합니다.
                // 왜 아카이브를 포함하는가: 아카이브만 남기고 마지막 메모 창을 닫으면 앱이 바로 종료되어
                //   아카이브에서 편집 중이던 내용이 저장되기 전에 사라질 수 있었습니다.
                let mut has_active_notes = false;
                for label in windows.keys() {
                    // 삭제 중인 창 자신은 제외하고 남은 창이 있는지 검사합니다.
                    if label != destroyed_label && (label == "main" || label.starts_with("note-") || label.starts_with("tinynote-") || label == "reminder" || label == "archive" || matches!(label.as_str(), "meal" | "meal-search" | "meal-settings")) {
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
            // ✨ 2. 두 번째 실행 시 main 창을 보여 주고, 없으면 새로 띄웁니다.
            show_or_create_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_custom_font, store_health, neis::neis_search_schools, neis::neis_meals, neis::neis_schedule, neis::meal_take_launch_token, analytics::analytics_status, analytics::analytics_consent, analytics::analytics_track])
        .setup(|app| {
            // 어떤 창보다 먼저 저장 파일을 점검·백업합니다.
            protect_store_file(app.handle());
            analytics::setup(app.handle());

            // ✨ [표시 보장] 시작 후 일정 시간이 지나도 main 창이 숨어 있거나 화면 밖이면 Rust가 직접 꺼냅니다.
            // 왜: main 창은 숨긴 채 만들어지고 화면(JS)이 위치를 맞춘 뒤 스스로 보여 주는데,
            //     그 과정에서 오류가 나거나 좌표가 화면 밖이면 창이 보이지 않은 채 트레이에만 남았습니다.
            let reveal_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(STARTUP_REVEAL_DELAY);
                if let Some(window) = reveal_handle.get_webview_window("main") {
                    if !window.is_visible().unwrap_or(true) {
                        log::warn!("시작 후에도 main 창이 숨어 있어 직접 표시합니다.");
                        let _ = window.show();
                    }
                    ensure_window_on_screen(&window);
                }
            });

            // ✨ [주기 백업] 앱을 켜 둔 동안에도 저장 파일을 주기적으로 백업합니다.
            // 왜: 시작할 때만 백업하면, 사용 중 전원이 꺼져 파일이 손상됐을 때 그동안 쓴 내용을 모두 잃습니다.
            let backup_handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(PERIODIC_BACKUP_INTERVAL);
                if let Ok(dir) = backup_handle.path().app_data_dir() {
                    rotate_backups(&dir);
                }
            });

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

                let open_i = MenuItem::with_id(app, "open", "열기 (Open)", true, None::<&str>)?;
                let meal_i = MenuItem::with_id(app, "meal", "급식창 열기", true, None::<&str>)?;
                let new_main_i = MenuItem::with_id(app, "new_main", "새 Tidy Task", true, None::<&str>)?;
                let new_tiny_i = MenuItem::with_id(app, "new_tiny", "새 Tiny Note", true, None::<&str>)?;
                let reset_coord_i = MenuItem::with_id(app, "reset_coord", "좌표 초기화", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "종료 (Quit)", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open_i, &meal_i, &new_main_i, &new_tiny_i, &reset_coord_i, &quit_i])?;

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().cloned().unwrap())
                    .menu(&menu)
                    .tooltip("Tidy Task")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => {
                            // 종료 직전 모든 창에 "지금 저장하세요"를 알리고, 기록할 시간을 잠시 준 뒤 종료합니다.
                            // 왜: 바로 종료하면 입력 후 0.5초 안에 예약돼 있던 저장이 사라질 수 있습니다.
                            let _ = app.emit("before-quit", ());
                            let handle = app.clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(QUIT_FLUSH_WAIT);
                                handle.exit(0);
                            });
                        }
                        // ✨ 3. 트레이 메뉴 '열기' 시에도 방어 로직
                        "open" => show_or_create_main(app),
                        "meal" => {
                            if let Some(win) = app.get_webview_window("meal") {
                                let _ = win.unminimize();
                                ensure_window_on_screen(&win);
                                let _ = win.show();
                                let _ = win.set_focus();
                            } else {
                                // 메모 창이 없어도 열리며, 화면에서 급식 전용 저장소의 위치를 복원합니다.
                                let _ = tauri::WebviewWindowBuilder::new(app, "meal", tauri::WebviewUrl::App("index.html".into()))
                                    .title("오늘의 급식").inner_size(320.0,460.0).min_inner_size(180.0,120.0)
                                    // Windows의 undecorated shadow가 투명 모서리에 만드는 1px 흰 테두리를 제거합니다.
                                    // 창 내부의 MealFrame이 자체 보더와 둥근 모서리를 그립니다.
                                    .decorations(false).transparent(true).shadow(false).resizable(true).visible(false).build();
                            }
                        }
                        // 아래 요청은 모든 창에 방송하고, 매니저 창 하나만 처리합니다.
                        // 왜: 예전에는 main 창에만 보내서 main을 닫으면 메뉴가 아무 반응이 없었습니다.
                        "new_main" => {
                            let _ = app.emit("spawn-new-window", ());
                        }
                        "new_tiny" => {
                            let _ = app.emit("spawn-tiny-note", ());
                        }
                        "reset_coord" => {
                            let _ = app.emit("req-reset-coordinates", ());
                        }
                        _ => (),
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                            // ✨ 4. 트레이 아이콘 '더블 클릭' 시에도 방어 로직
                            show_or_create_main(tray.app_handle());
                        }
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    // 실제 사용자 환경: 4K 주 모니터(배율 2) + FHD 보조 모니터(배율 1), 물리 픽셀 작업영역
    const PRIMARY_WORK: PixelRect = (0, 0, 3840, 2064);
    const SECONDARY_WORK: PixelRect = (3840, 0, 1920, 1032);

    #[test]
    fn offscreen_window_is_detected() {
        // 논리 4500을 배율 2로 잘못 되돌린 위치(물리 9000)
        let window = (9000, 400, 656, 898);
        assert!(!is_title_strip_visible(window, PRIMARY_WORK, 2.0));
        assert!(!is_title_strip_visible(window, SECONDARY_WORK, 1.0));
    }

    #[test]
    fn visible_windows_are_kept() {
        assert!(is_title_strip_visible((2978, 350, 656, 898), PRIMARY_WORK, 2.0));
        assert!(is_title_strip_visible((4500, 200, 328, 449), SECONDARY_WORK, 1.0));
        // 최대화된 창은 테두리만큼 살짝 음수 좌표를 가집니다
        assert!(is_title_strip_visible((-8, -8, 3856, 2080), PRIMARY_WORK, 2.0));
    }

    #[test]
    fn title_above_screen_is_not_grabbable() {
        assert!(!is_title_strip_visible((400, -300, 656, 898), PRIMARY_WORK, 2.0));
    }

    #[test]
    fn centers_in_work_area() {
        assert_eq!(centered_in(PRIMARY_WORK, 656, 898), (1592, 583));
        assert_eq!(centered_in(PRIMARY_WORK, 5000, 3000), (0, 0));
    }

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("tidy-task-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn backups_rotate_and_skip_unchanged_content() {
        let dir = temp_dir("rotate");
        fs::write(dir.join(STORE_FILE), br#"{"main":{"notes":"first"}}"#).unwrap();
        rotate_backups(&dir);
        assert_eq!(fs::read(dir.join(BACKUP_FILE)).unwrap(), br#"{"main":{"notes":"first"}}"#);

        fs::write(dir.join(STORE_FILE), br#"{"main":{"notes":"second"}}"#).unwrap();
        rotate_backups(&dir);
        assert_eq!(fs::read(dir.join(BACKUP_FILE)).unwrap(), br#"{"main":{"notes":"second"}}"#);
        assert_eq!(fs::read(dir.join(BACKUP_PREV_FILE)).unwrap(), br#"{"main":{"notes":"first"}}"#);

        // 내용이 같으면 이전 세대를 밀어내지 않습니다
        rotate_backups(&dir);
        assert_eq!(fs::read(dir.join(BACKUP_PREV_FILE)).unwrap(), br#"{"main":{"notes":"first"}}"#);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn shrunk_or_broken_file_never_overwrites_good_backup() {
        let dir = temp_dir("shrink");
        let rich = br#"{"main":{"notes":"a long memo that should survive a sudden wipe of the file"}}"#;
        fs::write(dir.join(BACKUP_FILE), rich).unwrap();

        // 절반 이하로 줄어든 파일 → 백업은 그대로, 보조 칸에만 기록
        fs::write(dir.join(STORE_FILE), br#"{"main":{}}"#).unwrap();
        rotate_backups(&dir);
        assert_eq!(fs::read(dir.join(BACKUP_FILE)).unwrap(), rich);
        assert_eq!(fs::read(dir.join(BACKUP_PREV_FILE)).unwrap(), br#"{"main":{}}"#);

        // 손상된 파일 → 아무것도 백업하지 않음
        fs::write(dir.join(STORE_FILE), br#"{"main": {"no"#).unwrap();
        rotate_backups(&dir);
        assert_eq!(fs::read(dir.join(BACKUP_FILE)).unwrap(), rich);
        let _ = fs::remove_dir_all(&dir);
    }
}
