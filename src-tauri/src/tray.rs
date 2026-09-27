//! 트레이 아이콘 메뉴와 "요청 전달 보증" 장치.
//!
//! 왜 별도 모듈로 뺐는가:
//!   예전에는 트레이가 요청을 모든 창에 방송하고, 메모 창 중 "매니저" 하나가 그것을 처리했습니다.
//!   그래서 메모 창을 모두 닫고 툴킷·급식 창만 띄워 둔 상태(앱은 계속 살아 있습니다)에서는
//!   매니저가 아예 없어 "새 Tidy Task / 새 Tiny Note / 좌표 초기화"가 아무 반응도 하지 않았습니다.
//!   매니저 승계가 한 박자 늦는 순간(창이 막 뜨는 중)에도 같은 증상이 났습니다.
//!
//! 지금의 규칙:
//!   ① Rust가 "지금 열려 있는 창" 중 처리할 창을 직접 지명해서 보냅니다. (매니저 여부와 무관)
//!   ② 지명한 창이 정해진 시간 안에 "받았다"고 답하지 않으면 다음 후보 창으로 넘깁니다.
//!   ③ 받을 창이 하나도 없으면 main 창을 띄우고, 그 창이 준비되면 맡아 둔 요청을 이어받습니다.
//!   ④ 좌표 초기화는 창(JS)에 부탁하지 않고 Rust가 직접 모든 창을 옮깁니다.

use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

use crate::{ensure_window_on_screen, show_or_create_main};

// 지명한 창이 "받았다"고 답할 때까지 기다리는 시간. 넘기면 다음 후보로 넘어갑니다.
// 왜 이 정도인가: 창이 막 뜨는 중이라면 리스너 등록까지 수백 ms가 걸리고,
//   너무 짧으면 멀쩡한 창을 건너뛰어 창이 두 개 열립니다.
const ACK_TIMEOUT: Duration = Duration::from_millis(1200);
// 맡아 둔 요청의 유효 시간. 한참 뒤에 뜬 창이 잊힌 요청을 실행하지 않도록 합니다.
// 왜 이 정도인가: 막 뜨는 중인 창의 화면(JS)이 준비되는 데 길어야 2~3초입니다.
const PENDING_TTL: Duration = Duration::from_secs(10);
// 창 종류별 최대 개수 — JS windows/windowLabels.js의 MAX_WINDOWS_PER_KIND와 같은 값입니다.
const MAX_SLOT: u32 = 10;
// 좌표 초기화의 첫 여백과 창 간격(논리 px) — 5.1.2까지 JS가 쓰던 값 그대로입니다.
const CASCADE_MARGIN: f64 = 100.0;
const CASCADE_STEP: f64 = 30.0;
// 버튼 옆에 붙어 뜨는 임시 창은 좌표 초기화 대상이 아닙니다 (열릴 때마다 스스로 위치를 잡습니다).
// 왜 꼭 빼야 하는가: 좌표 초기화는 대상 창마다 show()를 부릅니다. 숨어 상주하는 날짜 선택 창(date-picker)이
//   여기 빠지면 빈 투명 창이 떠서 그 자리의 클릭을 가로챕니다. (JS datePicker/protocol.js의 DATE_PICKER_LABEL)
const TRANSIENT_LABELS: [&str; 7] = [
    "ctx-menu",
    "reminder",
    "toolkit-menu",
    "toolkit-scoreboard-menu",
    "toolkit-external-menu",
    "toolkit-context-menu",
    "date-picker",
];

/// 창(JS)이 대신 처리해 주어야 하는 트레이 요청.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Request {
    NewNote,
    NewTinyNote,
}

impl Request {
    // JS(appState._runTrayRequest)가 알아듣는 이름
    fn name(self) -> &'static str {
        match self {
            Request::NewNote => "new-note",
            Request::NewTinyNote => "new-tiny-note",
        }
    }
}

struct Pending {
    id: u64,
    request: Request,
    created: Instant,
    // 아직 지명하지 않은 후보 창 (앞 창이 답하지 않으면 순서대로 넘깁니다)
    remaining: Vec<String>,
    // true = "처리할 창이 없어 맡아 둔 상태". 이때만 새로 뜬 창이 가져갈 수 있습니다.
    // 왜 필요한가: 이 구분이 없으면 지명받은 창이 처리하는 사이에 다른 창이 같은 요청을
    //   가져가 창이 두 개 열립니다.
    claimable: bool,
}

