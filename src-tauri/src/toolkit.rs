//! Only preferences cross the process boundary. Timer sessions never enter this store.
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, PhysicalPosition};
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

/// 교실 도구 창의 첫 크기 규칙(모두 논리 px).
/// - `ratio`: 작업 영역(작업 표시줄을 뺀 화면) 대비 비율. 학생이 멀리서 보는 화면이라 처음부터 크게 엽니다.
/// - `base`: 예전 고정 크기. 비율만 쓰면 작은 노트북에서 예전보다 작아지므로 하한으로 씁니다.
/// - `max`: 큰 모니터에서 한 화면을 다 덮어 다른 창을 가리지 않게 하는 상한입니다.
struct WorkWindowSize {
    base: (f64, f64),
    min: (f64, f64),
    ratio: (f64, f64),
    max: (f64, f64),
}
// 창 가장자리에 남길 최소 여백. 여러 타이머가 계단식(±48px)으로 떠도 제목줄을 잡을 수 있게 합니다.
const WORK_MARGIN_X: f64 = 24.0;
const WORK_MARGIN_Y: f64 = 16.0;

fn work_window_size(role: &str) -> Option<WorkWindowSize> {
    // 타이머·집중벨은 화면 한쪽에 띄워 두고 수업을 병행하므로 조금 작게,
    // 뽑기·토너먼트·알림장·명단은 내용이 넓어 더 크게 엽니다.
    const FOCUS: (f64, f64) = (0.75, 0.86);
    const WIDE: (f64, f64) = (0.82, 0.88);
    let (base, min, ratio, max) = match role {
        kind if KINDS.contains(&kind) => ((960.0, 680.0), (380.0, 520.0), FOCUS, (1480.0, 960.0)),
        "focus-bell" => ((960.0, 720.0), (640.0, 480.0), FOCUS, (1480.0, 960.0)),
        "tournament" => ((1180.0, 800.0), (640.0, 520.0), WIDE, (1680.0, 1040.0)),
        "picker" => ((1440.0, 920.0), (640.0, 520.0), WIDE, (1680.0, 1040.0)),
        "roster" | "noticeboard" => ((1040.0, 720.0), (640.0, 480.0), WIDE, (1680.0, 1040.0)),
        _ => return None,
    };
    Some(WorkWindowSize { base, min, ratio, max })
}

/// 작업 영역(논리 px) 안에서 도구 창의 첫 크기를 정합니다.
/// 순서: 비율 → 예전 크기 이상 → 상한 이하 → 작업 영역(여백 제외) 이하. 마지막 단계가 항상 이깁니다.
fn initial_work_size(rule: &WorkWindowSize, area_w: f64, area_h: f64) -> (f64, f64) {
    let fit = |base: f64, ratio: f64, max: f64, area: f64, margin: f64| {
        (area * ratio)
            .max(base)
            .min(max)
            .min((area - margin * 2.0).max(0.0))
            .round()
    };
    (
        fit(rule.base.0, rule.ratio.0, rule.max.0, area_w, WORK_MARGIN_X),
        fit(rule.base.1, rule.ratio.1, rule.max.1, area_h, WORK_MARGIN_Y),
    )
}

