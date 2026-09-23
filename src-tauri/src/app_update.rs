//! 앱 안 자동 업데이트.
//!
//! 순서: 새 버전 정보(latest.json) 확인 → 설치 파일 내려받기·서명 확인 → 알림장·명단 창 저장 확인
//!       → 메모 창 저장 확인 → 업데이트 직전 사본 → 설치 프로그램 실행
//!       (앱은 즉시 끝나고, 설치가 끝나면 설치 프로그램이 새 버전을 다시 엽니다)
//!
//! 왜 Rust가 순서를 쥐는가:
//!   업데이터 플러그인은 설치 프로그램을 띄우자마자 앱을 곧바로 끝냅니다(std::process::exit).
//!   창의 닫기 처리기·종료 이벤트가 하나도 실행되지 않으므로, 그 전에 "모든 창이 저장을 마쳤다"는
//!   답을 창마다 받아야 합니다. 트레이 "종료"처럼 잠시 기다리기만 해서는 저장 완료를 보장할 수 없습니다.
//!   어느 창에서 눌렀든 한곳에서 진행해야 두 창이 동시에 설치 파일을 받는 일도 막을 수 있습니다.

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

// 새 버전 정보(latest.json)를 읽을 때의 전체 제한 시간
const CHECK_TIMEOUT: Duration = Duration::from_secs(20);
// 서버에 연결될 때까지의 제한 시간
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
// 내려받는 도중 이 시간 동안 한 조각도 오지 않으면 멈춘 것으로 봅니다.
// 왜 전체 시간 제한이 아닌가: 느린 학교망에서는 정상적인 내려받기도 몇 분 걸릴 수 있습니다.
const READ_TIMEOUT: Duration = Duration::from_secs(30);
// 알림장·명단 창이 저장을 마치고 답할 때까지 기다리는 시간 (큰 알림장 저장도 넉넉히 끝나는 시간)
const EDITOR_TIMEOUT: Duration = Duration::from_secs(30);
// 메모 창들이 저장을 마치고 답할 때까지 기다리는 시간
const WINDOW_TIMEOUT: Duration = Duration::from_secs(15);
// 답하지 않은 창에 저장 요청을 다시 보내는 간격
// 왜 다시 보내는가: 막 뜨던 창은 첫 요청이 도착한 뒤에야 수신기를 달아 요청을 놓칠 수 있습니다.
const RESEND_INTERVAL: Duration = Duration::from_secs(1);
const POLL_INTERVAL: Duration = Duration::from_millis(50);
// 모든 창이 답한 뒤 설치 전까지 두는 여유.
// 저장소의 자동 저장 대기(100ms)와 급식 창의 위치 저장처럼 답을 받지 않는 기록이 끝날 시간입니다.
const SETTLE_DELAY: Duration = Duration::from_millis(400);
// 진행률 방송 간격 (내려받은 조각마다 보내면 창 사이 통신이 넘칩니다)
const PROGRESS_INTERVAL: Duration = Duration::from_millis(150);

// 설치를 멈춘 이유. 화면은 이 코드를 한국어 안내로 바꿉니다(updateChecker.js의 describeInstallError).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Failure {
    // 이미 진행 중이거나 앱이 종료되는 중
    Busy,
    // 이 릴리스에 앱 안 설치 정보(latest.json)가 없거나 형식이 다름 → 직접 내려받기로 안내
    NotPrepared,
    // 화면에 안내한 버전과 설치 정보의 버전이 다름 → 다른 파일을 설치하지 않도록 멈춤
    VersionMismatch,
    // 설치 정보를 받지 못함 (인터넷)
    CheckFailed,
    // 설치 파일을 받지 못함 (인터넷)
    DownloadFailed,
    // 서명 확인 실패 → 어떤 경우에도 설치하지 않음
    BadSignature,
    // 사용자가 내려받기를 취소함
    Cancelled,
    // 알림장·명단 창이 저장·잠금을 허락하지 않음 (가져오기 중, 입력 중인 이름 등)
    EditorBusy,
    // 메모 창이 저장에 실패했다고 답함
    SaveFailed,
    // 창들의 답이 제한 시간 안에 오지 않음
    PrepareTimeout,
    // 설치 프로그램을 실행하지 못함
    LaunchFailed,
}

