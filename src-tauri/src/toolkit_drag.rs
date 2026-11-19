//! Tidy 툴킷 툴바 · D-Day 위젯 공용 네이티브 드래그 엔진.
//!
//! 왜 기본 `win.startDragging()` 대신 직접 커서 추적을 쓰는가:
//! 1. 클릭과 끌기를 구분하기 위해 임계값(px)을 넘긴 뒤에야 드래그를 시작해야 합니다.
//! 2. 기존 경로는 임계값 + 좌표 IPC + `wry`의 `WM_ENTERSIZEMOVE` 동기 `MoveFocus`(20~60ms) 동안
//!    창이 제자리에 멈춰, 빠른 끌기 누락·커서 뒤처짐·초점 없는 위젯 미포착 문제를 일으킵니다.
//! 3. Windows 마우스 드래그는 `DwmFlush` 프레임 시계 + 메인 스레드 FIFO `GetCursorPos()`/`SetWindowPos()`로
//!    `WM_ENTERSIZEMOVE` `MoveFocus` 지연과 `WM_MOVING` 중복 COM 호출을 우회해 정지 0px·이동 ≤1프레임 추적을 보장합니다.
//! 4. 교실 전자칠판(터치/펜, `WM_POINTER`)은 DOM 포인터 캡처를 유지한 채 `toolkit_move_drag`/`toolkit_end_drag`로
//!    같은 좌표·혼합 DPI 히스테리시스 엔진을 공유합니다.

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

/// 드래그 중 숨길 툴킷 메뉴 목록은 `toolkit::MENU_LABELS` 단일 원천을 공유합니다.
use crate::toolkit::MENU_LABELS;

/// 직접 추적 네이티브 드래그를 허용하는 위성 창 라벨 목록.
const DRAGGABLE_WINDOW_LABELS: &[&str] = &["toolkit", "dday"];
/// D-Day 위젯 드래그 시 닫을 독립 설정 팝업 라벨 목록.
const DDAY_MENU_LABELS: &[&str] = &["dday-widget-menu"];

pub(crate) fn is_draggable_window_label(label: &str) -> bool {
    DRAGGABLE_WINDOW_LABELS.contains(&label)
}

pub(crate) fn menu_labels_for_window(label: &str) -> &'static [&'static str] {
    match label {
        "toolkit" => &MENU_LABELS,
        "dday" => DDAY_MENU_LABELS,
        _ => &[],
    }
}

/// 드래그 세션 세대 번호. 새 드래그가 시작되거나 외부 취소가 오면 증가해 이전 워커/클로저를 즉시 무효화합니다.
static ACTIVE_GEN: AtomicU64 = AtomicU64::new(0);
static ACTIVE_SESSION: Mutex<Option<Arc<Mutex<DragSession>>>> = Mutex::new(None);