static PENDING: Mutex<Option<Pending>> = Mutex::new(None);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// 창 라벨의 우선순위 — JS windows/managerElection.js의 MANAGER_PRIORITY와 같은 순서입니다.
/// main(0) → note-1..10(1..10) → tinynote-1..10(101..110), 데이터 창이 아니면 None.
pub fn data_window_rank(label: &str) -> Option<u32> {
    if label == "main" {
        return Some(0);
    }
    let slot = |prefix: &str, base: u32| {
        label
            .strip_prefix(prefix)
            .and_then(|number| number.parse::<u32>().ok())
            .filter(|number| (1..=MAX_SLOT).contains(number))
            .map(|number| base + number)
    };
    slot("note-", 0).or_else(|| slot("tinynote-", 100))
}

/// 할 일·메모 데이터를 가진 창인지 (main / note-N / tinynote-N)
pub fn is_data_window(label: &str) -> bool {
    data_window_rank(label).is_some()
}

// 지금 열려 있는 데이터 창을 우선순위 순으로 돌려줍니다.
fn open_data_windows(app: &tauri::AppHandle) -> Vec<String> {
    let mut found: Vec<(u32, String)> = app
        .webview_windows()
        .keys()
        .filter_map(|label| data_window_rank(label).map(|rank| (rank, label.clone())))
        .collect();
    found.sort();
    found.into_iter().map(|(_, label)| label).collect()
}

// 요청을 창 하나에 지명해서 보냅니다.
// 왜 방송(emit)으로 보내고 창이 target을 확인하는가: emit_to는 받는 쪽이 listen에 target을
//   지정해야만 닿습니다. 한 곳이라도 빠뜨리면 요청이 조용히 사라지므로, 전달은 확실한 방송으로
//   하고 "누가 처리할지"는 payload의 target으로 정합니다.
fn deliver(app: &tauri::AppHandle, id: u64, request: Request, host: &str) {
    let _ = app.emit(
        "tray-request",
        serde_json::json!({ "id": id, "kind": request.name(), "target": host }),
    );
}

// ACK_TIMEOUT 동안 응답이 없으면 다음 수단으로 넘어갑니다.
fn watch(app: &tauri::AppHandle, id: u64) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(ACK_TIMEOUT);
        if pending_id() == Some(id) {
            escalate(&app, id);
        }
    });
}

fn pending_id() -> Option<u64> {
    PENDING.lock().ok()?.as_ref().map(|pending| pending.id)
}

fn clear_pending(id: u64) {
    if let Ok(mut slot) = PENDING.lock() {
        if slot.as_ref().is_some_and(|pending| pending.id == id) {
            *slot = None;
        }
    }
}

// 요청을 "맡아 둔 상태"로 바꿉니다. 이때부터 새로 준비된 창이 가져갈 수 있습니다.
fn mark_claimable(id: u64) {
    if let Ok(mut slot) = PENDING.lock() {
        if let Some(pending) = slot.as_mut().filter(|pending| pending.id == id) {
            pending.claimable = true;
        }
    }
}

/// 트레이 메뉴가 누른 요청을 처리할 창을 찾아 보냅니다.
pub fn dispatch(app: &tauri::AppHandle, request: Request) {
    let mut hosts = open_data_windows(app);
    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    let first = if hosts.is_empty() {
        None
    } else {
        Some(hosts.remove(0))
    };
    if let Ok(mut slot) = PENDING.lock() {
        *slot = Some(Pending {
            id,
            request,
            created: Instant::now(),
            remaining: hosts,
            claimable: false,
        });
    }
    match first {
        Some(host) => {
            deliver(app, id, request, &host);
            watch(app, id);
        }
        // 데이터 창이 하나도 없으면 기다릴 이유가 없습니다. 곧바로 다음 수단으로 갑니다.
        None => escalate(app, id),
    }
}