impl Failure {
    fn code(self) -> &'static str {
        match self {
            Failure::Busy => "BUSY",
            Failure::NotPrepared => "NOT_PREPARED",
            Failure::VersionMismatch => "VERSION_MISMATCH",
            Failure::CheckFailed => "CHECK_FAILED",
            Failure::DownloadFailed => "DOWNLOAD_FAILED",
            Failure::BadSignature => "BAD_SIGNATURE",
            Failure::Cancelled => "CANCELLED",
            Failure::EditorBusy => "EDITOR_BUSY",
            Failure::SaveFailed => "SAVE_FAILED",
            Failure::PrepareTimeout => "PREPARE_TIMEOUT",
            Failure::LaunchFailed => "LAUNCH_FAILED",
        }
    }
}

// 설치가 진행 중인지 (두 창에서 동시에 눌러도 한 번만 진행합니다)
static RUNNING: AtomicBool = AtomicBool::new(false);
// 확인·내려받기 단계에서만 채워지는 취소 신호. 저장 확인이 시작되면 비웁니다(그 뒤로는 되돌리지 않습니다).
static CANCEL: Mutex<Option<Arc<tokio::sync::Notify>>> = Mutex::new(None);
// 취소 버튼이 눌렸는지. 신호가 내려받기 완료와 엇갈려도 설치로 넘어가지 않게 한 번 더 확인합니다.
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);
static NEXT_PREPARE_ID: AtomicU64 = AtomicU64::new(1);
// 메모 창 저장 확인 상태
static PREPARE: Mutex<Option<WindowPrepare>> = Mutex::new(None);
// 알림장·명단 창의 답 (요청 번호, 허락 여부)
static EDITORS: Mutex<Option<(String, Option<bool>)>> = Mutex::new(None);

// ── 메모 창 저장 확인 ────────────────────────────────────────────────────

#[derive(Debug, PartialEq, Eq)]
enum PrepareState {
    Waiting,
    Ready,
    Failed,
}

// 저장을 마쳤다고 답해야 하는 창들의 명단.
// 왜 처음 명단만 기다리는가: 도중에 새로 열린 창은 빈 창이거나 디스크에서 막 불러온 창이라
//   아직 저장하지 않은 입력이 없습니다. 그런 창까지 기다리면 설치가 끝없이 밀릴 수 있습니다.
#[derive(Debug)]
struct WindowPrepare {
    id: u64,
    waiting: HashSet<String>,
    failed: bool,
}

impl WindowPrepare {
    fn new(id: u64, labels: HashSet<String>) -> Self {
        Self { id, waiting: labels, failed: false }
    }

    // 창의 답을 기록합니다. 다른 요청 번호의 답이나 명단에 없는 창의 답은 무시합니다.
    fn answer(&mut self, id: u64, label: &str, saved: bool) {
        if id != self.id || !self.waiting.contains(label) {
            return;
        }
        if saved {
            self.waiting.remove(label);
        } else {
            self.failed = true;
        }
    }

    // 사용자가 닫은 창은 기다리지 않습니다. (닫기 처리기가 저장을 마친 뒤에 창을 없앱니다)
    fn forget_closed(&mut self, open: &HashSet<String>) {
        self.waiting.retain(|label| open.contains(label));
    }

    fn state(&self) -> PrepareState {
        if self.failed {
            PrepareState::Failed
        } else if self.waiting.is_empty() {
            PrepareState::Ready
        } else {
            PrepareState::Waiting
        }
    }
}

fn open_data_windows(app: &tauri::AppHandle) -> HashSet<String> {
    app.webview_windows()
        .into_keys()
        .filter(|label| crate::tray::is_data_window(label))
        .collect()
}

// 메모 창(main·note-N·tinynote-N)이 모두 "예약 저장을 기록했고 입력을 막았다"고 답할 때까지 기다립니다.
fn wait_for_data_windows(app: &tauri::AppHandle, id: u64) -> Result<(), Failure> {
    if let Ok(mut prepare) = PREPARE.lock() {
        *prepare = Some(WindowPrepare::new(id, open_data_windows(app)));
    }
    let started = Instant::now();
    let mut last_sent: Option<Instant> = None;
    let outcome = loop {
        // 이미 답한 창은 같은 답을 다시 보낼 뿐이라 되풀이해도 안전합니다.
        // (급식 창도 이 신호를 받아 창 위치를 저장합니다)
        if last_sent.map_or(true, |at| at.elapsed() >= RESEND_INTERVAL) {
            let _ = app.emit("update-prepare", serde_json::json!({ "id": id }));
            last_sent = Some(Instant::now());
        }
        let open = open_data_windows(app);
        let state = PREPARE.lock().ok().and_then(|mut guard| {
            guard.as_mut().map(|prepare| {
                prepare.forget_closed(&open);
                prepare.state()
            })
        });
        match state {
            Some(PrepareState::Ready) => break Ok(()),
            Some(PrepareState::Failed) => break Err(Failure::SaveFailed),
            Some(PrepareState::Waiting) if started.elapsed() < WINDOW_TIMEOUT => {}
            _ => break Err(Failure::PrepareTimeout),
        }
        std::thread::sleep(POLL_INTERVAL);
    };
    if let Ok(mut prepare) = PREPARE.lock() {
        *prepare = None;
    }
    outcome
}