/// 작업 영역 한 축에서 창의 시작 좌표(작업 영역 기준 물리 px).
/// 가운데에 두고 계단식 `offset`을 더하되, 창이 커져도 작업 영역 밖으로 밀려나지 않게 가둡니다.
fn placed_offset(area: f64, size: f64, offset: f64) -> f64 {
    let room = (area - size).max(0.0);
    (room / 2.0 + offset).clamp(0.0, room)
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
    let work_size = work_window_size(role);
    let (width, height, min_w, min_h) = if let Some(rule) = &work_size {
        // 모니터를 알기 전의 임시 크기입니다. 아래에서 작업 영역에 맞춰 다시 정합니다.
        (rule.base.0, rule.base.1, rule.min.0, rule.min.1)
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
        let (area_w, area_h) = (area.size.width as f64, area.size.height as f64);
        let (w, h) = match &work_size {
            Some(rule) => initial_work_size(rule, area_w / scale, area_h / scale),
            None => (width.min(area_w / scale), height.min(area_h / scale)),
        };
        let offset = if timer {
            ((id % 5) as f64 - 2.0) * 24.0 * scale
        } else {
            0.0
        };
        let x = area.position.x as f64 + placed_offset(area_w, w * scale, offset);
        let y = area.position.y as f64 + placed_offset(area_h, h * scale, offset);
        // 왜 두 번 적용하는가: 창은 만들어진 모니터의 배율로 먼저 크기가 정해집니다.
        // 배율이 다른 모니터(4K 200% ↔ FHD 100%)로 옮기면 Windows가 배율 변경에 맞춰 크기·위치를
        // 다시 잡으므로, 옮긴 뒤 목표 모니터 기준으로 한 번 더 맞춥니다. 같은 배율이면 아무 변화가 없습니다.
        for _ in 0..2 {
            let _ = win.set_size(tauri::LogicalSize::new(w, h));
            let _ = win.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
        }
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
/// 어느 쪽이든 트레이를 누른 화면의 작업영역 한가운데에 놓습니다.
/// 왜 가운데인가: 툴바는 작고 항상 위에 떠 있어, 모니터 가장자리·다른 화면에 붙어 있으면
///   "열었는데 안 보인다"가 됩니다. 트레이로 연다 = 지금 찾고 있다는 뜻이므로 눈앞에 가져옵니다.
/// 왜 설정을 함께 켜는가: 사용자가 설정에서 툴킷을 꺼 두었다면 창만 띄워도 다음 실행 때 다시 사라져
///   "껐는데 떠 있고, 켰는데 없는" 어긋난 상태가 됩니다. 트레이로 연다 = 툴킷을 쓰겠다는 뜻입니다.
pub fn open_from_tray(app: &tauri::AppHandle) {
    let app = app.clone();
    // 메뉴를 누른 순간의 커서 위치 = 사용자가 보고 있는 화면(트레이를 누른 작업 표시줄)입니다.
    // 뒤로 넘기기 전에 읽어 두어야 그사이 마우스를 옮겨도 누른 화면에 뜹니다.
    let anchor = app.cursor_position().ok();
    // 설정 저장(파일 쓰기)과 창 생성이 트레이 메뉴 클릭을 붙잡지 않도록 뒤로 넘깁니다.
    tauri::async_runtime::spawn(async move {
        if let Some(win) = app.get_webview_window("toolkit") {
            let _ = win.unminimize();
            // 아직 화면(JS)이 뜨는 중인 창이면 곧 저장 위치 복원·크기 맞춤이 지금 옮긴 자리를 덮어쓰므로,
            // 준비가 끝난 뒤 한 번 더 가운데로 옮기도록 맡겨 둡니다.
            if !win.is_visible().unwrap_or(false) {
                request_center(anchor);
            }
            center_on_monitor_at(&app, &win, anchor);
            let _ = win.show();
            raise_above_other_topmost(&win);
            let _ = win.set_focus();
            // 툴바 화면(JS)에 "불려 왔다"고 알려 잠깐 깜빡이게 합니다. 이 이벤트는 툴바 창만 듣습니다.
            let _ = app.emit("toolkit-summoned", ());
            return;
        }
        // 설정 저장이 실패하더라도(예: 알 수 없는 설정 버전) 창은 열어 줍니다.
        if let Err(e) = toolkit_patch(app.clone(), "toolkit".into(), json!({"enabled": true})) {
            log::warn!("툴킷 설정을 켜지 못했습니다: {e}");
        }
        // 새 창은 화면(JS)이 저장 위치를 복원하고 툴바 크기를 맞춘 뒤에야 실제 크기를 알 수 있으므로,
        // 가운데 배치는 그때(toolkit_center_if_requested) 합니다.
        request_center(anchor);
        if let Err(e) = create_window(&app, "toolkit") {
            take_center_request();
            log::warn!("툴킷 창 생성 실패: {e}");
        }
    });
}

/// 툴바를 다른 "항상 위" 창들보다 앞으로 올립니다.
/// 왜 필요한가: "항상 위" 창끼리는 나중에 올라온 쪽이 위에 옵니다. PPT 슬라이드쇼·전자칠판 판서 도구처럼
///   같은 "항상 위" 창이 뒤에 뜨면 툴바가 그 아래에 깔려 "켜져 있는데 안 보이는" 상태가 됩니다.
/// 왜 풀었다 다시 거는가: 이미 켜진 상태에서 다시 켜기만 하면 tao가 변화 없음으로 보고
///   창 순서를 건드리지 않습니다. 한 번 풀어야 다시 걸 때 "항상 위" 창들 중 맨 앞에 놓입니다.
fn raise_above_other_topmost(win: &tauri::WebviewWindow) {
    let _ = win.set_always_on_top(false);
    let _ = win.set_always_on_top(true);
}

/// 트레이가 맡겨 둔 "툴바를 가운데로" 요청. `anchor`는 트레이를 누른 순간의 커서(물리 px)입니다.
struct CenterRequest {
    anchor: Option<PhysicalPosition<f64>>,
    created: Instant,
}
static CENTER_REQUEST: Mutex<Option<CenterRequest>> = Mutex::new(None);
// 맡겨 둔 요청의 유효 시간. 한참 뒤 다른 경로(설정에서 켜기 등)로 뜬 툴바가 엉뚱하게 옮겨지지 않게 합니다.
// 왜 이 정도인가: 트레이 요청 보증(tray.rs PENDING_TTL)과 같은 기준 — 창 화면이 준비되는 데 길어야 2~3초입니다.
const CENTER_REQUEST_TTL: Duration = Duration::from_secs(10);

fn request_center(anchor: Option<PhysicalPosition<f64>>) {
    if let Ok(mut slot) = CENTER_REQUEST.lock() {
        *slot = Some(CenterRequest { anchor, created: Instant::now() });
    }
}

// 맡겨 둔 요청을 한 번만 꺼내 줍니다. 오래 묵은 요청은 버립니다.
fn take_center_request() -> Option<CenterRequest> {
    let request = CENTER_REQUEST.lock().ok()?.take()?;
    (request.created.elapsed() <= CENTER_REQUEST_TTL).then_some(request)
}

/// `anchor`가 있는 모니터의 작업영역(작업 표시줄 제외) 한가운데로 창을 옮깁니다.
/// 커서를 읽지 못했거나 그 자리에 모니터가 없으면 주 모니터를 씁니다.
fn center_on_monitor_at(app: &tauri::AppHandle, win: &tauri::WebviewWindow, anchor: Option<PhysicalPosition<f64>>) {
    let monitor = anchor
        .and_then(|point| app.monitor_from_point(point.x, point.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };
    let area = monitor.work_area();
    let work = (area.position.x as i64, area.position.y as i64, area.size.width as i64, area.size.height as i64);
    // 왜 두 번인가: 배율이 다른 모니터(4K 200% ↔ FHD 100%)로 옮기면 Windows가 창의 물리 크기를
    //   새 배율에 맞춰 다시 잡으므로, 옮긴 뒤의 크기로 가운데를 한 번 더 계산합니다. 같은 배율이면 변화가 없습니다.
    // 새 위치의 저장은 툴바 화면의 "창 이동" 처리기가 합니다.
    for _ in 0..2 {
        let Ok(size) = win.outer_size() else { return };
        let (x, y) = crate::centered_in(work, size.width as i64, size.height as i64);
        let _ = win.set_position(PhysicalPosition::new(x as i32, y as i32));
    }
}

/// 툴바 화면(JS)이 저장 위치 복원·크기 맞춤을 마친 뒤, 보여 주기 직전에 부릅니다.
/// 트레이가 맡겨 둔 요청이 있으면 가운데로 옮기고 true, 없으면 아무 일도 하지 않고 false.
#[tauri::command]
pub async fn toolkit_center_if_requested(app: tauri::AppHandle, window: tauri::WebviewWindow) -> bool {
    // 요청은 툴바 창 몫입니다. 다른 창이 가져가면 툴바는 옮겨지지 않은 채 요청만 사라집니다.
    if window.label() != "toolkit" {
        return false;
    }
    let Some(request) = take_center_request() else { return false };
    center_on_monitor_at(&app, &window, request.anchor);
    true
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
    fn work_windows_open_large_on_classroom_screens() {
        let timer = work_window_size("digital").unwrap();
        let picker = work_window_size("picker").unwrap();
        // 1920×1080(작업 표시줄 48 제외) — 4K 200%와 FHD 100% 모두 이 논리 크기입니다.
        assert_eq!(initial_work_size(&timer, 1920.0, 1032.0), (1440.0, 888.0));
        // 뽑기는 예전부터 높이가 넉넉해(920) 높이는 그대로, 너비만 넓어집니다.
        assert_eq!(initial_work_size(&picker, 1920.0, 1032.0), (1574.0, 920.0));
        // 모든 도구가 예전 고정 크기보다 작아지지 않고, 너비는 모두 커집니다.
        for role in ["digital", "analog", "hourglass", "stopwatch", "focus-bell", "tournament", "picker", "roster", "noticeboard"] {
            let rule = work_window_size(role).unwrap();
            let (w, h) = initial_work_size(&rule, 1920.0, 1032.0);
            assert!(w > rule.base.0 && h >= rule.base.1, "{role}: {w}×{h}");
        }
    }
    #[test]
    fn work_window_size_respects_small_and_huge_screens() {
        let timer = work_window_size("analog").unwrap();
        let picker = work_window_size("picker").unwrap();
        // 1366×768 노트북: 비율로는 예전보다 작아지지만 예전 크기를 지킵니다.
        assert_eq!(initial_work_size(&timer, 1366.0, 728.0), (1025.0, 680.0));
        // 예전 크기도 들어가지 않으면 작업 영역(여백 제외)에 맞춥니다.
        assert_eq!(initial_work_size(&picker, 1366.0, 728.0), (1318.0, 696.0));
        // 큰 모니터에서는 상한에서 멈춥니다.
        assert_eq!(initial_work_size(&timer, 2560.0, 1392.0), (1480.0, 960.0));
        assert_eq!(initial_work_size(&picker, 3840.0, 2112.0), (1680.0, 1040.0));
        // 메뉴·설정 같은 작은 창은 이 규칙을 쓰지 않습니다.
        assert!(work_window_size("toolkit-menu").is_none());
        assert!(work_window_size("toolkit-settings").is_none());
    }
    #[test]
    fn staggered_timers_stay_inside_work_area() {
        // 가운데 + 계단식 이동
        assert_eq!(placed_offset(1920.0, 1440.0, 48.0), 288.0);
        // 창이 작업 영역을 거의 채우면 이동해도 밖으로 나가지 않습니다.
        assert_eq!(placed_offset(1366.0, 1318.0, 48.0), 48.0);
        assert_eq!(placed_offset(1366.0, 1318.0, -48.0), 0.0);
        // 창이 작업 영역보다 커도 음수 좌표로 가지 않습니다.
        assert_eq!(placed_offset(800.0, 900.0, 24.0), 0.0);
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

    // 트레이의 "가운데로" 요청은 한 번만 쓰이고, 오래 묵으면 버려져야 합니다.
    // 왜 중요한가: 남아 있으면 나중에 설정에서 켠 툴바가 사용자가 둔 자리 대신 가운데로 옮겨집니다.
    #[test]
    fn center_request_is_taken_once_and_expires() {
        use super::*;
        let anchor = PhysicalPosition::new(2500.0, 400.0);
        request_center(Some(anchor));
        let taken = take_center_request().expect("방금 맡긴 요청은 꺼낼 수 있어야 합니다");
        assert_eq!(taken.anchor, Some(anchor));
        assert!(take_center_request().is_none());

        let long_ago = Instant::now()
            .checked_sub(CENTER_REQUEST_TTL + Duration::from_secs(1))
            .unwrap_or_else(Instant::now);
        *CENTER_REQUEST.lock().unwrap() = Some(CenterRequest { anchor: None, created: long_ago });
        assert!(take_center_request().is_none());
        // 버린 요청은 자리에서도 사라집니다.
        assert!(CENTER_REQUEST.lock().unwrap().is_none());
    }
}
