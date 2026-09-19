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
    json!({"schemaVersion":1,"revision":0,"toolkit":{"enabled":true,"orientation":"horizontal","collapsed":false,"visibleToolIds":["timer"],"position":null},
        "preferences":{"digital":sound,"analog":analog,"hourglass":hourglass,"stopwatch":{"tickEnabled":true}}})
}
fn field_valid(scope: &str, key: &str, value: &Value) -> bool {
    if scope == "toolkit" {
        return match key {
            "enabled" | "collapsed" => value.is_boolean(),
            "orientation" => matches!(value.as_str(), Some("horizontal" | "vertical")),
            "visibleToolIds" => value
                .as_array()
                .is_some_and(|a| a.len() <= 1 && a.iter().all(|v| v == "timer")),
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
    if raw["schemaVersion"] != 1 {
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
// The store plugin can otherwise treat an unreadable file as empty defaults.
fn validate_file(app: &tauri::AppHandle) -> Result<(), String> {
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
#[tauri::command]
pub fn toolkit_read(app: tauri::AppHandle) -> Result<Value, String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "설정 잠금 오류")?;
    validate_file(&app)?;
    let store = app.store(FILE).map_err(|e| e.to_string())?;
    normalized(store.get("settings"))
}
#[tauri::command]
pub fn toolkit_patch(app: tauri::AppHandle, scope: String, patch: Value) -> Result<Value, String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "설정 잠금 오류")?;
    validate_file(&app)?;
    let store = app.store(FILE).map_err(|e| e.to_string())?;
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
    label == "toolkit" || is_timer(label)
}

fn create_window(app: &tauri::AppHandle, role: &str) -> Result<String, String> {
    if QUITTING.load(Ordering::SeqCst) {
        return Err("앱을 종료하고 있어요.".into());
    }
    let _guard = WINDOW_LOCK.lock().map_err(|_| "창 잠금 오류")?;
    let timer = KINDS.contains(&role);
    if !timer && !["toolkit", "toolkit-menu", "toolkit-settings"].contains(&role) {
        return Err("알 수 없는 도구입니다.".into());
    }
    let id = NEXT_WINDOW.fetch_add(1, Ordering::SeqCst);
    let label = if timer {
        format!("timer-{role}-{id}")
    } else {
        role.to_string()
    };
    if let Some(win) = app.get_webview_window(&label) {
        if role != "toolkit-menu" {
            let _ = win.unminimize();
            let _ = win.show();
            let _ = win.set_focus();
        }
        return Ok(label);
    }
    let (width, height, min_w, min_h) = if timer {
        (960.0, 680.0, 380.0, 520.0)
    } else if role == "toolkit-settings" {
        (380.0, 480.0, 340.0, 400.0)
    } else if role == "toolkit-menu" {
        (244.0, 250.0, 244.0, 250.0)
    } else {
        (280.0, 52.0, 90.0, 44.0)
    };
    let title = match role {
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
            .resizable(timer || role == "toolkit-settings")
            .always_on_top(!timer)
            .skip_taskbar(!timer)
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
        for label in ["toolkit-menu", "toolkit-settings", "toolkit"] {
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.destroy();
            }
        }
    }
    Ok(next)
}
pub fn startup(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        match toolkit_read(app.clone()) {
            Ok(v) if v["toolkit"]["enabled"] == true => {
                if let Err(e) = create_window(&app, "toolkit") {
                    log::warn!("툴킷 생성 실패: {e}");
                }
            }
            Err(e) => log::warn!("툴킷 설정 읽기 실패: {e}"),
            _ => {}
        }
    });
}
#[cfg(test)]
mod tests {
    use super::*;
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
        assert!(normalized(Some(json!({"schemaVersion":2}))).is_err());
    }
    #[test]
    fn only_work_windows_keep_app_alive() {
        assert!(is_work_window("timer-analog-42"));
        assert!(!is_work_window("toolkit-menu"));
    }
}
