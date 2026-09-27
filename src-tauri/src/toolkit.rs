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
// 업데이트 설치 직전에 app_update가 잡아, 쓰는 도중에 앱이 끝나지 않게 합니다.
pub(crate) static STORE_LOCK: Mutex<()> = Mutex::new(());
static WINDOW_LOCK: Mutex<()> = Mutex::new(());
static NEXT_WINDOW: AtomicU64 = AtomicU64::new(1);
pub static QUITTING: AtomicBool = AtomicBool::new(false);
const KINDS: [&str; 4] = ["digital", "analog", "hourglass", "stopwatch"];
// 시계 제목 최대 글자 수. JS src/lib/clock/clockPreferences.js의 CLOCK_TITLE_MAX와 같아야 합니다(코드포인트로 셈).
const CLOCK_TITLE_MAX: usize = 30;
// 툴킷 UI 글꼴 이름 최대 글자 수. JS src/lib/toolkit/preferences.js의 UI_FONT_NAME_MAX와 같아야 합니다(코드포인트로 셈).
const UI_FONT_NAME_MAX: usize = 60;
// 툴바에 보일 수 있는 도구 id. JS src/lib/toolkit/preferences.js의 허용 목록과 같아야 합니다.
const TOOL_IDS: [&str; 12] = ["timer", "clock", "picker", "noticeboard", "tournament", "focus-bell", "dice", "scoreboard", "thermometer", "vote", "seating", "roster"];
const DEFAULT_VISIBLE_TOOL_IDS: [&str; 6] = ["timer", "picker", "noticeboard", "vote", "seating", "roster"];
const TOOL_ORDER_IDS: [&str; 13] = ["timer", "picker", "noticeboard", "vote", "seating", "roster", "external", "focus-bell", "clock", "scoreboard", "dice", "thermometer", "tournament"];
const LEGACY_TOOL_ORDER_IDS: [&str; 13] = ["timer", "clock", "picker", "noticeboard", "tournament", "focus-bell", "dice", "scoreboard", "thermometer", "vote", "seating", "external", "roster"];
// 점수판 3종의 창 이름(드롭다운 항목). JS registry.js의 SCOREBOARD_TOOLS와 같습니다.
const SCOREBOARD_ROLES: [&str; 3] = ["scoreboard-personal", "scoreboard-group", "scoreboard-custom"];
// 타이머 소리 id(시계음·종료 경고음·종료음). JS src/lib/timers/soundLibrary.js의 SOUND_LIBRARY와 같아야 합니다
// (soundLibrary.test.js가 이 세 목록을 읽어 대조). 목록에 없는 값은 저장을 거부하고, 읽을 때는 기본 소리로 둡니다.
const TICK_SOUNDS: [&str; 14] = ["clock-closeup", "small-tick", "wall-clock", "grandfather-clock", "alarm-clock", "stopwatch", "kitchen-timer", "metronome", "woodblock", "water-drop", "button-click", "soft-tap", "digital-tick", "glass-tink"];
const WARNING_SOUNDS: [&str; 13] = ["double-beep", "buzzer", "signal", "time-signal", "alarm-beep", "game-beep", "soft-ding", "chime-alert", "xylophone", "kalimba", "music-box", "heartbeat", "hurry-tick"];
const END_SOUNDS: [&str; 13] = ["clock-gong", "happy-bells", "kitchen-bell", "boxing-bell", "counter-bell", "doorbell", "singing-bowl", "triangle", "winning-chimes", "celebration", "xylophone-finish", "phone-timer", "cheer"];

