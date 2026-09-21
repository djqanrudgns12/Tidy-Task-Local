//! Only preferences cross the process boundary. Timer sessions never enter this store.
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex,
};
use tauri::{Emitter, Manager};
use tauri_plugin_store::StoreExt;

const FILE: &str = "tidy-task-toolkit.json";
static STORE_LOCK: Mutex<()> = Mutex::new(());
static WINDOW_LOCK: Mutex<()> = Mutex::new(());
static NEXT_WINDOW: AtomicU64 = AtomicU64::new(1);
pub static QUITTING: AtomicBool = AtomicBool::new(false);
const KINDS: [&str; 4] = ["digital", "analog", "hourglass", "stopwatch"];

fn defaults() -> Value {
    let sound = json!({"tickEnabled":true,"warningEnabled":true,"endEnabled":true,"warningLeadSeconds":5,"warningDurationSeconds":null});
    let mut analog = sound.clone();
    analog["dialRangeMinutes"] = json!(60);
    let mut hourglass = sound.clone();
    hourglass["showRemainingTime"] = json!(true);
    json!({"schemaVersion":6,"revision":0,"toolkit":{"theme":"sage","darkMode":false,"enabled":false,"orientation":"horizontal","toolbarSize":2,"collapsed":false,"visibleToolIds":["timer","picker","noticeboard","tournament","focus-bell","roster"],"hiddenPlatformIds":[],"externalToolsEnabled":true,"position":null},
        "preferences":{"digital":sound,"analog":analog,"hourglass":hourglass,"stopwatch":{"tickEnabled":true}}})
}
fn field_valid(scope: &str, key: &str, value: &Value) -> bool {
    if scope == "toolkit" {
        return match key {
            "enabled" | "collapsed" | "externalToolsEnabled" | "darkMode" => value.is_boolean(),
            "theme" => matches!(value.as_str(), Some("sage" | "ocean" | "lavender" | "rose" | "amber" | "slate")),
            "toolbarSize" => value.as_u64().is_some_and(|n| n <= 4),
            "orientation" => matches!(value.as_str(), Some("horizontal" | "vertical")),
            "visibleToolIds" => value
                .as_array()
                .is_some_and(|a| a.len() <= 6 && a.iter().all(|v| v == "timer" || v == "roster" || v == "noticeboard" || v == "picker" || v == "tournament" || v == "focus-bell")),
            "hiddenPlatformIds" => value.as_array().is_some_and(|a|
                a.len() <= 2 && a.iter().all(|v| v == "clanner" || v == "rollinthunder")),
            "position" => {
                value.is_null()
                    || value.as_object().is_some_and(|o| {
                        !o.is_empty()
                            && o.keys().all(|k| {
                                [
                                    "physicalX",
                                    "physicalY",
                                    "logicalX",
                                    "logicalY",
                                    "width",
                                    "height",
                                ]
                                .contains(&k.as_str())
                            })
                            && o.values().all(|v| {
                                v.as_f64()
                                    .is_some_and(|n| n.is_finite() && n.abs() < 100000.0)
                            })
                    })
            }
            _ => false,
        };
    }
    if !KINDS.contains(&scope) {
        return false;
    }
    if key == "tickEnabled" {
        return value.is_boolean();
    }
    if scope == "stopwatch" {
        return false;
    }
    match key {
        "warningEnabled" | "endEnabled" => value.is_boolean(),
        "warningLeadSeconds" => value
            .as_u64()
            .is_some_and(|n| [5, 10, 20, 30, 40, 50, 60, 90, 120].contains(&n)),
        "warningDurationSeconds" => {
            value.is_null() || value.as_u64().is_some_and(|n| [2, 5, 10, 20].contains(&n))
        }
        "dialRangeMinutes" => scope == "analog" && matches!(value.as_u64(), Some(30 | 60)),
        "showRemainingTime" => scope == "hourglass" && value.is_boolean(),
        _ => false,
    }
}
fn normalized(raw: Option<Value>) -> Result<Value, String> {
    let mut result = defaults();
    let Some(raw) = raw else { return Ok(result) };
    if raw["schemaVersion"] != 1 && raw["schemaVersion"] != 2 && raw["schemaVersion"] != 3 && raw["schemaVersion"] != 4 && raw["schemaVersion"] != 5 && raw["schemaVersion"] != 6 {
        return Err("지원하지 않는 툴킷 설정 버전입니다. 원본을 보존합니다.".into());
    }
    result["revision"] = json!(raw["revision"].as_u64().unwrap_or(0));
    for scope in ["toolkit", "digital", "analog", "hourglass", "stopwatch"] {
        let source = if scope == "toolkit" {
            &raw[scope]
        } else {
            &raw["preferences"][scope]
        };
        if let Some(fields) = source.as_object() {
            for (key, value) in fields {
                if field_valid(scope, key, value) {
                    if scope == "toolkit" {
                        result[scope][key] = value.clone();
                    } else {
                        result["preferences"][scope][key] = value.clone();
                    }
                }
            }
        }
    }
    if raw["schemaVersion"] == 1 {
        if let Some(ids) = result["toolkit"]["visibleToolIds"].as_array_mut() {
            if !ids.iter().any(|id| id == "roster") { ids.push(json!("roster")); }
        }
    }
    if raw["schemaVersion"] == 1 || raw["schemaVersion"] == 2 {
        if let Some(ids) = result["toolkit"]["visibleToolIds"].as_array_mut() {
            if !ids.iter().any(|id| id == "noticeboard") { ids.push(json!("noticeboard")); }
        }
    }
    if matches!(raw["schemaVersion"].as_u64(), Some(1 | 2 | 3)) {
        if let Some(ids) = result["toolkit"]["visibleToolIds"].as_array_mut() {
            if !ids.iter().any(|id| id == "picker") { ids.push(json!("picker")); }
        }
    }
    if matches!(raw["schemaVersion"].as_u64(), Some(1 | 2 | 3 | 4)) {
        if let Some(ids) = result["toolkit"]["visibleToolIds"].as_array_mut() {
            if !ids.iter().any(|id| id == "tournament") { ids.push(json!("tournament")); }
        }
    }
    if matches!(raw["schemaVersion"].as_u64(), Some(1 | 2 | 3 | 4 | 5)) {
        if let Some(ids) = result["toolkit"]["visibleToolIds"].as_array_mut() {
            if !ids.iter().any(|id| id == "focus-bell") { ids.push(json!("focus-bell")); }
        }
    }
    Ok(result)
}
fn merge(mut value: Value, scope: &str, patch: Value) -> Result<Value, String> {
    let fields = patch.as_object().ok_or("설정 형식이 올바르지 않습니다.")?;
    if fields.is_empty() || fields.iter().any(|(k, v)| !field_valid(scope, k, v)) {
        return Err("저장할 수 없는 설정입니다.".into());
    }
    for (key, field) in fields {
        if scope == "toolkit" {
            value[scope][key] = field.clone();
        } else {
            value["preferences"][scope][key] = field.clone();
        }
    }
    value["revision"] = json!(value["revision"].as_u64().unwrap_or(0) + 1);
    Ok(value)
}
// 한 번 검증을 통과해 저장소가 메모리에 올라오면, 그 뒤로는 플러그인이 파일을 다시 읽지 않습니다.
// 그래서 매 읽기·저장마다 파일 전체를 다시 읽어 파싱할 필요가 없습니다(검증 실패 시에는 계속 확인).
static FILE_VALIDATED: AtomicBool = AtomicBool::new(false);
// The store plugin can otherwise treat an unreadable file as empty defaults.
fn validate_file(app: &tauri::AppHandle) -> Result<(), String> {
    if FILE_VALIDATED.load(Ordering::Acquire) {
        return Ok(());
    }
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(FILE);
    if !path.exists() {
        return Ok(());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "툴킷 설정 파일을 읽지 못했습니다. 원본을 보존합니다.".to_string())?;
    if !value.is_object() {
        return Err("툴킷 설정 형식이 잘못되었습니다. 원본을 보존합니다.".into());
    }
    Ok(())
}
/// 검증된 파일로 저장소를 엽니다. 저장소가 메모리에 올라온 뒤에만 "검증 완료"로 기록합니다.
fn open_store(
    app: &tauri::AppHandle,
) -> Result<std::sync::Arc<tauri_plugin_store::Store<tauri::Wry>>, String> {
    validate_file(app)?;
    let store = app.store(FILE).map_err(|e| e.to_string())?;
    FILE_VALIDATED.store(true, Ordering::Release);
    Ok(store)
}
// 왜 async인가: 동기 명령은 메인(UI) 스레드에서 돌아 파일 읽기·쓰기 동안 모든 창의 이벤트 처리가 멈춥니다.
// `command(async)`는 함수 모양을 그대로 둔 채(내부 호출 유지) 작업 스레드에서 실행합니다.
#[tauri::command(async)]
pub fn toolkit_read(app: tauri::AppHandle) -> Result<Value, String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "설정 잠금 오류")?;
    let store = open_store(&app)?;
    normalized(store.get("settings"))
}
#[tauri::command(async)]
pub fn toolkit_patch(app: tauri::AppHandle, scope: String, patch: Value) -> Result<Value, String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "설정 잠금 오류")?;
    let store = open_store(&app)?;
    let previous = store.get("settings");
    let next = merge(normalized(previous.clone())?, &scope, patch)?;
    store.set("settings", next.clone());
    if let Err(error) = store.save() {
        if let Some(old) = previous {
            store.set("settings", old);
        } else {
            store.delete("settings");
        }
        return Err(error.to_string());
    }
    let _ = app.emit("toolkit-preferences-changed", &next);
    Ok(next)
}
pub fn is_timer(label: &str) -> bool {
    KINDS
        .iter()
        .any(|kind| label.starts_with(&format!("timer-{kind}-")))
}
pub fn is_work_window(label: &str) -> bool {
    label == "toolkit" || label == "roster" || label == "noticeboard" || label == "picker" || label == "tournament" || label == "focus-bell" || is_timer(label)
}