/// 터치/펜(JS 종료 신호 기반) 드래그에서 `pointerup`이 유실될 때를 대비한 무입력 타임아웃.
const JS_END_HEARTBEAT_TIMEOUT: Duration = Duration::from_millis(1500);
/// 진단 로그 파일 최대 크기(1MB). 넘으면 `.prev.jsonl`로 1회 회전합니다.
const DIAG_LOG_MAX_BYTES: u64 = 1024 * 1024;
/// 드래그 1회당 진단 샘플 상한(메모리 보호).
const DIAG_SAMPLE_LIMIT: usize = 60;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Phase {
    Tracking,
    Ended,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct MonitorRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub scale: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PhysRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartDragArgs {
    /// JS가 `invoke` 직전에 동기로 발급한 단조 증가 토큰(이벤트-응답 도착 순서 역전 방지).
    pub token: u64,
    /// `pointerdown` 시점의 `e.clientX` (CSS 논리 px).
    pub grab_x: f64,
    /// `pointerdown` 시점의 `e.clientY` (CSS 논리 px).
    pub grab_y: f64,
    /// `pointerdown` 시점의 `window.devicePixelRatio`.
    pub dpr: f64,
    /// `"mouse" | "touch" | "pen"`.
    pub pointer_type: String,
    /// 터치/펜 `toolkit_move_drag` 델타 계산용 시작·현재 화면 좌표(`e.screenX`, `e.screenY`).
    #[serde(default)]
    pub start_screen_x: Option<f64>,
    #[serde(default)]
    pub start_screen_y: Option<f64>,
    #[serde(default)]
    pub cur_screen_x: Option<f64>,
    #[serde(default)]
    pub cur_screen_y: Option<f64>,
    /// 진단용: `pointerdown`에서 임계값 통과까지 걸린 ms와 이동 거리(px).
    #[serde(default)]
    pub down_to_threshold_ms: Option<f64>,
    #[serde(default)]
    pub threshold_dist_px: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveDragArgs {
    pub token: u64,
    pub screen_x: f64,
    pub screen_y: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndDragArgs {
    pub token: u64,
    #[serde(default)]
    pub cancelled: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FinalGeometry {
    pub physical_x: i32,
    pub physical_y: i32,
    pub outer_width: u32,
    pub outer_height: u32,
    pub scale_factor: f64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DragStartResult {
    pub token: u64,
    /// `"direct"` | `"direct-js-end"` | `"quick-release"` | `"os-fallback"`
    pub mode: &'static str,
    pub moved: bool,
    /// `quick-release`일 때는 이벤트 없이 이 응답만으로 즉시 저장·종료합니다(C1 레이스 차단).
    pub geometry: Option<FinalGeometry>,
    pub initial_lag_px: f64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DragEndPayload {
    pub token: u64,
    pub moved: bool,
    pub cancelled: bool,
    /// `"released"` | `"escape"` | `"cancelled"` | `"timeout"` | `"error"`
    pub reason: &'static str,
    pub geometry: Option<FinalGeometry>,
    pub duration_ms: u64,
    pub frames: u32,
    pub max_lag_px: f64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct DiagSample {
    at_ms: u64,
    req_x: i32,
    req_y: i32,
    actual_x: i32,
    actual_y: i32,
    actual_w: u32,
    actual_h: u32,
    scale: f64,
    lag_px: f64,
}

struct DragSession {
    gen: u64,
    token: u64,
    window_label: String,
    phase: Phase,
    mode: &'static str,
    pointer_type: String,
    origin: (i32, i32),
    origin_scale: f64,
    initial_grab_phys: (f64, f64),
    start_scale: f64,
    start_dpr: f64,
    start_screen: Option<(f64, f64)>,
    monitors: Vec<MonitorRect>,
    last_applied_cursor: Option<(i32, i32)>,
    last_applied_pos: (i32, i32),
    started_at: Instant,
    last_activity_at: Instant,
    frames: u32,
    dpi_transitions: u32,
    initial_lag_px: f64,
    max_lag_px: f64,
    down_to_threshold_ms: Option<f64>,
    threshold_dist_px: Option<f64>,
    vk_primary_down_at_start: bool,
    gui_in_movesize_seen: bool,
    rect_mismatch_count: u32,
    diag_samples: Vec<DiagSample>,
}

/// 진단 계측 활성 여부. 프로덕션 릴리스에서는 기본 꺼짐이며 `TIDY_DRAG_DIAG=1`로만 켤 수 있습니다.
pub(crate) fn diag_enabled() -> bool {
    cfg!(debug_assertions)
        || std::env::var("TIDY_DRAG_DIAG")
            .ok()
            .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"))
}

#[tauri::command]
pub fn toolkit_drag_diag_enabled() -> bool {
    diag_enabled()
}

// ============================================================================
// 순수 좌표 계산 및 혼합 DPI 경계 핑퐁 방지 (플랫폼 무관 — `cargo test` 대상)
// ============================================================================

/// 시작 시점 창 내부 잡기 위치(CSS px)를 물리 픽셀 오프셋으로 변환합니다.
/// 웹뷰 확대(`dpr != scale_factor`)와 `inner - outer` 프레임 차이를 반영하고 창 범위 안으로 제한합니다.
pub(crate) fn compute_grab_phys(
    grab_x: f64,
    grab_y: f64,
    dpr: f64,
    start_scale: f64,
    client_inset: (i32, i32),
    win_size_phys: (u32, u32),
) -> (f64, f64) {
    let safe_scale = if start_scale.is_finite() && start_scale > 0.0 {
        start_scale
    } else {
        1.0
    };
    let safe_dpr = if dpr.is_finite() && dpr > 0.0 {
        dpr
    } else {
        safe_scale
    };
    let max_x = (win_size_phys.0 as f64 - 1.0).max(0.0);
    let max_y = (win_size_phys.1 as f64 - 1.0).max(0.0);
    let gx = if grab_x.is_finite() {
        grab_x * safe_dpr + client_inset.0 as f64
    } else {
        max_x / 2.0
    };
    let gy = if grab_y.is_finite() {
        grab_y * safe_dpr + client_inset.1 as f64
    } else {
        max_y / 2.0
    };
    (gx.clamp(0.0, max_x), gy.clamp(0.0, max_y))
}

/// 현재 배율(`cur_scale`)에서 잡은 지점이 정확히 `cursor_phys` 아래에 놓이는 목표 창 좌상단(물리 px)을 계산합니다.
pub(crate) fn compute_target_position(
    cursor_phys: (i32, i32),
    initial_grab_phys: (f64, f64),
    start_scale: f64,
    cur_scale: f64,
    win_size_phys: (u32, u32),
) -> (i32, i32) {
    let safe_start = if start_scale.is_finite() && start_scale > 0.0 {
        start_scale
    } else {
        1.0
    };
    let safe_cur = if cur_scale.is_finite() && cur_scale > 0.0 {
        cur_scale
    } else {
        safe_start
    };
    let ratio = safe_cur / safe_start;
    let max_x = (win_size_phys.0 as f64 - 1.0).max(0.0);
    let max_y = (win_size_phys.1 as f64 - 1.0).max(0.0);
    let off_x = (initial_grab_phys.0 * ratio).clamp(0.0, max_x).round() as i32;
    let off_y = (initial_grab_phys.1 * ratio).clamp(0.0, max_y).round() as i32;
    (cursor_phys.0 - off_x, cursor_phys.1 - off_y)
}

fn overlap_area(rect: PhysRect, mon: MonitorRect) -> i64 {
    let x1 = (rect.x as i64).max(mon.x as i64);
    let y1 = (rect.y as i64).max(mon.y as i64);
    let x2 = (rect.x as i64 + rect.width as i64).min(mon.x as i64 + mon.width as i64);
    let y2 = (rect.y as i64 + rect.height as i64).min(mon.y as i64 + mon.height as i64);
    (x2 - x1).max(0) * (y2 - y1).max(0)
}

/// 창 사각형과 겹치는 면적이 가장 큰 모니터 인덱스를 반환합니다(동률 시 `prefer` 우선).
pub(crate) fn majority_monitor(
    rect: PhysRect,
    monitors: &[MonitorRect],
    prefer: Option<usize>,
) -> Option<usize> {
    let mut best_idx = None;
    let mut best_area = 0i64;
    for (idx, mon) in monitors.iter().enumerate() {
        let area = overlap_area(rect, *mon);
        if area <= 0 {
            continue;
        }
        let better = area > best_area || (area == best_area && prefer == Some(idx));
        if better {
            best_area = area;
            best_idx = Some(idx);
        }
    }
    best_idx
}

/// 창 사각형이 `cur_idx`의 엄격 과반(`overlap(cur) > overlap(other)`)을 잃었는지 판정합니다.
/// 왜 동률(`==`)도 이탈 위험으로 보는가: Windows `MonitorFromRect`는 정확히 50:50 동률일 때 어느 쪽 모니터를
/// 고를지 보장하지 않으므로, 동률 경계(1px)도 잠재적 전환으로 취급해야 1px 경계 핑퐁을 완전히 막을 수 있습니다.
fn threatening_other_monitor(
    rect: PhysRect,
    monitors: &[MonitorRect],
    cur_idx: usize,
) -> Option<usize> {
    let cur_area = overlap_area(rect, monitors[cur_idx]);
    let mut best_other = None;
    let mut best_area = cur_area;
    for (idx, mon) in monitors.iter().enumerate() {
        if idx == cur_idx {
            continue;
        }
        let area = overlap_area(rect, *mon);
        if area > 0 && area >= best_area {
            best_area = area;
            best_other = Some(idx);
        }
    }
    best_other
}

/// 창 사각형이 `target_idx`에서 엄격 과반(`overlap(target) > overlap(any other)`)인지 확인합니다.
fn has_strict_majority(rect: PhysRect, monitors: &[MonitorRect], target_idx: usize) -> bool {
    let target_area = overlap_area(rect, monitors[target_idx]);
    if target_area <= 0 {
        return false;
    }
    monitors
        .iter()
        .enumerate()
        .all(|(idx, mon)| idx == target_idx || overlap_area(rect, *mon) < target_area)
}

/// 혼합 DPI(예: 4K 200% ↔ FHD 100%) 경계 횡단 시 `WM_DPICHANGED` 핑퐁(600↔1200px 무한 진동)을 막는 순수 함수.
///
/// 왜 필요한가:
///   펼친 가로 툴바(폭 W=600)의 왼쪽 끝 아이콘(g=33)을 잡고 100%→200% 경계로 넘어가면,
///   `(B - 2D, B - D)` 구간(약 267px)에서는 100%일 때 왼쪽 과반(→200% 전환), 200%일 때 오른쪽 과반(→100% 복귀)이 되어
///   Windows `MonitorFromRect` 다수결이 매 프레임 진동합니다.
/// 해결:
///   목표 모니터 `M_next`의 배율로 리사이즈된 뒤에도 여전히 `M_next`가 과반인 경우(안정 전환)에만 경계를 넘기고,
///   핑퐁 구간 안에서는 현재 모니터 `M_cur`가 엄격 과반을 유지하는 경계 직전 위치로 클램프합니다.
pub(crate) fn resolve_drag_position_with_dpi_hysteresis(
    cursor_phys: (i32, i32),
    initial_grab_phys: (f64, f64),
    start_scale: f64,
    cur_scale: f64,
    cur_size_phys: (u32, u32),
    prev_pos: (i32, i32),
    monitors: &[MonitorRect],
) -> (i32, i32) {
    let (tx, ty) = compute_target_position(
        cursor_phys,
        initial_grab_phys,
        start_scale,
        cur_scale,
        cur_size_phys,
    );
    if monitors.len() < 2 {
        return (tx, ty);
    }

    let w = cur_size_phys.0.max(1) as i32;
    let h = cur_size_phys.1.max(1) as i32;
    let prev_rect = PhysRect {
        x: prev_pos.0,
        y: prev_pos.1,
        width: w,
        height: h,
    };
    let Some(cur_idx) = majority_monitor(prev_rect, monitors, None) else {
        return (tx, ty);
    };

    let cand_rect = PhysRect {
        x: tx,
        y: ty,
        width: w,
        height: h,
    };
    let Some(next_idx) = threatening_other_monitor(cand_rect, monitors, cur_idx) else {
        return (tx, ty);
    };

    let m_cur = monitors[cur_idx];
    let m_next = monitors[next_idx];
    if (m_cur.scale - m_next.scale).abs() < 0.01 {
        return (tx, ty);
    }

    // 다음 모니터의 배율로 커지거나 작아진 뒤에도 다음 모니터가 엄격 과반인지 검사합니다.
    let safe_cur = if cur_scale.is_finite() && cur_scale > 0.0 {
        cur_scale
    } else {
        m_cur.scale.max(1.0)
    };
    let ratio = m_next.scale / safe_cur;
    let next_w = ((w as f64) * ratio).round().max(1.0) as u32;
    let next_h = ((h as f64) * ratio).round().max(1.0) as u32;
    let (tx2, ty2) = compute_target_position(
        cursor_phys,
        initial_grab_phys,
        start_scale,
        m_next.scale,
        (next_w, next_h),
    );
    let after_rect = PhysRect {
        x: tx2,
        y: ty2,
        width: next_w as i32,
        height: next_h as i32,
    };
    if has_strict_majority(after_rect, monitors, next_idx) {
        // 일관된 단일 전환 구간이므로 경계를 통과시킵니다.
        return (tx, ty);
    }

    // 핑퐁 데드존: 현재 모니터가 엄격 과반(> 50%)을 유지하는 가장 가까운 좌표로 클램프합니다.
    let mut cx = tx;
    let mut cy = ty;
    if m_next.x + m_next.width <= m_cur.x + 1 {
        // 다음 모니터가 왼쪽: `cx + w - B > B - cx` → `cx >= B - (w - 1) / 2`
        cx = cx.max(m_cur.x - (w - 1) / 2);
    } else if m_next.x >= m_cur.x + m_cur.width - 1 {
        // 다음 모니터가 오른쪽: `B - cx > cx + w - B` → `cx <= B - w / 2 - 1`
        let b = m_cur.x + m_cur.width;
        cx = cx.min(b - (w / 2) - 1);
    }
    if m_next.y + m_next.height <= m_cur.y + 1 {
        // 다음 모니터가 위쪽
        cy = cy.max(m_cur.y - (h - 1) / 2);
    } else if m_next.y >= m_cur.y + m_cur.height - 1 {
        // 다음 모니터가 아래쪽
        let b = m_cur.y + m_cur.height;
        cy = cy.min(b - (h / 2) - 1);
    }

    let clamped_rect = PhysRect {
        x: cx,
        y: cy,
        width: w,
        height: h,
    };
    if has_strict_majority(clamped_rect, monitors, cur_idx) {
        (cx, cy)
    } else {
        // L자형 3모니터 모서리처럼 단순 축 클램프로 과반이 안 지켜지면 직전 안전 좌표를 유지합니다.
        prev_pos
    }
}

/// 커서와 "현재 창 기준 잡기 지점" 사이의 오차 거리(물리 px)를 계산합니다.
fn compute_lag_px(
    cursor_phys: (i32, i32),
    win_outer: (i32, i32),
    initial_grab_phys: (f64, f64),
    start_scale: f64,
    cur_scale: f64,
    win_size_phys: (u32, u32),
) -> f64 {
    let (expected_x, expected_y) = compute_target_position(
        cursor_phys,
        initial_grab_phys,
        start_scale,
        cur_scale,
        win_size_phys,
    );
    ((expected_x - win_outer.0) as f64).hypot((expected_y - win_outer.1) as f64)
}

// ============================================================================
// Windows FFI (외부 크레이트 의존성 없이 user32 / dwmapi 직접 링크)
// ============================================================================

#[cfg(target_os = "windows")]
mod win32 {
    use std::ffi::c_void;

    #[repr(C)]
    #[derive(Clone, Copy, Default, Debug)]
    pub struct Point {
        pub x: i32,
        pub y: i32,
    }

    #[repr(C)]
    #[derive(Clone, Copy, Default, Debug)]
    pub struct Rect {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }

    #[repr(C)]
    pub struct GuiThreadInfo {
        pub cb_size: u32,
        pub flags: u32,
        pub hwnd_active: *mut c_void,
        pub hwnd_focus: *mut c_void,
        pub hwnd_capture: *mut c_void,
        pub hwnd_menu_owner: *mut c_void,
        pub hwnd_move_size: *mut c_void,
        pub hwnd_caret: *mut c_void,
        pub rc_caret: Rect,
    }

    const VK_LBUTTON: i32 = 0x01;
    const VK_RBUTTON: i32 = 0x02;
    const VK_ESCAPE: i32 = 0x1B;
    const SM_SWAPBUTTON: i32 = 23;

    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const GUI_INMOVESIZE: u32 = 0x0002;

    #[link(name = "user32")]
    extern "system" {
        fn GetCursorPos(lp_point: *mut Point) -> i32;
        fn GetAsyncKeyState(v_key: i32) -> i16;
        fn GetSystemMetrics(n_index: i32) -> i32;
        fn SetWindowPos(
            hwnd: *mut c_void,
            hwnd_insert_after: *mut c_void,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
        fn GetWindowRect(hwnd: *mut c_void, lp_rect: *mut Rect) -> i32;
        fn GetWindowThreadProcessId(hwnd: *mut c_void, lpdw_process_id: *mut u32) -> u32;
        fn GetGUIThreadInfo(id_thread: u32, lpgui: *mut GuiThreadInfo) -> i32;
    }

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmFlush() -> i32;
    }

    pub fn get_cursor_pos() -> Option<(i32, i32)> {
        let mut pt = Point::default();
        if unsafe { GetCursorPos(&mut pt) } != 0 {
            Some((pt.x, pt.y))
        } else {
            None
        }
    }

    /// 좌우 마우스 버튼 반전(왼손잡이 설정)을 고려해 주 버튼의 물리적 눌림 상태를 확인합니다.
    pub fn is_primary_button_down() -> bool {
        let vk = if unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0 {
            VK_RBUTTON
        } else {
            VK_LBUTTON
        };
        (unsafe { GetAsyncKeyState(vk) } as u16 & 0x8000) != 0
    }

    pub fn is_escape_down() -> bool {
        (unsafe { GetAsyncKeyState(VK_ESCAPE) } as u16 & 0x8000) != 0
    }

    /// 메인 UI 스레드에서 동기적으로 창 위치만 이동합니다(Z-order·크기·포커스 무변경).
    pub fn set_window_pos_sync(hwnd: *mut c_void, x: i32, y: i32) -> bool {
        unsafe {
            SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                x,
                y,
                0,
                0,
                SWP_NOZORDER | SWP_NOSIZE | SWP_NOACTIVATE,
            ) != 0
        }
    }

    pub fn get_window_rect(hwnd: *mut c_void) -> Option<Rect> {
        let mut rc = Rect::default();
        if unsafe { GetWindowRect(hwnd, &mut rc) } != 0 {
            Some(rc)
        } else {
            None
        }
    }

    pub fn window_thread_id(hwnd: *mut c_void) -> u32 {
        unsafe { GetWindowThreadProcessId(hwnd, std::ptr::null_mut()) }
    }

    pub fn is_thread_in_movesize(tid: u32) -> bool {
        if tid == 0 {
            return false;
        }
        let mut info = GuiThreadInfo {
            cb_size: std::mem::size_of::<GuiThreadInfo>() as u32,
            flags: 0,
            hwnd_active: std::ptr::null_mut(),
            hwnd_focus: std::ptr::null_mut(),
            hwnd_capture: std::ptr::null_mut(),
            hwnd_menu_owner: std::ptr::null_mut(),
            hwnd_move_size: std::ptr::null_mut(),
            hwnd_caret: std::ptr::null_mut(),
            rc_caret: Rect::default(),
        };
        unsafe { GetGUIThreadInfo(tid, &mut info) != 0 && (info.flags & GUI_INMOVESIZE) != 0 }
    }

    /// DWM 컴포지터 프레임에 맞춰 대기합니다. RDP/DWM 비활성 또는 0ms 즉시 반환 시 안전하게 sleep합니다.
    pub fn wait_next_frame() {
        let before = std::time::Instant::now();
        let hr = unsafe { DwmFlush() };
        if hr != 0 {
            std::thread::sleep(std::time::Duration::from_millis(8));
        } else if before.elapsed() < std::time::Duration::from_millis(2) {
            std::thread::sleep(std::time::Duration::from_millis(4));
        }
    }
}

// ============================================================================
// 공통 도우미 (메뉴 숨김 · 모니터 캐시 · 기하 읽기 · 진단 파일 기록)
// ============================================================================

fn hide_visible_menus_for(app: &tauri::AppHandle, window_label: &str) {
    for &label in menu_labels_for_window(window_label) {
        if let Some(menu) = app.get_webview_window(label) {
            if menu.is_visible().unwrap_or(false) {
                let _ = menu.hide();
            }
        }
    }
}

fn cache_monitors(win: &tauri::WebviewWindow) -> Vec<MonitorRect> {
    win.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let p = m.position();
            let s = m.size();
            MonitorRect {
                x: p.x,
                y: p.y,
                width: s.width as i32,
                height: s.height as i32,
                scale: m.scale_factor(),
            }
        })
        .collect()
}

fn read_geometry(win: &tauri::WebviewWindow) -> Option<FinalGeometry> {
    let pos = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;
    let scale = win.scale_factor().ok()?;
    Some(FinalGeometry {
        physical_x: pos.x,
        physical_y: pos.y,
        outer_width: size.width,
        outer_height: size.height,
        scale_factor: scale,
    })
}

/// 진단 로그를 백그라운드 스레드에서 `app_log_dir()/toolkit-drag-diag.jsonl`에 1줄 기록합니다.
/// UI 스레드나 드래그 종료 이벤트를 절대 블로킹하지 않으며, 1MB를 넘으면 `.prev.jsonl`로 1회 회전합니다.
fn write_diag_record_async(app: &tauri::AppHandle, record: serde_json::Value) {
    if !diag_enabled() {
        return;
    }
    log::info!("[toolkit-drag-diag] {}", record);
    let Ok(log_dir) = app.path().app_log_dir() else {
        return;
    };
    let line = format!("{record}\n");
    std::thread::spawn(move || {
        use std::io::Write;
        if std::fs::create_dir_all(&log_dir).is_err() {
            return;
        }
        let path = log_dir.join("toolkit-drag-diag.jsonl");
        if std::fs::metadata(&path)
            .map(|m| m.len() >= DIAG_LOG_MAX_BYTES)
            .unwrap_or(false)
        {
            let prev = log_dir.join("toolkit-drag-diag.prev.jsonl");
            let _ = std::fs::rename(&path, &prev);
        }
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            let _ = file.write_all(line.as_bytes());
        }
    });
}

fn build_diag_json(
    session: &DragSession,
    reason: &str,
    cancelled: bool,
    moved: bool,
    final_geom: Option<&FinalGeometry>,
    final_lag_px: Option<f64>,
) -> serde_json::Value {
    json!({
        "token": session.token,
        "windowLabel": session.window_label,
        "mode": session.mode,
        "pointerType": session.pointer_type,
        "reason": reason,
        "cancelled": cancelled,
        "moved": moved,
        "durationMs": session.started_at.elapsed().as_millis() as u64,
        "frames": session.frames,
        "dpiTransitions": session.dpi_transitions,
        "downToThresholdMs": session.down_to_threshold_ms,
        "thresholdDistPx": session.threshold_dist_px,
        "initialLagPx": (session.initial_lag_px * 10.0).round() / 10.0,
        "maxLagPx": (session.max_lag_px * 10.0).round() / 10.0,
        "finalLagPx": final_lag_px.map(|v| (v * 10.0).round() / 10.0),
        "vkPrimaryDownAtStart": session.vk_primary_down_at_start,
        "guiInMovesizeSeen": session.gui_in_movesize_seen,
        "rectMismatchCount": session.rect_mismatch_count,
        "origin": [session.origin.0, session.origin.1],
        "finalGeometry": final_geom,
        "sampleCount": session.diag_samples.len(),
        "samples": &session.diag_samples,
    })
}

/// 외부 요인(트레이 좌표 초기화·소환·창 끄기·창 파괴)으로 진행 중인 드래그를 즉시 중단합니다.
///
/// 왜 `cancelled=true` 이벤트를 반드시 보내는가 (Major M5):
///   새 드래그가 이전 드래그를 대체(superseded)할 때와 달리, 외부 취소에서는 JS가 여전히 `isDragging = true`로
///   기다리고 있으므로 이벤트를 보내야 고착이 풀리고 직후의 `reset_coordinates` 위치가 `onMoved`로 저장됩니다.
fn cancel_active_drag_inner(app: &tauri::AppHandle, only_label: Option<&str>) {
    let previous = ACTIVE_SESSION.lock().ok().and_then(|mut slot| {
        if let Some(target) = only_label {
            let matches = slot
                .as_ref()
                .and_then(|arc| arc.lock().ok().map(|s| s.window_label == target))
                .unwrap_or(false);
            if !matches {
                return None;
            }
        }
        ACTIVE_GEN.fetch_add(1, Ordering::SeqCst);
        slot.take()
    });
    let Some(session_arc) = previous else {
        return;
    };
    let payload_and_diag = {
        let Ok(mut s) = session_arc.lock() else {
            return;
        };
        if s.phase != Phase::Tracking {
            return;
        }
        s.phase = Phase::Ended;
        let payload = DragEndPayload {
            token: s.token,
            moved: false,
            cancelled: true,
            reason: "cancelled",
            geometry: None,
            duration_ms: s.started_at.elapsed().as_millis() as u64,
            frames: s.frames,
            max_lag_px: (s.max_lag_px * 10.0).round() / 10.0,
        };
        let diag = if diag_enabled() {
            Some(build_diag_json(&s, "cancelled", true, false, None, None))
        } else {
            None
        };
        (s.window_label.clone(), payload, diag)
    };
    let _ = app.emit_to(payload_and_diag.0.as_str(), "toolkit-drag-end", payload_and_diag.1);
    if let Some(diag) = payload_and_diag.2 {
        write_diag_record_async(app, diag);
    }
}

pub fn cancel_active_drag(app: &tauri::AppHandle) {
    cancel_active_drag_inner(app, None);
}

pub fn cancel_active_drag_for(app: &tauri::AppHandle, window_label: &str) {
    cancel_active_drag_inner(app, Some(window_label));
}

/// 진행 중인 드래그 세션을 새 세션으로 교체합니다(같은 창의 이전 세션은 `superseded`로 조용히 종료, 다른 창 세션은 고착 방지를 위해 취소 이벤트 발행).
fn install_new_session(app: &tauri::AppHandle, session: Arc<Mutex<DragSession>>, new_label: &str) {
    let previous = ACTIVE_SESSION
        .lock()
        .ok()
        .and_then(|mut slot| slot.replace(session));
    if let Some(old) = previous {
        let cancel_other = {
            let Ok(mut s) = old.lock() else {
                return;
            };
            if s.phase != Phase::Tracking {
                None
            } else {
                s.phase = Phase::Ended;
                if s.window_label != new_label {
                    Some((
                        s.window_label.clone(),
                        DragEndPayload {
                            token: s.token,
                            moved: false,
                            cancelled: true,
                            reason: "cancelled",
                            geometry: None,
                            duration_ms: s.started_at.elapsed().as_millis() as u64,
                            frames: s.frames,
                            max_lag_px: (s.max_lag_px * 10.0).round() / 10.0,
                        },
                    ))
                } else {
                    None
                }
            }
        };
        if let Some((old_label, payload)) = cancel_other {
            let _ = app.emit_to(old_label.as_str(), "toolkit-drag-end", payload);
        }
    }
}

fn clear_active_if_gen(gen: u64) {
    if let Ok(mut slot) = ACTIVE_SESSION.lock() {
        let same = slot
            .as_ref()
            .and_then(|arc| arc.lock().ok().map(|s| s.gen == gen))
            .unwrap_or(false);
        if same {
            *slot = None;
        }
    }
}

// ============================================================================
// 메인 스레드 이동 적용 및 FIFO 종료 (Windows)
// ============================================================================

#[cfg(target_os = "windows")]
fn apply_target_on_main_thread(
    win: &tauri::WebviewWindow,
    session: &mut DragSession,
    cursor: (i32, i32),
) -> Option<(i32, i32)> {
    let hwnd = win.hwnd().ok()?.0 as *mut std::ffi::c_void;
    let cur_outer = win.outer_position().ok()?;
    let cur_size = win.outer_size().ok()?;
    let cur_scale = win.scale_factor().ok()?;

    let lag_before = compute_lag_px(
        cursor,
        (cur_outer.x, cur_outer.y),
        session.initial_grab_phys,
        session.start_scale,
        cur_scale,
        (cur_size.width, cur_size.height),
    );
    if lag_before > session.max_lag_px {
        session.max_lag_px = lag_before;
    }

    let (tx, ty) = resolve_drag_position_with_dpi_hysteresis(
        cursor,
        session.initial_grab_phys,
        session.start_scale,
        cur_scale,
        (cur_size.width, cur_size.height),
        session.last_applied_pos,
        &session.monitors,
    );

    let _ = win32::set_window_pos_sync(hwnd, tx, ty);

    // 혼합 DPI 모니터로 방금 넘어갔으면 새 배율·크기를 즉시 재조회해 2차 보정으로 1프레임 튐을 제거합니다.
    let mut final_scale = win.scale_factor().unwrap_or(cur_scale);
    let mut final_req = (tx, ty);
    if (final_scale - cur_scale).abs() > 0.01 {
        session.dpi_transitions = session.dpi_transitions.saturating_add(1);
        if let Ok(after_size) = win.outer_size() {
            let (tx2, ty2) = compute_target_position(
                cursor,
                session.initial_grab_phys,
                session.start_scale,
                final_scale,
                (after_size.width, after_size.height),
            );
            let _ = win32::set_window_pos_sync(hwnd, tx2, ty2);
            final_req = (tx2, ty2);
            final_scale = win.scale_factor().unwrap_or(final_scale);
        }
    }

    let actual_rect = win32::get_window_rect(hwnd);
    let actual_pos = actual_rect
        .map(|r| (r.left, r.top))
        .or_else(|| win.outer_position().ok().map(|p| (p.x, p.y)))
        .unwrap_or(final_req);
    let actual_size = actual_rect
        .map(|r| {
            (
                (r.right - r.left).max(0) as u32,
                (r.bottom - r.top).max(0) as u32,
            )
        })
        .or_else(|| win.outer_size().ok().map(|s| (s.width, s.height)))
        .unwrap_or((cur_size.width, cur_size.height));

    if actual_pos != final_req {
        session.rect_mismatch_count = session.rect_mismatch_count.saturating_add(1);
    }
    if diag_enabled() && session.diag_samples.len() < DIAG_SAMPLE_LIMIT {
        session.diag_samples.push(DiagSample {
            at_ms: session.started_at.elapsed().as_millis() as u64,
            req_x: final_req.0,
            req_y: final_req.1,
            actual_x: actual_pos.0,
            actual_y: actual_pos.1,
            actual_w: actual_size.0,
            actual_h: actual_size.1,
            scale: final_scale,
            lag_px: (lag_before * 10.0).round() / 10.0,
        });
    }

    session.last_applied_cursor = Some(cursor);
    session.last_applied_pos = actual_pos;
    session.frames = session.frames.saturating_add(1);
    session.last_activity_at = Instant::now();
    Some(actual_pos)
}

#[cfg(target_os = "windows")]
fn finalize_on_main_thread(
    app: tauri::AppHandle,
    session_arc: Arc<Mutex<DragSession>>,
    gen: u64,
    reason: &'static str,
) {
    let Some(window_label) = session_arc.lock().ok().map(|s| s.window_label.clone()) else {
        clear_active_if_gen(gen);
        return;
    };
    let Some(win) = app.get_webview_window(&window_label) else {
        clear_active_if_gen(gen);
        return;
    };
    let app_clone = app.clone();
    let label_for_main = window_label.clone();
    // 모든 이동 클로저와 동일한 `run_on_main_thread` FIFO 큐에 넣어 종료 후 옛 위치 덮어쓰기를 원천 차단합니다.
    let scheduled = win.run_on_main_thread(move || {
        let Some(win) = app_clone.get_webview_window(&label_for_main) else {
            clear_active_if_gen(gen);
            return;
        };
        let (payload, diag_record) = {
            let Ok(mut s) = session_arc.lock() else {
                return;
            };
            if s.phase != Phase::Tracking || s.gen != gen {
                return;
            }
            s.phase = Phase::Ended;
            let mut cancelled = false;
            let mut final_lag_px = None;

            if reason == "escape" {
                cancelled = true;
                // 혼합 DPI 모니터를 넘어온 뒤 Esc 원복 시에도 `create_window`처럼 2회 적용해 원래 위치와 배율을 맞춥니다.
                if let Ok(hwnd_raw) = win.hwnd() {
                    let hwnd = hwnd_raw.0 as *mut std::ffi::c_void;
                    for _ in 0..2 {
                        let _ = win32::set_window_pos_sync(hwnd, s.origin.0, s.origin.1);
                    }
                    if let (Ok(pos), Ok(scale)) = (win.outer_position(), win.scale_factor()) {
                        if (pos.x != s.origin.0 || pos.y != s.origin.1)
                            || (scale - s.origin_scale).abs() > 0.01
                        {
                            let _ = win32::set_window_pos_sync(hwnd, s.origin.0, s.origin.1);
                        }
                    }
                }
            } else if reason == "released" && s.mode == "direct" {
                // 버튼 해제 직후의 최종 커서로 1회 정밀 스냅해 마지막 1프레임 오차를 0px로 정리합니다.
                if let Some(cursor) = win32::get_cursor_pos() {
                    if s.last_applied_cursor != Some(cursor) {
                        let _ = apply_target_on_main_thread(&win, &mut s, cursor);
                    }
                    if let (Ok(pos), Ok(size), Ok(scale)) =
                        (win.outer_position(), win.outer_size(), win.scale_factor())
                    {
                        final_lag_px = Some(compute_lag_px(
                            cursor,
                            (pos.x, pos.y),
                            s.initial_grab_phys,
                            s.start_scale,
                            scale,
                            (size.width, size.height),
                        ));
                    }
                }
            }

            let geom = read_geometry(&win);
            let moved = !cancelled
                && geom
                    .as_ref()
                    .is_some_and(|g| (g.physical_x, g.physical_y) != s.origin);
            let payload = DragEndPayload {
                token: s.token,
                moved,
                cancelled,
                reason,
                geometry: geom.clone(),
                duration_ms: s.started_at.elapsed().as_millis() as u64,
                frames: s.frames,
                max_lag_px: (s.max_lag_px * 10.0).round() / 10.0,
            };
            let diag = if diag_enabled() {
                Some(build_diag_json(
                    &s,
                    reason,
                    cancelled,
                    moved,
                    geom.as_ref(),
                    final_lag_px,
                ))
            } else {
                None
            };
            (payload, diag)
        };

        clear_active_if_gen(gen);
        let _ = app_clone.emit_to(label_for_main.as_str(), "toolkit-drag-end", payload);
        if let Some(diag) = diag_record {
            write_diag_record_async(&app_clone, diag);
        }
    });

    if scheduled.is_err() {
        clear_active_if_gen(gen);
    }
}

// ============================================================================
// Tauri 커맨드: 시작 / 이동(터치·펜) / 종료(터치·펜)
// ============================================================================

#[tauri::command]
pub async fn toolkit_start_drag(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    args: StartDragArgs,
) -> Result<DragStartResult, String> {
    let window_label = window.label().to_string();
    if !is_draggable_window_label(&window_label) {
        return Err("직접 드래그를 지원하지 않는 창입니다.".into());
    }
    if crate::toolkit::QUITTING.load(Ordering::SeqCst) || crate::noticeboard_quit::pending() {
        return Err("앱을 종료하고 있어요.".into());
    }
    if !args.grab_x.is_finite() || !args.grab_y.is_finite() {
        return Err("잘못된 잡기 좌표입니다.".into());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let app_clone = app.clone();
        let label_for_fallback = window_label.clone();
        let (tx, rx) = tokio::sync::oneshot::channel();
        window
            .run_on_main_thread(move || {
                hide_visible_menus_for(&app_clone, &label_for_fallback);
                let res = app_clone
                    .get_webview_window(&label_for_fallback)
                    .ok_or_else(|| "창을 찾을 수 없습니다.".to_string())
                    .and_then(|w| w.start_dragging().map_err(|e| e.to_string()));
                let _ = tx.send(res);
            })
            .map_err(|e| e.to_string())?;
        rx.await.map_err(|_| "드래그 시작 응답을 받지 못했습니다.")??;
        return Ok(DragStartResult {
            token: args.token,
            mode: "os-fallback",
            moved: false,
            geometry: None,
            initial_lag_px: 0.0,
        });
    }

    #[cfg(target_os = "windows")]
    {
        let gen = ACTIVE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
        let is_mouse = args.pointer_type == "mouse";
        let app_for_main = app.clone();
        let label_for_main = window_label.clone();
        let pointer_type = args.pointer_type.clone();
        let start_screen = match (args.start_screen_x, args.start_screen_y) {
            (Some(x), Some(y)) if x.is_finite() && y.is_finite() => Some((x, y)),
            _ => None,
        };
        let cur_screen = match (args.cur_screen_x, args.cur_screen_y) {
            (Some(x), Some(y)) if x.is_finite() && y.is_finite() => Some((x, y)),
            _ => None,
        };
        let (tx, rx) = tokio::sync::oneshot::channel();

        // 왜 tokio::sync::oneshot인가: async 커맨드에서 std::sync::mpsc::recv를 쓰면 Tokio 워커 스레드가 막힙니다.
        window
            .run_on_main_thread(move || {
                hide_visible_menus_for(&app_for_main, &label_for_main);
                let Some(win) = app_for_main.get_webview_window(&label_for_main) else {
                    let _ = tx.send(Err("창을 찾을 수 없습니다.".to_string()));
                    return;
                };
                let (Ok(origin), Ok(inner), Ok(size), Ok(start_scale), Ok(hwnd_raw)) = (
                    win.outer_position(),
                    win.inner_position(),
                    win.outer_size(),
                    win.scale_factor(),
                    win.hwnd(),
                ) else {
                    let _ = tx.send(Err("창 좌표를 읽지 못했습니다.".to_string()));
                    return;
                };

                let hwnd = hwnd_raw.0 as *mut std::ffi::c_void;
                let main_tid = win32::window_thread_id(hwnd);
                let monitors = cache_monitors(&win);
                let client_inset = (inner.x - origin.x, inner.y - origin.y);
                let initial_grab_phys = compute_grab_phys(
                    args.grab_x,
                    args.grab_y,
                    args.dpr,
                    start_scale,
                    client_inset,
                    (size.width, size.height),
                );
                let safe_dpr = if args.dpr.is_finite() && args.dpr > 0.0 {
                    args.dpr
                } else {
                    start_scale
                };

                let cursor_opt = win32::get_cursor_pos();
                let button_down = win32::is_primary_button_down();
                let gui_movesize = win32::is_thread_in_movesize(main_tid);

                // 비대화형 세션 등 GetCursorPos 실패 시(마우스): OS 드래그로 안전 폴백.
                let Some(cursor) = cursor_opt else {
                    if is_mouse {
                        let _ = win.start_dragging();
                        let _ = tx.send(Ok((
                            DragStartResult {
                                token: args.token,
                                mode: "os-fallback",
                                moved: false,
                                geometry: None,
                                initial_lag_px: 0.0,
                            },
                            None,
                            0u32,
                        )));
                        return;
                    }
                    // 터치/펜은 screenX/Y 델타로 동작하므로 GetCursorPos 없이도 진행합니다.
                    let session = Arc::new(Mutex::new(DragSession {
                        gen,
                        token: args.token,
                        window_label: label_for_main.clone(),
                        phase: Phase::Tracking,
                        mode: "direct-js-end",
                        pointer_type,
                        origin: (origin.x, origin.y),
                        origin_scale: start_scale,
                        initial_grab_phys,
                        start_scale,
                        start_dpr: safe_dpr,
                        start_screen,
                        monitors,
                        last_applied_cursor: None,
                        last_applied_pos: (origin.x, origin.y),
                        started_at: Instant::now(),
                        last_activity_at: Instant::now(),
                        frames: 0,
                        dpi_transitions: 0,
                        initial_lag_px: 0.0,
                        max_lag_px: 0.0,
                        down_to_threshold_ms: args.down_to_threshold_ms,
                        threshold_dist_px: args.threshold_dist_px,
                        vk_primary_down_at_start: button_down,
                        gui_in_movesize_seen: gui_movesize,
                        rect_mismatch_count: 0,
                        diag_samples: Vec::new(),
                    }));
                    install_new_session(&app_for_main, Arc::clone(&session), &label_for_main);
                    let _ = tx.send(Ok((
                        DragStartResult {
                            token: args.token,
                            mode: "direct-js-end",
                            moved: false,
                            geometry: None,
                            initial_lag_px: 0.0,
                        },
                        Some(session),
                        main_tid,
                    )));
                    return;
                };

                let initial_lag_px = compute_lag_px(
                    cursor,
                    (origin.x, origin.y),
                    initial_grab_phys,
                    start_scale,
                    start_scale,
                    (size.width, size.height),
                );

                let mode: &'static str = if !is_mouse {
                    "direct-js-end"
                } else if !button_down {
                    "quick-release"
                } else {
                    "direct"
                };

                let mut session = DragSession {
                    gen,
                    token: args.token,
                    window_label: label_for_main.clone(),
                    phase: if mode == "quick-release" {
                        Phase::Ended
                    } else {
                        Phase::Tracking
                    },
                    mode,
                    pointer_type,
                    origin: (origin.x, origin.y),
                    origin_scale: start_scale,
                    initial_grab_phys,
                    start_scale,
                    start_dpr: safe_dpr,
                    start_screen,
                    monitors,
                    last_applied_cursor: None,
                    last_applied_pos: (origin.x, origin.y),
                    started_at: Instant::now(),
                    last_activity_at: Instant::now(),
                    frames: 0,
                    dpi_transitions: 0,
                    initial_lag_px,
                    max_lag_px: initial_lag_px,
                    down_to_threshold_ms: args.down_to_threshold_ms,
                    threshold_dist_px: args.threshold_dist_px,
                    vk_primary_down_at_start: button_down,
                    gui_in_movesize_seen: gui_movesize,
                    rect_mismatch_count: 0,
                    diag_samples: Vec::new(),
                };

                // 마우스는 실제 커서로, 터치/펜은 임계값 통과 순간의 화면 좌표 델타로 즉시 0px 동기 스냅합니다.
                if is_mouse {
                    let _ = apply_target_on_main_thread(&win, &mut session, cursor);
                } else if let (Some((sx, sy)), Some((cx, cy))) = (start_screen, cur_screen) {
                    let dx = ((cx - sx) * session.start_dpr).round() as i32;
                    let dy = ((cy - sy) * session.start_dpr).round() as i32;
                    let virtual_cursor = (
                        session.origin.0 + dx + session.initial_grab_phys.0.round() as i32,
                        session.origin.1 + dy + session.initial_grab_phys.1.round() as i32,
                    );
                    let _ = apply_target_on_main_thread(&win, &mut session, virtual_cursor);
                }

                if mode == "quick-release" {
                    // C1 해결: 이벤트 없이 응답에 최종 기하 정보를 담아 단발 완결합니다.
                    let geom = read_geometry(&win);
                    let moved = geom
                        .as_ref()
                        .is_some_and(|g| (g.physical_x, g.physical_y) != session.origin);
                    if diag_enabled() {
                        let diag = build_diag_json(
                            &session,
                            "quick-release",
                            false,
                            moved,
                            geom.as_ref(),
                            Some(0.0),
                        );
                        write_diag_record_async(&app_for_main, diag);
                    }
                    let _ = tx.send(Ok((
                        DragStartResult {
                            token: args.token,
                            mode: "quick-release",
                            moved,
                            geometry: geom,
                            initial_lag_px: (initial_lag_px * 10.0).round() / 10.0,
                        },
                        None,
                        main_tid,
                    )));
                    return;
                }

                let session_arc = Arc::new(Mutex::new(session));
                install_new_session(&app_for_main, Arc::clone(&session_arc), &label_for_main);
                let _ = tx.send(Ok((
                    DragStartResult {
                        token: args.token,
                        mode,
                        moved: false,
                        geometry: None,
                        initial_lag_px: (initial_lag_px * 10.0).round() / 10.0,
                    },
                    Some(session_arc),
                    main_tid,
                )));
            })
            .map_err(|e| e.to_string())?;

        let (result, session_opt, main_tid) = rx
            .await
            .map_err(|_| "드래그 시작 응답을 받지 못했습니다.")??;

        // 프레임 시계 워커 스레드 기동 (`direct`: 마우스 커서 추적 / `direct-js-end`: 터치·펜 하트비트 워치독)
        if let Some(session_arc) = session_opt {
            let app_worker = app.clone();
            let worker_label = window_label.clone();
            let mode = result.mode;
            std::thread::spawn(move || {
                let in_flight = Arc::new(AtomicBool::new(false));
                loop {
                    if mode == "direct" {
                        win32::wait_next_frame();
                    } else {
                        std::thread::sleep(Duration::from_millis(50));
                    }

                    if ACTIVE_GEN.load(Ordering::SeqCst) != gen {
                        // 새 드래그에 의해 대체(superseded)되었거나 이미 cancel_active_drag가 처리했습니다.
                        return;
                    }
                    if crate::toolkit::QUITTING.load(Ordering::SeqCst)
                        || crate::noticeboard_quit::pending()
                    {
                        finalize_on_main_thread(app_worker, session_arc, gen, "cancelled");
                        return;
                    }
                    let Some(win) = app_worker.get_webview_window(&worker_label) else {
                        clear_active_if_gen(gen);
                        return;
                    };

                    if diag_enabled() && win32::is_thread_in_movesize(main_tid) {
                        if let Ok(mut s) = session_arc.lock() {
                            s.gui_in_movesize_seen = true;
                        }
                    }

                    if mode == "direct-js-end" {
                        let timed_out = session_arc
                            .lock()
                            .ok()
                            .map(|s| {
                                s.phase != Phase::Tracking
                                    || s.last_activity_at.elapsed() >= JS_END_HEARTBEAT_TIMEOUT
                            })
                            .unwrap_or(true);
                        if timed_out {
                            finalize_on_main_thread(app_worker, session_arc, gen, "timeout");
                            return;
                        }
                        continue;
                    }

                    // 이하 Windows 마우스 직접 추적 (`mode == "direct"`)
                    if win32::is_escape_down() {
                        finalize_on_main_thread(app_worker, session_arc, gen, "escape");
                        return;
                    }
                    if !win32::is_primary_button_down() {
                        finalize_on_main_thread(app_worker, session_arc, gen, "released");
                        return;
                    }

                    // 백프레셔 가드: 직전 이동 클로저가 메인 스레드에서 아직 끝나지 않았으면 건너뜁니다.
                    if in_flight.swap(true, Ordering::AcqRel) {
                        continue;
                    }

                    let app_tick = app_worker.clone();
                    let label_tick = worker_label.clone();
                    let session_tick = Arc::clone(&session_arc);
                    let in_flight_tick = Arc::clone(&in_flight);
                    let sent = win.run_on_main_thread(move || {
                        struct Reset(Arc<AtomicBool>);
                        impl Drop for Reset {
                            fn drop(&mut self) {
                                self.0.store(false, Ordering::Release);
                            }
                        }
                        let _reset = Reset(in_flight_tick);

                        if ACTIVE_GEN.load(Ordering::SeqCst) != gen {
                            return;
                        }
                        let Some(win) = app_tick.get_webview_window(&label_tick) else {
                            return;
                        };
                        // Major M2: 커서는 워커가 아니라 메인 스레드에서 SetWindowPos 직전에 읽어 1프레임 지연을 없앱니다.
                        let Some(cursor) = win32::get_cursor_pos() else {
                            return;
                        };
                        let Ok(mut s) = session_tick.lock() else {
                            return;
                        };
                        if s.phase != Phase::Tracking || s.gen != gen {
                            return;
                        }
                        // 정지 커서에서는 SetWindowPos를 호출하지 않아 CPU/COM 부하 0과 핑퐁 방지를 보장합니다.
                        if s.last_applied_cursor == Some(cursor) {
                            return;
                        }
                        let _ = apply_target_on_main_thread(&win, &mut s, cursor);
                    });

                    if sent.is_err() {
                        // 이벤트 루프가 이미 종료 중입니다.
                        in_flight.store(false, Ordering::Release);
                        clear_active_if_gen(gen);
                        return;
                    }
                }
            });
        }

        Ok(result)
    }
}

/// 터치/펜(`direct-js-end`) 드래그에서 rAF 주기로 화면 좌표를 받아 동일한 DPI 히스테리시스 + `SetWindowPos` 엔진으로 이동합니다.
#[tauri::command]
pub async fn toolkit_move_drag(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    args: MoveDragArgs,
) -> Result<(), String> {
    let window_label = window.label().to_string();
    if !is_draggable_window_label(&window_label) {
        return Ok(());
    }
    if !args.screen_x.is_finite() || !args.screen_y.is_finite() {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let session_opt = ACTIVE_SESSION.lock().ok().and_then(|s| s.clone());
        let Some(session_arc) = session_opt else {
            return Ok(());
        };
        let app_clone = app.clone();
        let label_for_main = window_label.clone();
        let _ = window.run_on_main_thread(move || {
            let Some(win) = app_clone.get_webview_window(&label_for_main) else {
                return;
            };
            let Ok(mut s) = session_arc.lock() else {
                return;
            };
            if s.phase != Phase::Tracking
                || s.window_label != label_for_main
                || s.token != args.token
                || s.mode != "direct-js-end"
            {
                return;
            }
            let (sx, sy) = match s.start_screen {
                Some(pair) => pair,
                None => {
                    s.start_screen = Some((args.screen_x, args.screen_y));
                    (args.screen_x, args.screen_y)
                }
            };
            let dx = ((args.screen_x - sx) * s.start_dpr).round() as i32;
            let dy = ((args.screen_y - sy) * s.start_dpr).round() as i32;
            // `origin + delta + initial_grab_phys`를 가상 커서 물리 좌표로 환산해 동일 엔진에 태웁니다.
            let virtual_cursor = (
                s.origin.0 + dx + s.initial_grab_phys.0.round() as i32,
                s.origin.1 + dy + s.initial_grab_phys.1.round() as i32,
            );
            if s.last_applied_cursor == Some(virtual_cursor) {
                s.last_activity_at = Instant::now();
                return;
            }
            let _ = apply_target_on_main_thread(&win, &mut s, virtual_cursor);
        });
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (app, args);

    Ok(())
}

/// 터치/펜(`direct-js-end`) 드래그에서 JS `pointerup`/`pointercancel`/`blur`가 도착했을 때 드래그를 마무리합니다.
#[tauri::command]
pub async fn toolkit_end_drag(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    args: EndDragArgs,
) -> Result<(), String> {
    let window_label = window.label().to_string();
    if !is_draggable_window_label(&window_label) {
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let target = ACTIVE_SESSION.lock().ok().and_then(|s| s.clone());
        let Some(session_arc) = target else {
            return Ok(());
        };
        let gen_opt = session_arc.lock().ok().and_then(|s| {
            (s.phase == Phase::Tracking
                && s.window_label == window_label
                && s.token == args.token)
                .then_some(s.gen)
        });
        if let Some(gen) = gen_opt {
            let reason = if args.cancelled { "escape" } else { "released" };
            finalize_on_main_thread(app, session_arc, gen, reason);
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (app, args);

    Ok(())
}

// ============================================================================
// 단위 테스트
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grab_phys_and_target_handle_scales_negative_monitors_and_clamping() {
        // 100% 배율, 66×66 접힌 아이콘 중심 잡기
        let grab = compute_grab_phys(33.0, 33.0, 1.0, 1.0, (0, 0), (66, 66));
        assert_eq!(grab, (33.0, 33.0));
        assert_eq!(
            compute_target_position((500, 300), grab, 1.0, 1.0, (66, 66)),
            (467, 267)
        );

        // 200% 배율(4K) 132×132 창, CSS 33px 잡기 → 물리 66px
        let grab2 = compute_grab_phys(33.0, 33.0, 2.0, 2.0, (0, 0), (132, 132));
        assert_eq!(grab2, (66.0, 66.0));
        assert_eq!(
            compute_target_position((1000, 500), grab2, 2.0, 2.0, (132, 132)),
            (934, 434)
        );
        // 200% → 100% 이동 후 크기 66×66: 오프셋도 33px로 비례 축소
        assert_eq!(
            compute_target_position((4000, 500), grab2, 2.0, 1.0, (66, 66)),
            (3967, 467)
        );

        // 왼쪽 음수 좌표 보조 모니터
        assert_eq!(
            compute_target_position((-400, -120), grab, 1.0, 1.0, (66, 66)),
            (-433, -153)
        );

        // 125% / 150% 비정수 배율 + client_inset 반영
        let grab125 = compute_grab_phys(20.0, 10.0, 1.25, 1.25, (2, 3), (100, 80));
        assert_eq!(grab125, (27.0, 15.5));
        assert_eq!(
            compute_target_position((200, 100), grab125, 1.25, 1.25, (100, 80)),
            (173, 84)
        );

        // 비정상 입력(음수·범위 초과·NaN) 안전 클램핑
        let clamped_neg = compute_grab_phys(-50.0, 999.0, 1.0, 1.0, (0, 0), (66, 66));
        assert_eq!(clamped_neg, (0.0, 65.0));
        let clamped_nan = compute_grab_phys(f64::NAN, f64::INFINITY, 0.0, 1.0, (0, 0), (66, 66));
        assert_eq!(clamped_nan, (32.5, 32.5));
    }

    /// 4K 200%(왼쪽 0..3840) ↔ FHD 100%(오른쪽 3840..5760) 경계를 1px씩 양방향 스윕할 때
    /// 펼친 가로 툴바(W=600, 왼쪽 끝 g=33 잡기)가 핑퐁 없이 정확히 1회만 DPI 전환되는지 증명합니다.
    #[test]
    fn mixed_dpi_horizontal_expanded_bar_transitions_exactly_once_both_ways() {
        let monitors = [
            MonitorRect { x: 0, y: 0, width: 3840, height: 2160, scale: 2.0 },
            MonitorRect { x: 3840, y: 0, width: 1920, height: 1080, scale: 1.0 },
        ];
        let logical_w = 600.0;
        let logical_h = 66.0;

        // 1) 오른쪽 100% → 왼쪽 200% (가장 위험한 267px 데드존 구간 포함)
        let mut cur_scale = 1.0;
        let mut cur_w = 600u32;
        let mut cur_h = 66u32;
        let start_scale = 1.0;
        let grab_phys = compute_grab_phys(33.0, 33.0, 1.0, start_scale, (0, 0), (cur_w, cur_h));
        let mut win_pos = (4200, 400);
        let mut transitions = 0u32;

        for cx in (2800..=4233).rev() {
            let (nx, ny) = resolve_drag_position_with_dpi_hysteresis(
                (cx, 433),
                grab_phys,
                start_scale,
                cur_scale,
                (cur_w, cur_h),
                win_pos,
                &monitors,
            );
            win_pos = (nx, ny);
            // Windows MonitorFromRect 다수결 시뮬레이션
            let rect = PhysRect { x: win_pos.0, y: win_pos.1, width: cur_w as i32, height: cur_h as i32 };
            let owner = majority_monitor(rect, &monitors, None).unwrap();
            let next_scale = monitors[owner].scale;
            if (next_scale - cur_scale).abs() > 0.01 {
                transitions += 1;
                cur_scale = next_scale;
                cur_w = (logical_w * cur_scale).round() as u32;
                cur_h = (logical_h * cur_scale).round() as u32;
                // 2차 SetWindowPos 시뮬레이션
                win_pos = compute_target_position((cx, 433), grab_phys, start_scale, cur_scale, (cur_w, cur_h));
                let after = PhysRect { x: win_pos.0, y: win_pos.1, width: cur_w as i32, height: cur_h as i32 };
                let after_owner = majority_monitor(after, &monitors, None).unwrap();
                assert_eq!(after_owner, owner, "전환 직후 다시 이전 모니터로 되돌아가면 안 됩니다 (cx={cx})");
            }
        }
        assert_eq!(transitions, 1, "100%→200% 횡단은 정확히 1회만 전환되어야 합니다");
        assert_eq!(cur_scale, 2.0);

        // 2) 왼쪽 200% → 오른쪽 100% 역방향 스윕
        let mut transitions_back = 0u32;
        for cx in 2800..=4400 {
            let (nx, ny) = resolve_drag_position_with_dpi_hysteresis(
                (cx, 433),
                grab_phys,
                start_scale,
                cur_scale,
                (cur_w, cur_h),
                win_pos,
                &monitors,
            );
            win_pos = (nx, ny);
            let rect = PhysRect { x: win_pos.0, y: win_pos.1, width: cur_w as i32, height: cur_h as i32 };
            let owner = majority_monitor(rect, &monitors, None).unwrap();
            let next_scale = monitors[owner].scale;
            if (next_scale - cur_scale).abs() > 0.01 {
                transitions_back += 1;
                cur_scale = next_scale;
                cur_w = (logical_w * cur_scale).round() as u32;
                cur_h = (logical_h * cur_scale).round() as u32;
                win_pos = compute_target_position((cx, 433), grab_phys, start_scale, cur_scale, (cur_w, cur_h));
                let after = PhysRect { x: win_pos.0, y: win_pos.1, width: cur_w as i32, height: cur_h as i32 };
                assert_eq!(majority_monitor(after, &monitors, None).unwrap(), owner);
            }
        }
        assert_eq!(transitions_back, 1, "200%→100% 횡단도 정확히 1회만 전환되어야 합니다");
        assert_eq!(cur_scale, 1.0);
    }

    /// 세로 툴바(H=480, 위쪽 끝 아이콘 gy=33 잡기)의 상하 혼합 DPI 모니터 경계 횡단도 1회만 전환되는지 증명합니다.
    #[test]
    fn mixed_dpi_vertical_expanded_bar_transitions_exactly_once() {
        let monitors = [
            MonitorRect { x: 0, y: 0, width: 3840, height: 2160, scale: 2.0 },
            MonitorRect { x: 0, y: 2160, width: 1920, height: 1080, scale: 1.0 },
        ];
        let mut cur_scale = 1.0;
        let mut cur_w = 66u32;
        let mut cur_h = 480u32;
        let grab_phys = compute_grab_phys(33.0, 33.0, 1.0, 1.0, (0, 0), (cur_w, cur_h));
        let mut win_pos = (400, 2300);
        let mut transitions = 0u32;

        for cy in (1300..=2333).rev() {
            let (nx, ny) = resolve_drag_position_with_dpi_hysteresis(
                (433, cy),
                grab_phys,
                1.0,
                cur_scale,
                (cur_w, cur_h),
                win_pos,
                &monitors,
            );
            win_pos = (nx, ny);
            let rect = PhysRect { x: win_pos.0, y: win_pos.1, width: cur_w as i32, height: cur_h as i32 };
            let owner = majority_monitor(rect, &monitors, None).unwrap();
            let next_scale = monitors[owner].scale;
            if (next_scale - cur_scale).abs() > 0.01 {
                transitions += 1;
                cur_scale = next_scale;
                cur_w = (66.0 * cur_scale).round() as u32;
                cur_h = (480.0 * cur_scale).round() as u32;
                win_pos = compute_target_position((433, cy), grab_phys, 1.0, cur_scale, (cur_w, cur_h));
                let after = PhysRect { x: win_pos.0, y: win_pos.1, width: cur_w as i32, height: cur_h as i32 };
                assert_eq!(majority_monitor(after, &monitors, None).unwrap(), owner);
            }
        }
        assert_eq!(transitions, 1);
        assert_eq!(cur_scale, 2.0);
    }

    /// 접힌 원형 아이콘(66×66, 중심 g=33)은 데드존이 0px이므로 경계에서 미끄러짐 없이 즉시 1회 전환됩니다.
    #[test]
    fn collapsed_icon_has_zero_deadzone_across_mixed_dpi() {
        let monitors = [
            MonitorRect { x: 0, y: 0, width: 3840, height: 2160, scale: 2.0 },
            MonitorRect { x: 3840, y: 0, width: 1920, height: 1080, scale: 1.0 },
        ];
        let grab_phys = compute_grab_phys(33.0, 33.0, 1.0, 1.0, (0, 0), (66, 66));
        let mut cur_scale = 1.0;
        let mut cur_size = (66u32, 66u32);
        let mut win_pos = (3900, 400);
        let mut transitions = 0u32;

        for cx in (3700..=3933).rev() {
            let (nx, ny) = resolve_drag_position_with_dpi_hysteresis(
                (cx, 433),
                grab_phys,
                1.0,
                cur_scale,
                cur_size,
                win_pos,
                &monitors,
            );
            win_pos = (nx, ny);
            let rect = PhysRect { x: win_pos.0, y: win_pos.1, width: cur_size.0 as i32, height: cur_size.1 as i32 };
            let owner = majority_monitor(rect, &monitors, None).unwrap();
            if (monitors[owner].scale - cur_scale).abs() > 0.01 {
                transitions += 1;
                cur_scale = monitors[owner].scale;
                cur_size = ((66.0 * cur_scale) as u32, (66.0 * cur_scale) as u32);
                win_pos = compute_target_position((cx, 433), grab_phys, 1.0, cur_scale, cur_size);
            }
            // 접힌 아이콘은 모든 지점에서 커서와 목표 좌표가 1px 이내로 일치해야 합니다.
            let expected = compute_target_position((cx, 433), grab_phys, 1.0, cur_scale, cur_size);
            assert!((win_pos.0 - expected.0).abs() <= 1, "cx={cx}, win_pos={win_pos:?}, expected={expected:?}");
        }
        assert_eq!(transitions, 1);
    }

    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    #[test]
    fn gui_thread_info_matches_win64_abi_size() {
        assert_eq!(std::mem::size_of::<win32::GuiThreadInfo>(), 72);
    }

    #[test]
    fn draggable_window_labels_and_menu_mapping() {
        assert!(is_draggable_window_label("toolkit"));
        assert!(is_draggable_window_label("dday"));
        for rejected in ["main", "settings", "dday-control", "dday-widget-menu", "timer"] {
            assert!(!is_draggable_window_label(rejected));
        }

        assert!(menu_labels_for_window("toolkit").contains(&"toolkit-menu"));
        assert_eq!(menu_labels_for_window("dday"), &["dday-widget-menu"]);
        assert!(menu_labels_for_window("main").is_empty());
    }

    /// D-Day 위젯(236×256, 중앙 hero 카드 잡기 g=(118,128))의 혼합 DPI 모니터 양방향 횡단이
    /// 핑퐁 없이 정확히 1회만 전환되는지 증명합니다.
    #[test]
    fn mixed_dpi_dday_widget_transitions_exactly_once() {
        let monitors = [
            MonitorRect { x: 0, y: 0, width: 3840, height: 2160, scale: 2.0 },
            MonitorRect { x: 3840, y: 0, width: 1920, height: 1080, scale: 1.0 },
        ];
        let logical_w = 236.0;
        let logical_h = 256.0;
        let mut cur_scale = 1.0;
        let mut cur_w = 236u32;
        let mut cur_h = 256u32;
        let grab_phys = compute_grab_phys(118.0, 128.0, 1.0, 1.0, (0, 0), (cur_w, cur_h));
        let mut win_pos = (4000, 300);
        let mut transitions = 0u32;

        for cx in (3500..=4118).rev() {
            let (nx, ny) = resolve_drag_position_with_dpi_hysteresis(
                (cx, 428),
                grab_phys,
                1.0,
                cur_scale,
                (cur_w, cur_h),
                win_pos,
                &monitors,
            );
            win_pos = (nx, ny);
            let rect = PhysRect { x: win_pos.0, y: win_pos.1, width: cur_w as i32, height: cur_h as i32 };
            let owner = majority_monitor(rect, &monitors, None).unwrap();
            let next_scale = monitors[owner].scale;
            if (next_scale - cur_scale).abs() > 0.01 {
                transitions += 1;
                cur_scale = next_scale;
                cur_w = (logical_w * cur_scale).round() as u32;
                cur_h = (logical_h * cur_scale).round() as u32;
                win_pos = compute_target_position((cx, 428), grab_phys, 1.0, cur_scale, (cur_w, cur_h));
                let after = PhysRect { x: win_pos.0, y: win_pos.1, width: cur_w as i32, height: cur_h as i32 };
                assert_eq!(majority_monitor(after, &monitors, None).unwrap(), owner);
            }
        }
        assert_eq!(transitions, 1, "100%→200% D-Day 위젯 횡단은 정확히 1회만 전환되어야 합니다");
        assert_eq!(cur_scale, 2.0);

        let mut transitions_back = 0u32;
        for cx in 3500..=4200 {
            let (nx, ny) = resolve_drag_position_with_dpi_hysteresis(
                (cx, 428),
                grab_phys,
                1.0,
                cur_scale,
                (cur_w, cur_h),
                win_pos,
                &monitors,
            );
            win_pos = (nx, ny);
            let rect = PhysRect { x: win_pos.0, y: win_pos.1, width: cur_w as i32, height: cur_h as i32 };
            let owner = majority_monitor(rect, &monitors, None).unwrap();
            let next_scale = monitors[owner].scale;
            if (next_scale - cur_scale).abs() > 0.01 {
                transitions_back += 1;
                cur_scale = next_scale;
                cur_w = (logical_w * cur_scale).round() as u32;
                cur_h = (logical_h * cur_scale).round() as u32;
                win_pos = compute_target_position((cx, 428), grab_phys, 1.0, cur_scale, (cur_w, cur_h));
                let after = PhysRect { x: win_pos.0, y: win_pos.1, width: cur_w as i32, height: cur_h as i32 };
                assert_eq!(majority_monitor(after, &monitors, None).unwrap(), owner);
            }
        }
        assert_eq!(transitions_back, 1, "200%→100% D-Day 위젯 횡단도 정확히 1회만 전환되어야 합니다");
        assert_eq!(cur_scale, 1.0);
    }
}