// 지명한 창이 응답하지 않았을 때(또는 애초에 후보가 없을 때) 쓰는 다음 수단.
fn escalate(app: &tauri::AppHandle, id: u64) {
    let (next_host, request) = {
        let Ok(mut slot) = PENDING.lock() else { return };
        // 이미 처리된 요청이면 아무것도 하지 않습니다.
        let Some(pending) = slot.as_mut().filter(|pending| pending.id == id) else {
            return;
        };
        let next = if pending.remaining.is_empty() {
            None
        } else {
            Some(pending.remaining.remove(0))
        };
        (next, pending.request)
    };

    // ① 아직 지명하지 않은 창이 남아 있으면 그 창에 넘깁니다.
    if let Some(host) = next_host {
        log::warn!("[{host}] 창이 트레이 요청에 응답하지 않아 다음 창으로 넘깁니다.");
        deliver(app, id, request, &host);
        watch(app, id);
        return;
    }

    // ② 답한 창이 없습니다. 창이 아직 뜨는 중이라 화면(JS)이 준비되지 않았을 수도 있으므로,
    //    요청을 맡아 두고 준비되는 창이 tray_take_pending_request로 가져가게 합니다.
    //    (맡아 둔 요청은 PENDING_TTL이 지나면 버려지므로 한참 뒤에 되살아나지 않습니다)
    let main_missing = app.get_webview_window("main").is_none();
    if main_missing && request == Request::NewNote {
        // "새 Tidy Task"는 main 창이 열리는 것 자체로 요청이 이루어집니다.
        clear_pending(id);
    } else {
        mark_claimable(id);
        log::warn!(
            "트레이 요청({})에 답한 창이 없어 맡아 둡니다. 준비되는 창이 이어받습니다.",
            request.name()
        );
    }
    if main_missing {
        show_or_create_main(app);
    }
}

/// 지명받은 창이 "제가 처리하겠습니다"라고 답합니다. (감시 타이머가 다음 창으로 넘기지 않게)
#[tauri::command]
pub fn tray_request_done(id: u64) {
    clear_pending(id);
}

/// 받을 창이 없어 맡아 둔 요청을, 새로 준비된 창이 가져갑니다. (없으면 null)
#[tauri::command]
pub fn tray_take_pending_request() -> Option<String> {
    let mut slot = PENDING.lock().ok()?;
    if !slot.as_ref().is_some_and(|pending| pending.claimable) {
        return None;
    }
    let pending = slot.take()?;
    if pending.created.elapsed() > PENDING_TTL {
        return None;
    }
    Some(pending.request.name().to_string())
}

/// 좌표 초기화 — 열려 있는 창을 주 모니터 작업영역 왼쪽 위부터 계단식으로 모읍니다.
///
/// 왜 Rust가 직접 하는가: 예전에는 매니저(메모 창)만 이 요청을 처리해서 메모 창을 모두 닫으면
///   눌러도 아무 일이 없었고, 툴킷·급식 창은 애초에 대상이 아니라 화면 밖으로 사라지면
///   되돌릴 방법이 없었습니다.
/// 새 위치의 저장은 각 창의 "창 이동" 처리기가 스스로 합니다.
///   (열려 있는 창의 데이터를 밖에서 고치면 그 창이 막 입력한 내용과 경합합니다)
pub fn reset_coordinates(app: &tauri::AppHandle) {
    let Some((origin_x, origin_y, scale)) = primary_work_origin(app) else {
        log::warn!("주 모니터를 찾지 못해 좌표 초기화를 건너뜁니다.");
        return;
    };
    let mut labels: Vec<String> = app
        .webview_windows()
        .keys()
        .filter(|label| !TRANSIENT_LABELS.contains(&label.as_str()))
        .cloned()
        .collect();
    labels.sort_by(|a, b| cascade_key(a).cmp(&cascade_key(b)));

    for (index, label) in labels.iter().enumerate() {
        let Some(window) = app.get_webview_window(label) else {
            continue;
        };
        let offset = cascade_offset(index, scale);
        // 최소화 상태에서는 좌표를 옮겨도 화면에 나타나지 않으므로 먼저 복원합니다.
        let _ = window.unminimize();
        let _ = window.set_position(tauri::PhysicalPosition::new(
            origin_x + offset,
            origin_y + offset,
        ));
        let _ = window.show();
    }
    // 맨 앞(보통 main) 창에 포커스를 줘서 "무슨 일이 일어났는지" 바로 보이게 합니다.
    if let Some(window) = labels.first().and_then(|label| app.get_webview_window(label)) {
        let _ = window.set_focus();
    }
}