// 메모 창이 저장을 마친 뒤 부르는 명령. 어느 창의 답인지는 호출한 창의 이름으로만 판단합니다.
#[tauri::command]
pub fn update_prepare_ack(window: tauri::WebviewWindow, id: u64, ok: bool) {
    if let Ok(mut guard) = PREPARE.lock() {
        if let Some(prepare) = guard.as_mut() {
            prepare.answer(id, window.label(), ok);
        }
    }
}

// ── 알림장·명단 창 저장 확인 (noticeboard_quit의 종료 절차를 그대로 씁니다) ──────────

pub(crate) fn expect_editors(id: &str) {
    if let Ok(mut editors) = EDITORS.lock() {
        *editors = Some((id.to_string(), None));
    }
}

// 첫 답만 기록합니다. (허락 뒤 잠금을 풀 때 오는 "취소"가 결과를 뒤집지 않게)
pub(crate) fn editors_settled(id: &str, allowed: bool) {
    if let Ok(mut editors) = EDITORS.lock() {
        if let Some((expected, result)) = editors.as_mut() {
            if expected == id && result.is_none() {
                *result = Some(allowed);
            }
        }
    }
}

fn wait_for_editors(id: &str) -> Result<(), Failure> {
    let deadline = Instant::now() + EDITOR_TIMEOUT;
    loop {
        let result = EDITORS.lock().ok().and_then(|editors| match editors.as_ref() {
            Some((expected, result)) if expected == id => *result,
            _ => None,
        });
        match result {
            Some(true) => return Ok(()),
            Some(false) => return Err(Failure::EditorBusy),
            None if Instant::now() >= deadline => return Err(Failure::PrepareTimeout),
            None => std::thread::sleep(POLL_INTERVAL),
        }
    }
}

// ── 진행 상황 방송 ────────────────────────────────────────────────────────

// 모든 창에 같은 진행 상황을 보냅니다. (누른 창이 아니어도 알림 띠·설정 창이 진행률을 보여 줄 수 있게)
fn emit_status(
    app: &tauri::AppHandle,
    phase: &str,
    version: &str,
    downloaded: u64,
    total: Option<u64>,
    code: Option<&str>,
) {
    let _ = app.emit(
        "update-install-status",
        serde_json::json!({
            "phase": phase,
            "version": version,
            "downloaded": downloaded,
            "total": total,
            "code": code,
        }),
    );
}

// "v5.5.3"과 "5.5.3"처럼 표기만 다른 버전을 같게 봅니다.
fn same_version(a: &str, b: &str) -> bool {
    let trim = |v: &str| v.trim().trim_start_matches(['v', 'V']).to_string();
    !a.trim().is_empty() && trim(a) == trim(b)
}

fn classify_check_error(error: &tauri_plugin_updater::Error) -> Failure {
    use tauri_plugin_updater::Error as E;
    match error {
        // latest.json이 없거나(404) 이 PC용 항목이 없으면 이 릴리스는 앱 안 설치를 준비하지 않은 것입니다.
        E::ReleaseNotFound
        | E::Serialization(_)
        | E::Semver(_)
        | E::TargetNotFound(_)
        | E::TargetsNotFound(_) => Failure::NotPrepared,
        _ => Failure::CheckFailed,
    }
}

fn classify_download_error(error: &tauri_plugin_updater::Error) -> Failure {
    use tauri_plugin_updater::Error as E;
    match error {
        E::Minisign(_)
        | E::Base64(_)
        | E::SignatureUtf8(_)
        | E::SignedVersionMismatch { .. }
        | E::MissingSignedVersion => Failure::BadSignature,
        _ => Failure::DownloadFailed,
    }
}