fn create_window(app: &tauri::AppHandle, role: &str) -> Result<String, String> {
    if QUITTING.load(Ordering::SeqCst) || crate::noticeboard_quit::pending() {
        return Err("앱을 종료하고 있어요.".into());
    }
    let _guard = WINDOW_LOCK.lock().map_err(|_| "창 잠금 오류")?;
    let timer = KINDS.contains(&role);
    if !timer && !["toolkit", "toolkit-menu", "toolkit-external-menu", "toolkit-context-menu", "toolkit-settings", "roster", "noticeboard", "picker", "tournament", "focus-bell"].contains(&role) {
        return Err("알 수 없는 도구입니다.".into());
    }
    let id = NEXT_WINDOW.fetch_add(1, Ordering::SeqCst);
    let label = if timer {
        format!("timer-{role}-{id}")
    } else {
        role.to_string()
    };
    if let Some(win) = app.get_webview_window(&label) {
        if !role.ends_with("-menu") {
            let _ = win.unminimize();
            let _ = win.show();
            let _ = win.set_focus();
        }
        return Ok(label);
    }
    let (width, height, min_w, min_h) = if timer {
        (960.0, 680.0, 380.0, 520.0)
    } else if role == "focus-bell" {
        (960.0, 720.0, 640.0, 480.0)
    } else if role == "tournament" {
        (1180.0, 800.0, 640.0, 520.0)
    } else if role == "picker" {
        (1440.0, 920.0, 640.0, 520.0)
    } else if role == "roster" || role == "noticeboard" {
        (1040.0, 720.0, 640.0, 480.0)
    } else if role == "toolkit-settings" {
        (380.0, 480.0, 340.0, 400.0)
    } else if role == "toolkit-menu" {
        (244.0, 250.0, 244.0, 250.0)
    } else if role == "toolkit-external-menu" {
        (244.0, 162.0, 244.0, 114.0)
    } else if role == "toolkit-context-menu" {
        // 우클릭 메뉴 — JS windows.js의 MENU_WINDOWS.context와 같은 크기
        (224.0, 226.0, 224.0, 226.0)
    } else {
        (194.0, 66.0, 60.0, 60.0)
    };
    let title = match role {
        "roster" => "학급 명단",
        "picker" => "간단 뽑기",
        "tournament" => "토너먼트",
        "focus-bell" => "집중벨",
        "noticeboard" => "알림장",
        "digital" => "전광판 타이머",
        "analog" => "아날로그 타이머",
        "hourglass" => "모래시계",
        "stopwatch" => "스톱워치",
        "toolkit-settings" => "툴킷 설정",
        _ => "학급 툴킷",
    };
    let win =
        tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title(title)
            .inner_size(width, height)
            .min_inner_size(min_w, min_h)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .resizable(timer || role == "toolkit-settings" || role == "roster" || role == "noticeboard" || role == "picker" || role == "tournament" || role == "focus-bell")
            .always_on_top(!timer && role != "roster" && role != "noticeboard" && role != "picker" && role != "tournament" && role != "focus-bell")
            .skip_taskbar(!timer && role != "roster" && role != "noticeboard" && role != "picker" && role != "tournament" && role != "focus-bell")
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?;
    let monitor = app
        .get_webview_window("toolkit")
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| win.primary_monitor().ok().flatten());
    if let Some(m) = monitor {
        let area = m.work_area();
        let scale = m.scale_factor();
        let w = width.min(area.size.width as f64 / scale);
        let h = height.min(area.size.height as f64 / scale);
        let _ = win.set_size(tauri::LogicalSize::new(w, h));
        let offset = if timer {
            ((id % 5) as f64 - 2.0) * 24.0 * scale
        } else {
            0.0
        };
        let x =
            area.position.x as f64 + ((area.size.width as f64 - w * scale) / 2.0 + offset).max(0.0);
        let y = area.position.y as f64
            + ((area.size.height as f64 - h * scale) / 2.0 + offset).max(0.0);
        let _ = win.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
    }
    Ok(label)
}
#[tauri::command]
pub async fn toolkit_open(app: tauri::AppHandle, role: String) -> Result<String, String> {
    create_window(&app, &role)
}
#[tauri::command]
pub async fn toolkit_set_enabled(app: tauri::AppHandle, enabled: bool) -> Result<Value, String> {
    let next = toolkit_patch(app.clone(), "toolkit".into(), json!({"enabled":enabled}))?;
    if enabled {
        create_window(&app, "toolkit")?;
    } else {
        for label in ["toolkit-menu", "toolkit-external-menu", "toolkit-context-menu", "toolkit-settings", "toolkit"] {
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.destroy();
            }
        }
    }
    Ok(next)
}
/// 트레이 "Tidy 툴킷 열기" — 떠 있으면 앞으로 가져오고, 없으면 만들어 띄웁니다.
/// 왜 설정을 함께 켜는가: 사용자가 설정에서 툴킷을 꺼 두었다면 창만 띄워도 다음 실행 때 다시 사라져
///   "껐는데 떠 있고, 켰는데 없는" 어긋난 상태가 됩니다. 트레이로 연다 = 툴킷을 쓰겠다는 뜻입니다.
pub fn open_from_tray(app: &tauri::AppHandle) {
    let app = app.clone();
    // 설정 저장(파일 쓰기)과 창 생성이 트레이 메뉴 클릭을 붙잡지 않도록 뒤로 넘깁니다.
    tauri::async_runtime::spawn(async move {
        if let Some(win) = app.get_webview_window("toolkit") {
            let _ = win.unminimize();
            crate::ensure_window_on_screen(&win);
            let _ = win.show();
            let _ = win.set_focus();
            return;
        }
        // 설정 저장이 실패하더라도(예: 알 수 없는 설정 버전) 창은 열어 줍니다.
        if let Err(e) = toolkit_patch(app.clone(), "toolkit".into(), json!({"enabled": true})) {
            log::warn!("툴킷 설정을 켜지 못했습니다: {e}");
        }
        if let Err(e) = create_window(&app, "toolkit") {
            log::warn!("툴킷 창 생성 실패: {e}");
        }
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn toolbar_size_validation_and_persistence() {
        use super::*;
        let old = normalized(Some(json!({"schemaVersion":6,"toolkit":{}}))).unwrap();
        assert_eq!(old["toolkit"]["toolbarSize"], json!(2));
        for size in 0..=4 {
            let saved = merge(old.clone(), "toolkit", json!({"toolbarSize":size})).unwrap();
            assert_eq!(normalized(Some(saved)).unwrap()["toolkit"]["toolbarSize"], json!(size));
        }
        for invalid in [json!(-1), json!(5), json!(1.5), json!("2"), Value::Null] {
            assert!(merge(old.clone(), "toolkit", json!({"toolbarSize":invalid})).is_err());
            assert_eq!(normalized(Some(json!({"schemaVersion":6,"toolkit":{"toolbarSize":invalid}}))).unwrap()["toolkit"]["toolbarSize"], json!(2));
        }
    }
    use super::*;
    #[test]
    fn appearance_is_validated_and_survives_reload() {
        for theme in ["sage", "ocean", "lavender", "rose", "amber", "slate"] {
            let selected = merge(defaults(), "toolkit", json!({"theme":theme,"darkMode":true})).unwrap();
            let reloaded = normalized(Some(selected)).unwrap();
            assert_eq!(reloaded["toolkit"]["theme"], theme);
            let light = merge(reloaded, "toolkit", json!({"darkMode":false})).unwrap();
            assert_eq!(light["toolkit"]["theme"], theme);
        }
        assert!(merge(defaults(), "toolkit", json!({"theme":"unknown"})).is_err());
        assert!(merge(defaults(), "toolkit", json!({"darkMode":"true"})).is_err());
        let old = normalized(Some(json!({"schemaVersion":6,"toolkit":{}}))).unwrap();
        assert_eq!(old["toolkit"]["theme"], "sage");
        assert_eq!(old["toolkit"]["darkMode"], false);
    }
    #[test]
    fn patches_preserve_other_fields_and_kinds() {
        let a = merge(defaults(), "digital", json!({"warningLeadSeconds":30})).unwrap();
        let b = merge(a, "digital", json!({"tickEnabled":false})).unwrap();
        assert_eq!(b["preferences"]["digital"]["warningLeadSeconds"], 30);
        assert_eq!(b["preferences"]["analog"]["tickEnabled"], true);
        assert_eq!(b["revision"], 2);
    }
    #[test]
    fn runtime_data_is_rejected() {
        for key in ["laps", "remainingMs", "activityTitle", "alwaysOnTop"] {
            assert!(merge(defaults(), "digital", json!({key:42})).is_err());
        }
        assert!(merge(defaults(), "stopwatch", json!({"warningEnabled":true})).is_err());
    }
    #[test]
    fn future_version_is_not_overwritten() {
        assert!(normalized(Some(json!({"schemaVersion":99}))).is_err());
    }
    #[test]
    fn only_work_windows_keep_app_alive() {
        assert!(is_work_window("focus-bell"));
        assert!(is_work_window("timer-analog-42"));
        assert!(is_work_window("noticeboard"));
        assert!(is_work_window("picker"));
        assert!(!is_work_window("toolkit-menu"));
        assert!(!is_work_window("toolkit-external-menu"));
        assert!(!is_work_window("toolkit-context-menu"));
    }
    #[test]
    fn notice_migration_preserves_hidden_existing_tools() {
        let value=normalized(Some(json!({"schemaVersion":2,"toolkit":{"visibleToolIds":[],"hiddenPlatformIds":["clanner"]}}))).unwrap();
        assert_eq!(value["toolkit"]["visibleToolIds"],json!(["noticeboard","picker","tournament","focus-bell"]));
        assert_eq!(value["toolkit"]["hiddenPlatformIds"],json!(["clanner"]));
        let value=normalized(Some(json!({"schemaVersion":6,"toolkit":{"visibleToolIds":[]}}))).unwrap();
        assert_eq!(value["toolkit"]["visibleToolIds"],json!([]));
    }
    #[test]
    fn focus_migration_preserves_hidden_tools_and_can_be_hidden() {
        let migrated = normalized(Some(json!({"schemaVersion":5,"toolkit":{"visibleToolIds":["roster"]}}))).unwrap();
        assert_eq!(migrated["toolkit"]["visibleToolIds"], json!(["roster","focus-bell"]));
        let hidden = merge(migrated, "toolkit", json!({"visibleToolIds":["roster"]})).unwrap();
        assert_eq!(normalized(Some(hidden)).unwrap()["toolkit"]["visibleToolIds"], json!(["roster"]));
    }

    #[test]
    fn external_group_preserves_individual_choices() {
        let initial = normalized(Some(json!({"schemaVersion":6,"toolkit":{"hiddenPlatformIds":["clanner"]}}))).unwrap();
        assert_eq!(initial["toolkit"]["externalToolsEnabled"], json!(true));
        let disabled = merge(initial, "toolkit", json!({"externalToolsEnabled":false})).unwrap();
        let reloaded = normalized(Some(disabled)).unwrap();
        assert_eq!(reloaded["toolkit"]["externalToolsEnabled"], json!(false));
        let enabled = merge(reloaded, "toolkit", json!({"externalToolsEnabled":true})).unwrap();
        assert_eq!(enabled["toolkit"]["hiddenPlatformIds"], json!(["clanner"]));
    }

}