fn defaults() -> Value {
    let sound = json!({"tickEnabled":true,"warningEnabled":true,"endEnabled":true,"warningLeadSeconds":5,"warningDurationSeconds":null});
    // 소리 기본값은 타이머마다 예전부터 울리던 소리입니다(JS soundLibrary.js의 DEFAULT_SOUNDS와 같음).
    let with_sounds = |tick: &str, warning: &str, end: &str| {
        let mut prefs = sound.clone();
        prefs["tickSound"] = json!(tick);
        prefs["warningSound"] = json!(warning);
        prefs["endSound"] = json!(end);
        prefs
    };
    let digital = with_sounds("clock-closeup", "double-beep", "winning-chimes");
    let mut analog = with_sounds("small-tick", "buzzer", "clock-gong");
    analog["dialRangeMinutes"] = json!(60);
    let mut hourglass = with_sounds("water-drop", "signal", "happy-bells");
    hourglass["showRemainingTime"] = json!(true);
    let clock = json!({"face":"digital","showSeconds":true,"hour12":true,"title":"","titleHidden":false,"standardTimeSync":true,"analogCaption":true,"analogMinuteNumbers":false});
    json!({"schemaVersion":12,"revision":0,"toolkit":{"theme":"sage","darkMode":false,"uiFontFamily":"메이플스토리 L","enabled":false,"orientation":"horizontal","toolbarSize":2,"alwaysOnTop":true,"collapsed":false,"visibleToolIds":DEFAULT_VISIBLE_TOOL_IDS,"toolOrderIds":TOOL_ORDER_IDS,"hiddenPlatformIds":[],"externalToolsEnabled":true,"position":null},
        "preferences":{"digital":digital,"analog":analog,"hourglass":hourglass,"stopwatch":{"tickEnabled":true,"tickSound":"button-click"},"clock":clock}})
}
fn tool_enabled(toolkit: &Value, id: &Value) -> bool {
    if id == "external" {
        toolkit["externalToolsEnabled"].as_bool().unwrap_or(true)
    } else {
        toolkit["visibleToolIds"].as_array().is_some_and(|ids| ids.contains(id))
    }
}
// 영역 안의 사용자 정렬을 유지하며, 비활성화한 도구를 목록 아래에 모읍니다(JS와 같은 규칙).
fn group_tool_order(value: &mut Value) {
    let toolkit = &value["toolkit"];
    let mut ids = toolkit["toolOrderIds"].as_array().cloned().unwrap_or_default();
    for id in TOOL_ORDER_IDS {
        if !ids.iter().any(|item| item == id) { ids.push(json!(id)); }
    }
    ids.sort_by_key(|id| !tool_enabled(toolkit, id));
    value["toolkit"]["toolOrderIds"] = json!(ids);
}
fn field_valid(scope: &str, key: &str, value: &Value) -> bool {
    if scope == "toolkit" {
        return match key {
            "enabled" | "collapsed" | "externalToolsEnabled" | "darkMode" | "alwaysOnTop" => value.is_boolean(),
            "theme" => matches!(value.as_str(), Some("sage" | "ocean" | "lavender" | "rose" | "amber" | "slate")),
            "toolbarSize" => value.as_u64().is_some_and(|n| n <= 4),
            // 툴킷 전용 글꼴 이름(Tidy Task 글꼴과 따로 저장). 등록 글꼴 목록은 다른 저장소에 있어 이름 모양만 봅니다.
            "uiFontFamily" => value.as_str().is_some_and(|s| {
                !s.trim().is_empty() && s.chars().count() <= UI_FONT_NAME_MAX && !s.chars().any(char::is_control)
            }),
            "orientation" => matches!(value.as_str(), Some("horizontal" | "vertical")),
            "visibleToolIds" => value
                .as_array()
                // 도구가 하나 늘 때마다 길이 상한도 함께 올려야 "모두 보이기" 설정의 저장이 거부되지 않습니다.
                // 같은 도구가 두 번 들어간 목록은 버튼이 두 번 그려지므로 거부합니다.
                .is_some_and(|a| a.len() <= TOOL_IDS.len()
                    && a.iter().enumerate().all(|(i, v)| v.as_str().is_some_and(|id| TOOL_IDS.contains(&id)) && !a[..i].contains(v))),
            "toolOrderIds" => value.as_array().is_some_and(|a| a.len() <= TOOL_ORDER_IDS.len()
                && a.iter().enumerate().all(|(i, v)| v.as_str().is_some_and(|id| TOOL_ORDER_IDS.contains(&id)) && !a[..i].contains(v))),
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
    if scope == "clock" {
        return match key {
            "face" => matches!(value.as_str(), Some("digital" | "analog")),
            "showSeconds" | "hour12" | "titleHidden" | "standardTimeSync" | "analogCaption"
            | "analogMinuteNumbers" => value.is_boolean(),
            // 제목은 한 줄 글자만 받습니다. 줄바꿈 같은 제어 문자가 있으면 화면 배치가 깨집니다.
            "title" => value.as_str().is_some_and(|s| {
                s.chars().count() <= CLOCK_TITLE_MAX && !s.chars().any(char::is_control)
            }),
            _ => false,
        };
    }
    if !KINDS.contains(&scope) {
        return false;
    }
    if key == "tickEnabled" {
        return value.is_boolean();
    }
    // 스톱워치도 시계음은 고를 수 있습니다(경고음·종료음은 없음).
    if key == "tickSound" {
        return value.as_str().is_some_and(|id| TICK_SOUNDS.contains(&id));
    }
    if scope == "stopwatch" {
        return false;
    }
    match key {
        "warningEnabled" | "endEnabled" => value.is_boolean(),
        "warningSound" => value.as_str().is_some_and(|id| WARNING_SOUNDS.contains(&id)),
        "endSound" => value.as_str().is_some_and(|id| END_SOUNDS.contains(&id)),
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
    if !matches!(raw["schemaVersion"].as_u64(), Some(1..=12)) {
        return Err("지원하지 않는 툴킷 설정 버전입니다. 원본을 보존합니다.".into());
    }
    result["revision"] = json!(raw["revision"].as_u64().unwrap_or(0));
    for scope in ["toolkit", "digital", "analog", "hourglass", "stopwatch", "clock"] {
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
    // 스키마 7에서 주사위가 새로 생겼습니다. 이전 설정에 한 번만 넣고, 이후 숨김 선택은 그대로 둡니다(JS preferences.js와 같은 규칙).
    if matches!(raw["schemaVersion"].as_u64(), Some(1 | 2 | 3 | 4 | 5 | 6)) {
        if let Some(ids) = result["toolkit"]["visibleToolIds"].as_array_mut() {
            if !ids.iter().any(|id| id == "dice") { ids.push(json!("dice")); }
        }
    }
    // 스키마 8에서 시계가 새로 생겼습니다. 규칙은 주사위와 같습니다(JS preferences.js와 같은 규칙).
    if matches!(raw["schemaVersion"].as_u64(), Some(1..=7)) {
        if let Some(ids) = result["toolkit"]["visibleToolIds"].as_array_mut() {
            if !ids.iter().any(|id| id == "clock") { ids.push(json!("clock")); }
        }
    }
    // 스키마 9에서 점수판·학급 온도계가 새로 생겼습니다. 규칙은 주사위와 같습니다(JS preferences.js와 같은 규칙).
    if matches!(raw["schemaVersion"].as_u64(), Some(1..=8)) {
        if let Some(ids) = result["toolkit"]["visibleToolIds"].as_array_mut() {
            for id in ["scoreboard", "thermometer"] {
                if !ids.iter().any(|v| v == id) { ids.push(json!(id)); }
            }
        }
    }
    // 스키마 10에서 학급 투표가 새로 생겼습니다. 규칙은 주사위와 같습니다(JS preferences.js와 같은 규칙).
    if matches!(raw["schemaVersion"].as_u64(), Some(1..=9)) {
        if let Some(ids) = result["toolkit"]["visibleToolIds"].as_array_mut() {
            if !ids.iter().any(|id| id == "vote") { ids.push(json!("vote")); }
        }
    }
    if matches!(raw["schemaVersion"].as_u64(), Some(1..=10)) {
        if let Some(ids) = result["toolkit"]["visibleToolIds"].as_array_mut() {
            if !ids.iter().any(|id| id == "seating") { ids.push(json!("seating")); }
        }
    }
    // 이전 기본값인 항목만 새 기본값으로 바꾸고, 선생님의 표시·정렬 선택은 유지합니다.
    if matches!(raw["schemaVersion"].as_u64(), Some(1..=11)) {
        if result["toolkit"]["visibleToolIds"].as_array().is_some_and(|ids| ids.len() == TOOL_IDS.len()) {
            result["toolkit"]["visibleToolIds"] = json!(DEFAULT_VISIBLE_TOOL_IDS);
        }
        if raw["toolkit"]["toolOrderIds"] == json!(LEGACY_TOOL_ORDER_IDS) {
            result["toolkit"]["toolOrderIds"] = json!(TOOL_ORDER_IDS);
        }
    }
    group_tool_order(&mut result);
    Ok(result)
}
fn merge(mut value: Value, scope: &str, patch: Value) -> Result<Value, String> {
    let fields = patch.as_object().ok_or("설정 형식이 올바르지 않습니다.")?;
    if fields.is_empty() || fields.iter().any(|(k, v)| !field_valid(scope, k, v)) {
        return Err("저장할 수 없는 설정입니다.".into());
    }
    let before = value["toolkit"].clone();
    for (key, field) in fields {
        if scope == "toolkit" {
            value[scope][key] = field.clone();
        } else {
            value["preferences"][scope][key] = field.clone();
        }
    }
    if scope == "toolkit" {
        if !fields.contains_key("toolOrderIds") {
            let order = before["toolOrderIds"].as_array().cloned().unwrap_or_default();
            let (unchanged, changed): (Vec<_>, Vec<_>) = order.into_iter().partition(|id|
                tool_enabled(&before, id) == tool_enabled(&value["toolkit"], id));
            value["toolkit"]["toolOrderIds"] = json!(unchanged.into_iter().chain(changed).collect::<Vec<_>>());
        }
        group_tool_order(&mut value);
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
    let layer_changed = scope == "toolkit" && patch.get("alwaysOnTop").is_some();
    let next = {
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
        next
    };
    // 왜 잠금을 푼 뒤에 하는가: 창 설정은 UI 스레드로 넘어가는 일이라, 설정 잠금을 쥔 채 기다리지 않게 합니다.
    if layer_changed {
        if let Some(win) = app.get_webview_window("toolkit") {
            apply_toolbar_layer(&win, toolbar_on_top(&next));
        }
    }
    Ok(next)
}
/// 설정의 "툴바 위치(맨 앞으로 / 맨 뒤로)". 값이 없거나 읽지 못하면 기본값인 맨 앞(true)입니다.
fn toolbar_on_top(settings: &Value) -> bool {
    settings["toolkit"]["alwaysOnTop"].as_bool().unwrap_or(true)
}
/// 저장된 설정을 읽어 툴바를 "항상 위"로 둘지 정합니다. 창을 새로 만들 때 씁니다.
/// 왜 실패해도 true인가: 설정 파일이 잠시 읽히지 않더라도 예전과 같은 동작(항상 위)이 가장 안전합니다.
fn saved_toolbar_on_top(app: &tauri::AppHandle) -> bool {
    let Ok(_guard) = STORE_LOCK.lock() else { return true };
    open_store(app)
        .ok()
        .and_then(|store| normalized(store.get("settings")).ok())
        .map_or(true, |settings| toolbar_on_top(&settings))
}
/// 툴바를 맨 앞(항상 위) 또는 맨 뒤(보통 창)로 둡니다.
/// 맨 앞으로 바꿀 때는 이미 떠 있는 다른 "항상 위" 창들보다 앞으로 올립니다.
/// 맨 뒤로 바꿀 때는 "항상 위"만 풀어 다른 창에 가려질 수 있게 합니다 — 툴바를 누르면 다시 앞으로 옵니다.
fn apply_toolbar_layer(win: &tauri::WebviewWindow, on_top: bool) {
    if on_top {
        raise_above_other_topmost(win);
    } else {
        let _ = win.set_always_on_top(false);
    }
}
pub fn is_timer(label: &str) -> bool {
    KINDS
        .iter()
        .any(|kind| label.starts_with(&format!("timer-{kind}-")))
}
pub fn is_work_window(label: &str) -> bool {
    label == "toolkit" || is_tool_role(label) || is_timer(label)
}
/// 툴바에서 여는 "작업 창"(타이머 제외). 크기 조절·작업표시줄 표시·항상 위 기본 꺼짐을 함께 따릅니다.
/// 왜 한 곳에 모으는가: 예전에는 창 만들기의 세 설정이 목록을 따로 들고 있어, 새 도구를 한 곳만 빠뜨리는 실수가 쉬웠습니다.
fn is_tool_role(role: &str) -> bool {
    matches!(role, "roster" | "noticeboard" | "picker" | "tournament" | "focus-bell" | "dice" | "clock" | "thermometer" | "thermometer-display" | "vote" | "vote-teacher" | "seating" | "seating-teacher" | "seating-display")
        || SCOREBOARD_ROLES.contains(&role)
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
    const TALL: (f64, f64) = (0.46, 0.86);
    let (base, min, ratio, max) = match role {
        kind if KINDS.contains(&kind) => ((960.0, 680.0), (380.0, 520.0), FOCUS, (1480.0, 960.0)),
        "focus-bell" => ((960.0, 720.0), (640.0, 480.0), FOCUS, (1480.0, 960.0)),
        // 주사위도 수업 화면 한쪽에 띄워 두는 도구라 집중벨 규칙을 따르되, 3개와 합계가 들어가는 520×480까지 줄일 수 있습니다.
        "dice" => ((960.0, 720.0), (520.0, 480.0), FOCUS, (1480.0, 960.0)),
        // 시계는 화면 구석에 작게 띄워 두는 일이 많아 다른 도구보다 훨씬 작게(320×220)까지 줄일 수 있습니다.
        "clock" => ((880.0, 560.0), (320.0, 220.0), FOCUS, (1480.0, 960.0)),
        "tournament" => ((1180.0, 800.0), (640.0, 520.0), WIDE, (1680.0, 1040.0)),
        "picker" => ((1440.0, 920.0), (640.0, 520.0), WIDE, (1680.0, 1040.0)),
        "roster" | "noticeboard" => ((1040.0, 720.0), (640.0, 480.0), WIDE, (1680.0, 1040.0)),
        // 점수판은 교실 뒤에서 숫자를 읽어야 해서 넓게 엽니다. 개인은 30명 카드가 들어가도록 최소 폭을 조금 더 둡니다.
        "scoreboard-personal" => ((1280.0, 820.0), (720.0, 520.0), WIDE, (1680.0, 1040.0)),
        "scoreboard-group" | "scoreboard-custom" => ((1180.0, 800.0), (640.0, 480.0), WIDE, (1680.0, 1040.0)),
        // 온도계는 화면 한쪽에 세워 두는 도구라 세로형입니다. 두 개일 때는 create_window가 thermometer_pair_size()를 씁니다.
        "thermometer-display" => ((400.0, 560.0), (280.0, 220.0), (0.0, 0.0), (400.0, 560.0)),
        "thermometer" => ((760.0, 820.0), (380.0, 520.0), TALL, (1120.0, 1040.0)),
        // 투표판은 뒷자리에서 후보 이름을 읽어야 해서 넓게 엽니다(후보 9명 3×3이 760×560까지 들어감).
        "seating" | "seating-display" => ((1280.0, 840.0), (800.0, 600.0), WIDE, (1680.0, 1040.0)),
        "seating-teacher" => ((1120.0, 800.0), (800.0, 600.0), WIDE, (1600.0, 1000.0)),
        "vote" => ((1280.0, 820.0), (760.0, 560.0), WIDE, (1680.0, 1040.0)),
        // 선생님 창은 두 번째 모니터에 띄우는 작은 조종실이라 화면 비율과 상관없이 고정 크기입니다(비율 0 → 하한 = 상한).
        "vote-teacher" => ((440.0, 760.0), (380.0, 560.0), (0.0, 0.0), (440.0, 760.0)),
        _ => return None,
    };
    Some(WorkWindowSize { base, min, ratio, max })
}

/// 온도계를 두 개 나란히 쓰는 학급이면 넓게 엽니다(PRD 5.3).
fn thermometer_pair_size() -> WorkWindowSize {
    WorkWindowSize { base: (1180.0, 820.0), min: (760.0, 520.0), ratio: (0.74, 0.86), max: (1560.0, 1040.0) }
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

pub(crate) fn create_window(app: &tauri::AppHandle, role: &str) -> Result<String, String> {
    if QUITTING.load(Ordering::SeqCst) || crate::noticeboard_quit::pending() {
        return Err("앱을 종료하고 있어요.".into());
    }
    let _guard = WINDOW_LOCK.lock().map_err(|_| "창 잠금 오류")?;
    let timer = KINDS.contains(&role);
    if !timer && !is_tool_role(role) && !["toolkit", "toolkit-menu", "toolkit-scoreboard-menu", "toolkit-external-menu", "toolkit-more-menu", "toolkit-context-menu", "toolkit-settings"].contains(&role) {
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
    let work_size = if role == "thermometer" && crate::scores::last_thermometer_count(app) >= 2 {
        Some(thermometer_pair_size())
    } else {
        work_window_size(role)
    };
    let (width, height, min_w, min_h) = if let Some(rule) = &work_size {
        // 모니터를 알기 전의 임시 크기입니다. 아래에서 작업 영역에 맞춰 다시 정합니다.
        (rule.base.0, rule.base.1, rule.min.0, rule.min.1)
    } else if role == "toolkit-settings" {
        (380.0, 480.0, 340.0, 400.0)
    } else if role == "toolkit-menu" {
        (244.0, 250.0, 244.0, 250.0)
    } else if role == "toolkit-scoreboard-menu" {
        // 점수판 드롭다운 — JS windows.js의 MENU_WINDOWS.scoreboard와 같은 크기
        (264.0, 222.0, 264.0, 222.0)
    } else if role == "toolkit-external-menu" {
        (244.0, 162.0, 244.0, 114.0)
    } else if role == "toolkit-more-menu" {
        (264.0, 480.0, 244.0, 114.0)
    } else if role == "toolkit-context-menu" {
        // 우클릭 메뉴 — JS windows.js의 MENU_WINDOWS.context와 같은 크기
        (340.0, 640.0, 320.0, 240.0)
    } else {
        (194.0, 66.0, 60.0, 60.0)
    };
    let title = match role {
        "roster" => "학급 명단",
        "picker" => "간단 뽑기",
        "tournament" => "토너먼트",
        "focus-bell" => "집중벨",
        "dice" => "주사위",
        "clock" => "시계",
        "scoreboard-personal" => "개인 점수판",
        "scoreboard-group" => "모둠 점수판",
        "scoreboard-custom" => "커스텀 점수판",
        "thermometer" => "학급 온도계",
        "thermometer-display" => "미니 온도계",
        "seating" => "자리 배치",
        "seating-teacher" => "자리 배치 · 선생님 설정",
        "seating-display" => "우리 반 자리",
        "vote" => "학급 투표",
        "vote-teacher" => "학급 투표 · 선생님",
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
            .resizable(timer || role == "toolkit-settings" || is_tool_role(role))
            // 툴바는 설정의 "맨 앞으로 / 맨 뒤로"를 따르고, 메뉴·설정 창은 툴바 옆에 뜨는 팝업이라 늘 위에 둡니다.
            .always_on_top(!timer && !is_tool_role(role) && (role != "toolkit" || saved_toolbar_on_top(app)))
            .skip_taskbar(!timer && !is_tool_role(role))
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
    if role == "toolkit-summon" {
        open_from_tray(&app);
        return Ok("toolkit".into());
    }
    create_window(&app, &role)
}
#[tauri::command]
pub async fn toolkit_set_enabled(app: tauri::AppHandle, enabled: bool) -> Result<Value, String> {
    let next = toolkit_patch(app.clone(), "toolkit".into(), json!({"enabled":enabled}))?;
    if enabled {
        create_window(&app, "toolkit")?;
    } else {
        for label in ["toolkit-menu", "toolkit-scoreboard-menu", "toolkit-external-menu", "toolkit-more-menu", "toolkit-context-menu", "toolkit-settings", "toolkit"] {
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.destroy();
            }
        }
    }
    Ok(next)
}
/// 트레이 "Tidy 툴킷 열기" — 떠 있으면 앞으로 가져오고, 없으면 만들어 띄웁니다.
/// 어느 쪽이든 툴킷을 펼치고, 펼친 크기로 요청한 화면의 작업영역 한가운데에 놓습니다.
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
        request_center(anchor);
        let on_top = match toolkit_patch(app.clone(), "toolkit".into(), json!({"enabled": true, "collapsed": false})) {
            Ok(settings) => toolbar_on_top(&settings),
            Err(e) => {
                log::warn!("툴킷 펼침 설정을 저장하지 못했습니다: {e}");
                saved_toolbar_on_top(&app)
            }
        };
        if let Some(win) = app.get_webview_window("toolkit") {
            let _ = win.unminimize();
            // 아직 화면(JS)이 뜨는 중인 창이면 곧 저장 위치 복원·크기 맞춤이 지금 옮긴 자리를 덮어쓰므로,
            // 준비가 끝난 뒤 한 번 더 가운데로 옮기도록 맡겨 둡니다.
            if !win.is_visible().unwrap_or(false) {
                request_center(anchor);
            }
            center_on_monitor_at(&app, &win, anchor);
            let _ = win.show();
            // "맨 뒤로"로 둔 툴바도 트레이로 부르면 앞에 보여야 하므로, 항상 위만 걸지 않고 초점으로 앞에 가져옵니다.
            if on_top {
                raise_above_other_topmost(&win);
            }
            let _ = win.set_focus();
            // 툴바 화면(JS)에 "불려 왔다"고 알려 잠깐 깜빡이게 합니다. 이 이벤트는 툴바 창만 듣습니다.
            let _ = app.emit("toolkit-summoned", ());
            return;
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
    #[test]
    fn toolbar_layer_defaults_to_front_and_persists() {
        use super::*;
        // 이 설정이 생기기 전 파일(값 없음)은 예전처럼 맨 앞(항상 위)입니다.
        let old = normalized(Some(json!({"schemaVersion":12,"toolkit":{}}))).unwrap();
        assert_eq!(old["toolkit"]["alwaysOnTop"], json!(true));
        assert!(toolbar_on_top(&old));
        let back = merge(old.clone(), "toolkit", json!({"alwaysOnTop":false})).unwrap();
        let reloaded = normalized(Some(back)).unwrap();
        assert_eq!(reloaded["toolkit"]["alwaysOnTop"], json!(false));
        assert!(!toolbar_on_top(&reloaded));
        for invalid in [json!(0), json!("false"), Value::Null] {
            assert!(merge(old.clone(), "toolkit", json!({"alwaysOnTop":invalid})).is_err());
            assert_eq!(normalized(Some(json!({"schemaVersion":12,"toolkit":{"alwaysOnTop":invalid}}))).unwrap()["toolkit"]["alwaysOnTop"], json!(true));
        }
    }
    #[test]
    fn tool_order_survives_reload_and_hidden_tools_move_to_the_end() {
        use super::*;
        let order = json!(["roster", "external", "timer", "clock", "picker", "noticeboard", "tournament", "focus-bell", "dice", "scoreboard", "thermometer", "vote", "seating"]);
        let saved = merge(defaults(), "toolkit", json!({"toolOrderIds": order})).unwrap();
        let hidden = merge(saved, "toolkit", json!({"visibleToolIds": ["timer"]})).unwrap();
        assert_eq!(hidden["toolkit"]["toolOrderIds"][0], "external");
        assert_eq!(hidden["toolkit"]["toolOrderIds"][1], "timer");
        assert_eq!(normalized(Some(hidden.clone())).unwrap()["toolkit"]["toolOrderIds"], hidden["toolkit"]["toolOrderIds"]);
        assert!(merge(defaults(), "toolkit", json!({"toolOrderIds": ["timer", "timer"]})).is_err());
        let old = normalized(Some(json!({"schemaVersion": 11, "toolkit": {}}))).unwrap();
        assert_eq!(old["toolkit"]["toolOrderIds"], json!(TOOL_ORDER_IDS));
    }
    #[test]
    fn new_defaults_migrate_only_untouched_legacy_fields() {
        let legacy = normalized(Some(json!({"schemaVersion":11,"toolkit":{
            "visibleToolIds":TOOL_IDS,"toolOrderIds":LEGACY_TOOL_ORDER_IDS
        }}))).unwrap();
        assert_eq!(legacy["schemaVersion"], 12);
        assert_eq!(legacy["toolkit"]["visibleToolIds"], json!(DEFAULT_VISIBLE_TOOL_IDS));
        assert_eq!(legacy["toolkit"]["toolOrderIds"], json!(TOOL_ORDER_IDS));
        let all = merge(legacy, "toolkit", json!({"visibleToolIds":TOOL_IDS})).unwrap();
        assert_eq!(normalized(Some(all)).unwrap()["toolkit"]["visibleToolIds"], json!(TOOL_IDS));
        let custom = normalized(Some(json!({"schemaVersion":11,"toolkit":{
            "visibleToolIds":["roster","timer","clock"],"externalToolsEnabled":false,
            "hiddenPlatformIds":["clanner"],"toolOrderIds":["roster","dice","clock","timer","external"]
        }}))).unwrap();
        assert_eq!(custom["toolkit"]["visibleToolIds"], json!(["roster","timer","clock"]));
        assert_eq!(&custom["toolkit"]["toolOrderIds"].as_array().unwrap()[..5], &json!(["roster","clock","timer","dice","external"]).as_array().unwrap()[..]);
        assert_eq!(custom["toolkit"]["hiddenPlatformIds"], json!(["clanner"]));
        assert_eq!(normalized(Some(custom.clone())).unwrap(), custom);
    }
    #[test]
    fn visibility_changes_append_in_sequence_and_reenable_above_disabled_tools() {
        let mut value = defaults();
        for id in ["picker", "timer", "vote"] {
            let ids: Vec<_> = value["toolkit"]["visibleToolIds"].as_array().unwrap().iter().filter(|item| *item != id).cloned().collect();
            value = merge(value, "toolkit", json!({"visibleToolIds":ids})).unwrap();
            assert_eq!(value["toolkit"]["toolOrderIds"].as_array().unwrap().last().unwrap(), id);
        }
        value = merge(value, "toolkit", json!({"externalToolsEnabled":false})).unwrap();
        assert_eq!(value["toolkit"]["toolOrderIds"].as_array().unwrap().last().unwrap(), "external");
        value = merge(value, "toolkit", json!({"visibleToolIds":["noticeboard","seating","roster","timer"]})).unwrap();
        assert_eq!(&value["toolkit"]["toolOrderIds"].as_array().unwrap()[..4], &json!(["noticeboard","seating","roster","timer"]).as_array().unwrap()[..]);
        assert_eq!(normalized(Some(value.clone())).unwrap(), value);
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
    fn ui_font_is_validated_and_survives_reload() {
        // 예전 설정에는 글꼴이 없으므로 툴킷 기본 글꼴로 시작합니다(Tidy Task 글꼴을 따라가지 않음).
        let old = normalized(Some(json!({"schemaVersion":11,"toolkit":{}}))).unwrap();
        assert_eq!(old["toolkit"]["uiFontFamily"], "메이플스토리 L");
        let longest = "가".repeat(UI_FONT_NAME_MAX);
        for font in ["배달의민족 주아", "내가 등록한 글꼴", longest.as_str()] {
            let saved = merge(old.clone(), "toolkit", json!({"uiFontFamily":font})).unwrap();
            assert_eq!(normalized(Some(saved)).unwrap()["toolkit"]["uiFontFamily"], font);
        }
        let too_long = "가".repeat(UI_FONT_NAME_MAX + 1);
        for invalid in [json!(""), json!("   "), json!("줄\n바꿈"), json!(too_long), json!(3), Value::Null] {
            assert!(merge(old.clone(), "toolkit", json!({"uiFontFamily":invalid})).is_err());
            assert_eq!(
                normalized(Some(json!({"schemaVersion":11,"toolkit":{"uiFontFamily":invalid}}))).unwrap()["toolkit"]["uiFontFamily"],
                "메이플스토리 L"
            );
        }
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
    fn timer_sounds_default_to_the_previous_sound_and_only_known_ids_are_saved() {
        // 업데이트 전에 울리던 소리가 그대로 기본값이어야 사용자가 고르기 전에는 소리가 바뀌지 않습니다.
        let base = defaults();
        for (kind, tick, warning, end) in [
            ("digital", "clock-closeup", "double-beep", "winning-chimes"),
            ("analog", "small-tick", "buzzer", "clock-gong"),
            ("hourglass", "water-drop", "signal", "happy-bells"),
        ] {
            assert_eq!(base["preferences"][kind]["tickSound"], tick);
            assert_eq!(base["preferences"][kind]["warningSound"], warning);
            assert_eq!(base["preferences"][kind]["endSound"], end);
        }
        assert_eq!(base["preferences"]["stopwatch"], json!({"tickEnabled":true,"tickSound":"button-click"}));
        for list in [&TICK_SOUNDS[..], &WARNING_SOUNDS[..], &END_SOUNDS[..]] {
            let unique: std::collections::HashSet<_> = list.iter().collect();
            assert_eq!(unique.len(), list.len(), "소리 id가 중복되었습니다");
        }
        let chosen = merge(defaults(), "digital", json!({"tickSound":"grandfather-clock","warningSound":"time-signal","endSound":"singing-bowl"})).unwrap();
        let reloaded = normalized(Some(chosen)).unwrap();
        assert_eq!(reloaded["preferences"]["digital"]["tickSound"], "grandfather-clock");
        assert_eq!(reloaded["preferences"]["digital"]["warningSound"], "time-signal");
        assert_eq!(reloaded["preferences"]["digital"]["endSound"], "singing-bowl");
        assert_eq!(reloaded["preferences"]["analog"]["tickSound"], "small-tick");
        assert!(merge(defaults(), "stopwatch", json!({"tickSound":"metronome"})).is_ok());
        // 다른 역할의 id, 모르는 id, 문자열이 아닌 값, 스톱워치의 경고·종료음은 거부합니다.
        for (scope, patch) in [
            ("digital", json!({"tickSound":"time-signal"})),
            ("digital", json!({"warningSound":"cheer"})),
            ("digital", json!({"endSound":"unknown"})),
            ("analog", json!({"tickSound":1})),
            ("stopwatch", json!({"warningSound":"time-signal"})),
            ("stopwatch", json!({"endSound":"cheer"})),
        ] {
            assert!(merge(defaults(), scope, patch).is_err());
        }
        // 파일에 모르는 값이 있어도(다른 버전·손상) 읽기는 성공하고 기본 소리로 둡니다.
        let broken = normalized(Some(json!({"schemaVersion":12,"preferences":{"hourglass":{"endSound":"from-the-future","tickSound":"metronome"}}}))).unwrap();
        assert_eq!(broken["preferences"]["hourglass"]["endSound"], "happy-bells");
        assert_eq!(broken["preferences"]["hourglass"]["tickSound"], "metronome");
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
        assert!(is_work_window("dice"));
        assert!(is_work_window("clock"));
        for role in ["scoreboard-personal", "scoreboard-group", "scoreboard-custom", "thermometer", "vote", "vote-teacher"] {
            assert!(is_work_window(role), "{role}");
            assert!(is_tool_role(role), "{role}");
        }
        assert!(!is_work_window("scoreboard"));
        assert!(!is_work_window("toolkit-scoreboard-menu"));
        assert!(!is_work_window("toolkit-menu"));
        assert!(!is_work_window("toolkit-external-menu"));
        assert!(!is_work_window("toolkit-context-menu"));
    }
    #[test]
    fn notice_migration_preserves_hidden_existing_tools() {
        let value=normalized(Some(json!({"schemaVersion":2,"toolkit":{"visibleToolIds":[],"hiddenPlatformIds":["clanner"]}}))).unwrap();
        assert_eq!(value["toolkit"]["visibleToolIds"],json!(["noticeboard","picker","tournament","focus-bell","dice","clock","scoreboard","thermometer","vote","seating"]));
        assert_eq!(value["toolkit"]["hiddenPlatformIds"],json!(["clanner"]));
        let value=normalized(Some(json!({"schemaVersion":8,"toolkit":{"visibleToolIds":[]}}))).unwrap();
        assert_eq!(value["toolkit"]["visibleToolIds"],json!(["scoreboard","thermometer","vote","seating"]));
        let value=normalized(Some(json!({"schemaVersion":9,"toolkit":{"visibleToolIds":[]}}))).unwrap();
        assert_eq!(value["toolkit"]["visibleToolIds"],json!(["vote","seating"]));
        // 스키마 10에서 숨긴 투표는 다시 읽어도 되살아나지 않습니다.
        let value=normalized(Some(json!({"schemaVersion":11,"toolkit":{"visibleToolIds":[]}}))).unwrap();
        assert_eq!(value["toolkit"]["visibleToolIds"],json!([]));
    }
    #[test]
    fn focus_migration_preserves_hidden_tools_and_can_be_hidden() {
        let migrated = normalized(Some(json!({"schemaVersion":5,"toolkit":{"visibleToolIds":["roster"]}}))).unwrap();
        assert_eq!(migrated["toolkit"]["visibleToolIds"], json!(["roster","focus-bell","dice","clock","scoreboard","thermometer","vote","seating"]));
        let hidden = merge(migrated, "toolkit", json!({"visibleToolIds":["roster"]})).unwrap();
        assert_eq!(normalized(Some(hidden)).unwrap()["toolkit"]["visibleToolIds"], json!(["roster"]));
    }
    #[test]
    fn dice_migration_preserves_custom_visibility_and_all_tools_can_be_saved() {
        // 토너먼트를 숨긴 기존 선택은 이전 기본값으로 취급하지 않습니다.
        let existing = json!(["timer","picker","noticeboard","focus-bell","roster"]);
        let migrated = normalized(Some(json!({"schemaVersion":6,"toolkit":{"visibleToolIds":existing}}))).unwrap();
        assert_eq!(migrated["schemaVersion"], 12);
        assert_eq!(migrated["toolkit"]["visibleToolIds"], json!(["timer","picker","noticeboard","focus-bell","roster","dice","clock","scoreboard","thermometer","vote","seating"]));
        // 모든 도구를 켠 설정은 저장되고, 숨긴 주사위는 다시 읽어도 되살아나지 않습니다.
        let saved = merge(migrated.clone(), "toolkit", json!({"visibleToolIds":TOOL_IDS})).unwrap();
        assert_eq!(saved["toolkit"]["visibleToolIds"].as_array().unwrap().len(), 12);
        let hidden = merge(saved, "toolkit", json!({"visibleToolIds":["timer","roster"]})).unwrap();
        assert_eq!(normalized(Some(hidden)).unwrap()["toolkit"]["visibleToolIds"], json!(["timer","roster"]));
        assert!(merge(migrated, "toolkit", json!({"visibleToolIds":["timer","clock","picker","noticeboard","tournament","focus-bell","dice","roster","dice"]})).is_err());
        assert!(merge(defaults(), "toolkit", json!({"visibleToolIds":["scoreboard-personal"]})).is_err());
        assert!(normalized(Some(json!({"schemaVersion":13}))).is_err());
    }
    #[test]
    fn clock_migration_adds_once_and_preferences_are_validated() {
        // 스키마 7(주사위까지 있던 설정)에 시계가 한 번만 들어가고, 이후 숨김은 지켜집니다.
        let migrated = normalized(Some(json!({"schemaVersion":7,"toolkit":{"visibleToolIds":["timer","dice"]}}))).unwrap();
        assert_eq!(migrated["toolkit"]["visibleToolIds"], json!(["timer","dice","clock","scoreboard","thermometer","vote","seating"]));
        assert_eq!(migrated["preferences"]["clock"]["standardTimeSync"], json!(true));
        let hidden = merge(migrated, "toolkit", json!({"visibleToolIds":["timer","dice"]})).unwrap();
        assert_eq!(normalized(Some(hidden.clone())).unwrap()["toolkit"]["visibleToolIds"], json!(["timer","dice"]));
        // 설정 저장·다시 읽기
        let saved = merge(hidden, "clock", json!({"face":"analog","hour12":false,"title":"3학년 2반 ⏰","analogMinuteNumbers":true})).unwrap();
        let reloaded = normalized(Some(saved)).unwrap();
        assert_eq!(reloaded["preferences"]["clock"]["face"], "analog");
        assert_eq!(reloaded["preferences"]["clock"]["hour12"], false);
        assert_eq!(reloaded["preferences"]["clock"]["title"], "3학년 2반 ⏰");
        assert_eq!(reloaded["preferences"]["digital"]["tickEnabled"], true);
        // 제목 30자(코드포인트) 경계, 제어 문자, 알 수 없는 항목
        let thirty: String = "가".repeat(30);
        assert!(merge(defaults(), "clock", json!({"title":thirty})).is_ok());
        assert!(merge(defaults(), "clock", json!({"title":format!("{thirty}나")})).is_err());
        assert!(merge(defaults(), "clock", json!({"title":"줄\n바꿈"})).is_err());
        assert!(merge(defaults(), "clock", json!({"face":"sundial"})).is_err());
        assert!(merge(defaults(), "clock", json!({"offsetMs":2600})).is_err());
        // 파일에 잘못 들어간 값은 기본값으로 읽습니다(원본은 그대로).
        let broken = normalized(Some(json!({"schemaVersion":8,"preferences":{"clock":{"face":7,"showSeconds":false}}}))).unwrap();
        assert_eq!(broken["preferences"]["clock"]["face"], "digital");
        assert_eq!(broken["preferences"]["clock"]["showSeconds"], false);
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
        for role in ["digital", "analog", "hourglass", "stopwatch", "focus-bell", "dice", "clock", "tournament", "picker", "roster", "noticeboard", "scoreboard-personal", "scoreboard-group", "scoreboard-custom", "thermometer", "vote"] {
            let rule = work_window_size(role).unwrap();
            let (w, h) = initial_work_size(&rule, 1920.0, 1032.0);
            assert!(w > rule.base.0 && h >= rule.base.1, "{role}: {w}×{h}");
        }
    }
    #[test]
    fn vote_board_opens_wide_and_teacher_window_stays_small() {
        let board = work_window_size("vote").unwrap();
        // 1920×1080: 넓은 도구 규칙(82%×88%). 후보 9명이 3×3으로 들어가는 최소 크기는 760×560입니다.
        assert_eq!(initial_work_size(&board, 1920.0, 1032.0), (1574.0, 908.0));
        assert_eq!(board.min, (760.0, 560.0));
        // 선생님 창은 화면이 커도 440×760, 작업 영역이 낮으면 그 안(여백 16×2 제외)으로 줄어듭니다.
        let teacher = work_window_size("vote-teacher").unwrap();
        assert_eq!(initial_work_size(&teacher, 3840.0, 2112.0), (440.0, 760.0));
        assert_eq!(initial_work_size(&teacher, 1366.0, 728.0), (440.0, 696.0));
    }
    #[test]
    fn thermometer_opens_tall_and_wider_for_two() {
        // 1920×1080: 온도계 1개는 세로형(46%), 2개는 나란히 들어가게 74%로 엽니다.
        let one = work_window_size("thermometer").unwrap();
        assert_eq!(initial_work_size(&one, 1920.0, 1032.0), (883.0, 888.0));
        assert_eq!(initial_work_size(&thermometer_pair_size(), 1920.0, 1032.0), (1421.0, 888.0));
        // 1440×888 창 기준 점수판 6모둠·30명 검수 크기가 나오는지(개인 점수판 최소 폭 720)
        let personal = work_window_size("scoreboard-personal").unwrap();
        assert_eq!(personal.min, (720.0, 520.0));
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