// ── 진행 단계 ─────────────────────────────────────────────────────────────

async fn check(
    app: &tauri::AppHandle,
    expected_version: &str,
    cancel: &tokio::sync::Notify,
) -> Result<Update, Failure> {
    let updater = app
        .updater_builder()
        .timeout(CHECK_TIMEOUT)
        .configure_client(|client| client.connect_timeout(CONNECT_TIMEOUT).read_timeout(READ_TIMEOUT))
        .build()
        .map_err(|error| {
            log::error!("업데이터를 준비하지 못했습니다: {error}");
            Failure::CheckFailed
        })?;
    let result = tokio::select! {
        result = updater.check() => result,
        _ = cancel.notified() => return Err(Failure::Cancelled),
    };
    match result {
        Ok(Some(update)) if same_version(&update.version, expected_version) => Ok(update),
        Ok(Some(update)) => {
            log::warn!(
                "안내한 버전({expected_version})과 설치 정보의 버전({})이 달라 설치하지 않습니다.",
                update.version
            );
            Err(Failure::VersionMismatch)
        }
        // latest.json이 아직 지금 버전 이하를 가리킵니다(새 릴리스에 올리지 않은 경우).
        Ok(None) => Err(Failure::NotPrepared),
        Err(error) => {
            log::warn!("업데이트 정보를 확인하지 못했습니다: {error}");
            Err(classify_check_error(&error))
        }
    }
}

async fn download(
    app: &tauri::AppHandle,
    update: &Update,
    cancel: &tokio::sync::Notify,
) -> Result<Vec<u8>, Failure> {
    let version = update.version.clone();
    emit_status(app, "downloading", &version, 0, None, None);

    let progress_app = app.clone();
    let progress_version = version.clone();
    let mut downloaded: u64 = 0;
    let mut last_sent = Instant::now();
    let on_chunk = move |length: usize, total: Option<u64>| {
        downloaded += length as u64;
        if last_sent.elapsed() >= PROGRESS_INTERVAL {
            last_sent = Instant::now();
            emit_status(&progress_app, "downloading", &progress_version, downloaded, total, None);
        }
    };

    // 서명 확인은 download() 안에서 끝납니다. 확인에 실패한 파일은 돌려받지도 않습니다.
    let result = tokio::select! {
        result = update.download(on_chunk, || {}) => result,
        _ = cancel.notified() => return Err(Failure::Cancelled),
    };
    match result {
        Ok(bytes) => {
            let size = bytes.len() as u64;
            emit_status(app, "downloading", &version, size, Some(size), None);
            Ok(bytes)
        }
        Err(error) => {
            log::warn!("설치 파일을 내려받거나 확인하지 못했습니다: {error}");
            Err(classify_download_error(&error))
        }
    }
}

// 설치를 멈췄을 때: 메모 창의 입력 잠금을 풀고, 알림장·명단 창의 잠금도 풉니다.
fn release(app: &tauri::AppHandle, prepare_id: u64, editor_request: Option<&str>) {
    let _ = app.emit("update-prepare-cancel", serde_json::json!({ "id": prepare_id }));
    if let Some(id) = editor_request {
        crate::noticeboard_quit::cancel_update(app, id);
    }
}