// 계단식 배치 순서: 데이터 창(main → note-N → tinynote-N)이 먼저, 나머지는 라벨 순.
fn cascade_key(label: &str) -> (u32, &str) {
    (data_window_rank(label).unwrap_or(u32::MAX), label)
}

// index번째 창을 작업영역 왼쪽 위에서 얼마나 띄울지 (물리 px)
fn cascade_offset(index: usize, scale: f64) -> i32 {
    ((CASCADE_MARGIN + index as f64 * CASCADE_STEP) * scale).round() as i32
}

// 주 모니터 작업영역(작업 표시줄 제외)의 왼쪽 위 좌표와 배율.
fn primary_work_origin(app: &tauri::AppHandle) -> Option<(i32, i32, f64)> {
    let monitor = app
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| app.available_monitors().ok().and_then(|list| list.into_iter().next()))?;
    let area = monitor.work_area();
    Some((area.position.x, area.position.y, monitor.scale_factor()))
}

// 급식 창 열기 — 이미 떠 있으면 앞으로 가져오고, 없으면 새로 만듭니다.
fn open_meal(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("meal") {
        let _ = window.unminimize();
        ensure_window_on_screen(&window);
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    // 메모 창이 없어도 열리며, 화면에서 급식 전용 저장소의 위치를 복원합니다.
    let _ = tauri::WebviewWindowBuilder::new(app, "meal", tauri::WebviewUrl::App("index.html".into()))
        .title("오늘의 급식")
        .inner_size(320.0, 460.0)
        .min_inner_size(180.0, 120.0)
        // Windows의 undecorated shadow가 투명 모서리에 만드는 1px 흰 테두리를 제거합니다.
        // 창 내부의 MealFrame이 자체 보더와 둥근 모서리를 그립니다.
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(true)
        .visible(false)
        .build();
}

fn on_menu(app: &tauri::AppHandle, id: &str) {
    match id {
        "open" => show_or_create_main(app),
        "meal" => open_meal(app),
        "toolkit" => crate::toolkit::open_from_tray(app),
        // 아래 세 가지는 "처리할 창"이 필요하므로 전달 보증 장치를 거칩니다.
        "new_main" => dispatch(app, Request::NewNote),
        "new_tiny" => dispatch(app, Request::NewTinyNote),
        "reset_coord" => reset_coordinates(app),
        "quit" => {
            if !crate::noticeboard_quit::request(app) {
                crate::classroom::request_quit(app);
            }
        }
        _ => (),
    }
}

/// 트레이 아이콘과 메뉴를 만듭니다. (setup에서 한 번)
pub fn install(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{TrayIconBuilder, TrayIconEvent};

    let open_i = MenuItem::with_id(app, "open", "열기 (Open)", true, None::<&str>)?;
    let meal_i = MenuItem::with_id(app, "meal", "급식창 열기", true, None::<&str>)?;
    let toolkit_i = MenuItem::with_id(app, "toolkit", "Tidy 툴킷 열기", true, None::<&str>)?;
    let new_main_i = MenuItem::with_id(app, "new_main", "새 Tidy Task", true, None::<&str>)?;
    let new_tiny_i = MenuItem::with_id(app, "new_tiny", "새 Tiny Note", true, None::<&str>)?;
    let reset_coord_i = MenuItem::with_id(app, "reset_coord", "좌표 초기화", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "종료 (Quit)", true, None::<&str>)?;
    // 여는 메뉴 / 새로 만드는 메뉴 / 복구 / 종료를 구분선으로 나눕니다.
    let menu = Menu::with_items(
        app,
        &[
            &open_i,
            &meal_i,
            &toolkit_i,
            &PredefinedMenuItem::separator(app)?,
            &new_main_i,
            &new_tiny_i,
            &PredefinedMenuItem::separator(app)?,
            &reset_coord_i,
            &PredefinedMenuItem::separator(app)?,
            &quit_i,
        ],
    )?;

    let mut builder = TrayIconBuilder::new().menu(&menu).tooltip("Tidy Task");
    // 아이콘을 읽지 못해도 트레이 메뉴 자체는 살아 있어야 합니다 (예전 코드의 unwrap 제거).
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder
        .on_menu_event(|app, event| on_menu(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick { .. } = event {
                show_or_create_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_windows_rank_like_the_js_manager_priority() {
        assert_eq!(data_window_rank("main"), Some(0));
        assert_eq!(data_window_rank("note-1"), Some(1));
        assert_eq!(data_window_rank("note-10"), Some(10));
        assert_eq!(data_window_rank("tinynote-1"), Some(101));
        assert_eq!(data_window_rank("tinynote-10"), Some(110));
        // main → note → tinynote 순서가 유지되어야 합니다.
        assert!(data_window_rank("main") < data_window_rank("note-1"));
        assert!(data_window_rank("note-10") < data_window_rank("tinynote-1"));
    }

    #[test]
    fn helper_windows_are_not_hosts() {
        for label in [
            "settings",
            "reminder",
            "archive",
            "toolkit",
            "meal",
            "timer-analog-3",
            "note-0",
            "note-11",
            "note-x",
            "tinynote-",
        ] {
            assert!(!is_data_window(label), "{label}");
        }
    }

    #[test]
    fn cascade_sorts_data_windows_first_then_by_label() {
        let mut labels = vec!["toolkit", "tinynote-2", "main", "picker", "note-3"];
        labels.sort_by(|a, b| cascade_key(a).cmp(&cascade_key(b)));
        assert_eq!(labels, ["main", "note-3", "tinynote-2", "picker", "toolkit"]);
    }

    // 맡아 둔 요청은 "받을 창이 없다"고 판정된 뒤에만 넘겨줍니다.
    // 왜 중요한가: 지명받은 창이 처리하는 사이에 다른 창이 같은 요청을 가져가면 창이 두 개 열립니다.
    #[test]
    fn pending_request_is_handed_over_only_once_and_only_when_claimable() {
        let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
        *PENDING.lock().unwrap() = Some(Pending {
            id,
            request: Request::NewTinyNote,
            created: Instant::now(),
            remaining: vec!["note-2".into()],
            claimable: false,
        });

        // 아직 지명한 창이 처리 중이므로 아무도 가져갈 수 없습니다.
        assert_eq!(tray_take_pending_request(), None);
        // 엉뚱한 번호로는 지워지지 않습니다.
        clear_pending(id + 1000);
        assert_eq!(pending_id(), Some(id));

        mark_claimable(id);
        assert_eq!(tray_take_pending_request().as_deref(), Some("new-tiny-note"));
        // 한 번 넘겨준 요청은 사라집니다.
        assert_eq!(tray_take_pending_request(), None);
        assert_eq!(pending_id(), None);

        // 오래 묵은 요청은 넘겨주지 않고 버립니다.
        let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
        let long_ago = Instant::now()
            .checked_sub(PENDING_TTL + Duration::from_secs(1))
            .unwrap_or_else(Instant::now);
        *PENDING.lock().unwrap() = Some(Pending {
            id,
            request: Request::NewNote,
            created: long_ago,
            remaining: Vec::new(),
            claimable: true,
        });
        assert_eq!(tray_take_pending_request(), None);
        assert_eq!(pending_id(), None);
    }

    // 숨어 상주하는 팝업 창은 좌표 초기화(show)에 끌려 나오면 안 되고, 데이터 창도 아닙니다.
    #[test]
    fn hidden_popup_windows_are_transient_not_data() {
        for label in ["ctx-menu", "date-picker"] {
            assert!(TRANSIENT_LABELS.contains(&label), "{label}");
            assert!(!is_data_window(label), "{label}");
        }
    }

    #[test]
    fn cascade_steps_scale_with_the_monitor() {
        assert_eq!(cascade_offset(0, 1.0), 100);
        assert_eq!(cascade_offset(3, 1.0), 190);
        // 4K 200% 모니터에서는 같은 간격이 물리 픽셀로 두 배가 됩니다.
        assert_eq!(cascade_offset(0, 2.0), 200);
        assert_eq!(cascade_offset(3, 2.0), 380);
    }
}