// 저장 확인부터 설치 프로그램 실행까지. 기다림이 많아 작업 스레드에서 실행합니다.
fn prepare_and_install(app: &tauri::AppHandle, update: Update, bytes: Vec<u8>) -> Result<(), Failure> {
    let version = update.version.clone();
    // 트레이 "종료"가 이미 시작됐다면 설치하지 않습니다(두 절차가 겹치지 않게).
    if crate::toolkit::QUITTING.load(Ordering::SeqCst) || crate::noticeboard_quit::pending() {
        return Err(Failure::Busy);
    }
    emit_status(app, "preparing", &version, 0, None, None);

    // 1) 알림장·명단: 종료할 때와 같은 절차로 저장을 끝내고 편집을 잠급니다.
    let editor_request = crate::noticeboard_quit::request_for_update(app);
    if let Some(id) = editor_request.as_deref() {
        if let Err(failure) = wait_for_editors(id) {
            crate::noticeboard_quit::cancel_update(app, id);
            return Err(failure);
        }
    }

    // 2) 메모 창: 예약된 저장을 모두 기록하고 입력을 막은 뒤 답합니다.
    let prepare_id = NEXT_PREPARE_ID.fetch_add(1, Ordering::SeqCst);
    if let Err(failure) = wait_for_data_windows(app, prepare_id) {
        release(app, prepare_id, editor_request.as_deref());
        return Err(failure);
    }

    // 3) 답을 받지 않는 마지막 기록(저장소 자동 저장·급식 창 위치)이 파일에 닿을 시간을 줍니다.
    std::thread::sleep(SETTLE_DELAY);

    // 4) 업데이트 직전 사본: 새 버전의 첫 실행에서 문제가 생겨도 이 시점으로 되돌릴 수 있습니다.
    if let Ok(dir) = app.path().app_data_dir() {
        crate::snapshot_before_update(&dir);
    }

    // 5) 파일을 쓰는 다른 작업(툴킷 설정·뽑기·토너먼트)이 끝나기를 기다린 뒤 새로 시작하지 못하게 잡아 둡니다.
    //    왜: 다음 단계에서 앱이 곧바로 끝나므로, 쓰던 도중에 끊긴 파일이 남으면 안 됩니다.
    //    설치에 성공하면 앱이 끝나며 함께 풀리고, 실패하면 이 함수를 나가며 풀립니다.
    let _toolkit_writes = crate::toolkit::STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let _picker_writes = crate::picker::LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let _tournament_writes = crate::tournament::LOCK.lock().unwrap_or_else(|e| e.into_inner());
    crate::toolkit::QUITTING.store(true, Ordering::SeqCst);

    emit_status(app, "installing", &version, 0, None, None);
    // 윈도우에서는 설치 프로그램을 띄운 뒤 곧바로 앱을 끝내므로 이 호출은 돌아오지 않습니다.
    // (설치 프로그램은 수동 조작 없이 진행률만 보여 주고, 끝나면 새 버전을 다시 엽니다)
    match update.install(bytes) {
        Ok(()) => app.restart(),
        Err(error) => {
            log::error!("설치 프로그램을 실행하지 못했습니다: {error}");
            crate::toolkit::QUITTING.store(false, Ordering::SeqCst);
            release(app, prepare_id, editor_request.as_deref());
            Err(Failure::LaunchFailed)
        }
    }
}

async fn run(app: &tauri::AppHandle, expected_version: &str) -> Result<(), Failure> {
    let cancel = Arc::new(tokio::sync::Notify::new());
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);
    if let Ok(mut slot) = CANCEL.lock() {
        *slot = Some(cancel.clone());
    }

    emit_status(app, "checking", expected_version, 0, None, None);
    let fetched = match check(app, expected_version, &cancel).await {
        Ok(update) => download(app, &update, &cancel).await.map(|bytes| (update, bytes)),
        Err(failure) => Err(failure),
    };

    // 저장 확인부터는 되돌리지 않으므로 취소 신호를 거둡니다.
    if let Ok(mut slot) = CANCEL.lock() {
        *slot = None;
    }
    let (update, bytes) = fetched?;
    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
        return Err(Failure::Cancelled);
    }

    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || prepare_and_install(&app, update, bytes))
        .await
        .map_err(|_| Failure::LaunchFailed)?
}

// 새 버전을 내려받아 설치합니다. expected_version은 화면에 안내한 버전입니다.
// 성공하면 앱이 끝나므로 이 명령은 돌아오지 않고, 실패하면 이유 코드를 돌려줍니다.
#[tauri::command]
pub async fn update_install(app: tauri::AppHandle, expected_version: String) -> Result<(), String> {
    if crate::toolkit::QUITTING.load(Ordering::SeqCst)
        || crate::noticeboard_quit::pending()
        || RUNNING.swap(true, Ordering::SeqCst)
    {
        // 진행 중인 설치의 화면을 흔들지 않도록 방송하지 않고 누른 창에만 알립니다.
        return Err(Failure::Busy.code().into());
    }
    let result = run(&app, &expected_version).await;
    RUNNING.store(false, Ordering::SeqCst);
    result.map_err(|failure| {
        let phase = if failure == Failure::Cancelled { "cancelled" } else { "failed" };
        emit_status(&app, phase, &expected_version, 0, None, Some(failure.code()));
        failure.code().to_string()
    })
}

// 내려받기 취소. 저장 확인이 시작된 뒤에는 받아들이지 않습니다(false).
#[tauri::command]
pub fn update_cancel() -> bool {
    let Ok(slot) = CANCEL.lock() else { return false };
    match slot.as_ref() {
        Some(cancel) => {
            CANCEL_REQUESTED.store(true, Ordering::SeqCst);
            cancel.notify_one();
            true
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(list: &[&str]) -> HashSet<String> {
        list.iter().map(|l| l.to_string()).collect()
    }

    #[test]
    fn install_waits_until_every_window_has_saved() {
        let mut prepare = WindowPrepare::new(7, labels(&["main", "note-1"]));
        assert_eq!(prepare.state(), PrepareState::Waiting);
        prepare.answer(7, "main", true);
        assert_eq!(prepare.state(), PrepareState::Waiting);
        // 같은 답이 다시 와도(재방송) 결과는 같습니다.
        prepare.answer(7, "main", true);
        prepare.answer(7, "note-1", true);
        assert_eq!(prepare.state(), PrepareState::Ready);
    }

    #[test]
    fn one_failed_save_stops_the_install() {
        let mut prepare = WindowPrepare::new(1, labels(&["main", "tinynote-2"]));
        prepare.answer(1, "main", true);
        prepare.answer(1, "tinynote-2", false);
        assert_eq!(prepare.state(), PrepareState::Failed);
        // 실패한 창이 닫혀도 실패는 지워지지 않습니다.
        prepare.forget_closed(&labels(&["main"]));
        assert_eq!(prepare.state(), PrepareState::Failed);
    }

    #[test]
    fn stale_or_unknown_answers_are_ignored() {
        let mut prepare = WindowPrepare::new(2, labels(&["main"]));
        // 지난 요청의 답
        prepare.answer(1, "main", true);
        // 명단에 없는 창(설정 창, 도중에 연 창)의 답
        prepare.answer(2, "settings", false);
        prepare.answer(2, "note-3", false);
        assert_eq!(prepare.state(), PrepareState::Waiting);
    }

    #[test]
    fn closed_windows_are_not_awaited() {
        let mut prepare = WindowPrepare::new(3, labels(&["main", "note-2"]));
        prepare.answer(3, "main", true);
        prepare.forget_closed(&labels(&["main"]));
        assert_eq!(prepare.state(), PrepareState::Ready);
        // 창이 하나도 없으면 기다릴 것이 없습니다.
        assert_eq!(WindowPrepare::new(4, HashSet::new()).state(), PrepareState::Ready);
    }

    #[test]
    fn versions_match_regardless_of_the_v_prefix() {
        assert!(same_version("5.5.3", "v5.5.3"));
        assert!(same_version("5.6.0-beta.1", "5.6.0-beta.1"));
        assert!(!same_version("5.5.3", "5.5.4"));
        assert!(!same_version("", ""));
    }

    #[test]
    fn editor_answers_count_once_and_only_for_the_current_request() {
        expect_editors("req-1");
        editors_settled("req-0", false);
        editors_settled("req-1", true);
        // 허락한 뒤 잠금을 풀 때 오는 취소는 결과를 뒤집지 않습니다.
        editors_settled("req-1", false);
        assert_eq!(wait_for_editors("req-1"), Ok(()));

        expect_editors("req-2");
        editors_settled("req-2", false);
        assert_eq!(wait_for_editors("req-2"), Err(Failure::EditorBusy));
    }

    #[test]
    fn failure_codes_are_stable() {
        // 화면(updateChecker.js)과 사용 통계(analytics.rs)가 같은 코드를 씁니다.
        let codes: Vec<&str> = [
            Failure::Busy,
            Failure::NotPrepared,
            Failure::VersionMismatch,
            Failure::CheckFailed,
            Failure::DownloadFailed,
            Failure::BadSignature,
            Failure::Cancelled,
            Failure::EditorBusy,
            Failure::SaveFailed,
            Failure::PrepareTimeout,
            Failure::LaunchFailed,
        ]
        .into_iter()
        .map(Failure::code)
        .collect();
        assert_eq!(
            codes,
            [
                "BUSY",
                "NOT_PREPARED",
                "VERSION_MISMATCH",
                "CHECK_FAILED",
                "DOWNLOAD_FAILED",
                "BAD_SIGNATURE",
                "CANCELLED",
                "EDITOR_BUSY",
                "SAVE_FAILED",
                "PREPARE_TIMEOUT",
                "LAUNCH_FAILED"
            ]
        );
    }
}
