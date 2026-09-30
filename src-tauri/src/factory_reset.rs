//! 데이터 초기화 — 앱 데이터 폴더를 통째로 비우고 처음 설치한 상태로 다시 시작합니다.
//! (설정 창 → 관리 → 데이터 초기화, 경고 창 두 번을 지난 뒤에만 불립니다)
//!
//! 왜 "지금" 지우지 않고 다음 시작 때 지우는가:
//!   앱이 떠 있는 동안에는 저장 플러그인·점수판 캐시·SQLite 연결이 파일을 쥐고 있고,
//!   창(JS)마다 메모리에 든 내용을 언제든 다시 저장합니다. 특히 저장 플러그인은 앱이 끝날 때
//!   메모리의 내용을 파일로 한 번 더 씁니다. 떠 있는 채로 지우면 지운 파일이 곧바로 되살아납니다.
//!   그래서 "지워 달라"는 표식 파일만 남기고 앱을 다시 시작한 뒤,
//!   어떤 창도 파일을 열기 전(setup 맨 앞)에 폴더를 비웁니다.
//!
//! 지우는 범위: 앱 데이터 폴더(%APPDATA%\com.tidy.task)의 모든 파일과 하위 폴더.
//!   메모(tidy-task-config.json과 백업·업데이트 직전 사본), 툴킷 설정, 학급 명단·알림장(SQLite),
//!   점수판·온도계·투표, 뽑기·토너먼트, 급식 설정, 등록한 글꼴 파일, 통계용 설치 ID까지 포함합니다.
//!   Windows 웹뷰 캐시·localStorage는 별도 앱 로컬 데이터 폴더를 다음 시작 때 함께 비웁니다.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::Manager;

// 표식 파일 이름. 이 파일이 있으면 다음 시작 때 폴더를 비웁니다.
const MARKER_FILE: &str = "factory-reset.pending";
// 설정 창이 "지우는 중" 화면을 그릴 시간을 준 뒤 다시 시작합니다.
const RESTART_DELAY: Duration = Duration::from_millis(600);

// 방금 끝난 이전 실행이 파일을 아직 쥐고 있으면 삭제가 잠깐 실패합니다. 그때 다시 시도하는 횟수와 간격.
const WIPE_ATTEMPTS: u32 = 15;
const WIPE_RETRY_DELAY: Duration = Duration::from_millis(200);
// 이전 실행이 끝나면서 마지막으로 쓴 파일까지 지우려고, 조금 기다렸다가 한 번 더 비웁니다.
const WIPE_SETTLE_DELAY: Duration = Duration::from_millis(400);

// 버튼을 연달아 눌러도 절차가 두 번 시작되지 않게 합니다.
static STARTED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Copy)]
struct Timing {
    attempts: u32,
    retry_delay: Duration,
    settle_delay: Duration,
}

const TIMING: Timing = Timing {
    attempts: WIPE_ATTEMPTS,
    retry_delay: WIPE_RETRY_DELAY,
    settle_delay: WIPE_SETTLE_DELAY,
};

#[derive(Debug, PartialEq, Eq)]
enum Outcome {
    /// 표식이 없습니다(평소의 시작).
    NotRequested,
    /// 표식은 있지만 지우지 않았습니다(이유는 로그에 남깁니다).
    Refused(&'static str),
    /// 비웠습니다. 끝내 지우지 못한 항목이 있으면 함께 돌려줍니다.
    Wiped { leftovers: Vec<PathBuf> },
}

/// 설정 창의 "데이터 초기화" — 표식을 남기고 앱을 다시 시작합니다.
/// 실제 삭제는 다음 시작의 `run_pending`이 합니다. 성공하면 곧 앱이 끝나므로 화면은 기다리기만 하면 됩니다.
#[tauri::command(async)]
pub fn factory_reset(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    // 경고 창 두 번을 거치는 설정 창에서만 받습니다(다른 창의 코드가 실수로 부르지 못하게).
    if window.label() != "settings" {
        return Err("FORBIDDEN".into());
    }
    // 종료·업데이트 설치와 겹치면 하지 않습니다. 두 절차 모두 앱을 끝내므로 순서가 엉킵니다.
    if crate::toolkit::QUITTING.load(Ordering::SeqCst)
        || crate::noticeboard_quit::pending()
        || crate::app_update::is_running()
        || STARTED.swap(true, Ordering::SeqCst)
    {
        return Err("BUSY".into());
    }

    let marked = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .and_then(|dir| write_marker(&dir));
    if let Err(error) = marked {
        STARTED.store(false, Ordering::SeqCst);
        log::error!("데이터 초기화 표식을 남기지 못했습니다: {error}");
        return Err("STORAGE".into());
    }

    // 여기부터는 되돌리지 않습니다. 새 종료·업데이트 절차와 툴킷 저장을 막습니다.
    crate::toolkit::QUITTING.store(true, Ordering::SeqCst);
    std::thread::spawn(move || {
        std::thread::sleep(RESTART_DELAY);
        // 저장 플러그인의 마지막 저장과 "한 번만 실행" 잠금 해제(Exit 알림)를 거친 뒤 새 프로세스를 띄웁니다.
        app.request_restart();
    });
    Ok(())
}

/// 앱을 시작할 때(setup 맨 앞) 부릅니다. 표식이 있으면 앱 데이터 폴더를 비웁니다.
/// 왜 맨 앞인가: 백업 복구(protect_store_file)·통계·온도계 복원보다 먼저 지워야
///   지운 파일을 백업에서 되살리거나, 막 지울 파일을 읽어 들이지 않습니다.
pub(crate) fn run_pending(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let cache_dir = app.path().app_local_data_dir().ok();
    match wipe_with_cache_if_requested(&dir, cache_dir.as_deref(), &app.config().identifier, TIMING) {
        Outcome::NotRequested => {}
        Outcome::Refused(reason) => {
            log::error!("데이터 초기화를 하지 않았습니다: {reason} ({})", dir.display())
        }
        Outcome::Wiped { leftovers } if leftovers.is_empty() => {
            log::warn!("데이터 초기화: 앱 데이터와 웹뷰 캐시 폴더를 비웠습니다.")
        }
        Outcome::Wiped { leftovers } => {
            log::error!("데이터 초기화: 지우지 못한 항목이 있습니다: {leftovers:?}")
        }
    }
}

fn write_marker(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(MARKER_FILE), b"1").map_err(|e| e.to_string())
}

fn is_app_directory(dir: &Path, identifier: &str) -> bool {
    !identifier.is_empty()
        && dir.file_name().and_then(|name| name.to_str()) == Some(identifier)
        // 폴더 이름만 맞는 링크를 따라가 다른 폴더의 내용을 지우지 않습니다.
        && fs::symlink_metadata(dir).map(|meta| !meta.file_type().is_symlink()).unwrap_or(true)
}

// 웹뷰를 만들기 전이어야 캐시 파일을 쥔 프로세스 없이 디스크까지 비울 수 있습니다.
fn wipe_with_cache_if_requested(dir: &Path, cache: Option<&Path>, identifier: &str, timing: Timing) -> Outcome {
    if !dir.join(MARKER_FILE).exists() {
        return Outcome::NotRequested;
    }
    if let Some(cache) = cache {
        if !is_app_directory(cache, identifier) {
            return Outcome::Refused("앱 캐시 폴더가 아닙니다");
        }
    }
    match wipe_if_requested(dir, identifier, timing) {
        Outcome::Wiped { mut leftovers } => {
            // Linux 등에서는 두 경로가 같으므로 이미 비운 폴더를 다시 처리하지 않습니다.
            if let Some(cache) = cache.filter(|cache| *cache != dir && cache.exists()) {
                leftovers.extend(remove_with_retry(cache, timing));
            }
            Outcome::Wiped { leftovers }
        }
        outcome => outcome,
    }
}

fn wipe_if_requested(dir: &Path, identifier: &str, timing: Timing) -> Outcome {
    let marker = dir.join(MARKER_FILE);
    if !marker.exists() {
        return Outcome::NotRequested;
    }
    // 안전 확인: 이름이 앱 식별자인 폴더만 비웁니다.
    // 왜: 경로를 잘못 얻으면(환경 변수 이상 등) 엉뚱한 폴더를 통째로 지우게 됩니다.
    if !is_app_directory(dir, identifier) {
        return Outcome::Refused("앱 데이터 폴더가 아닙니다");
    }
    // 표식부터 지웁니다. 표식을 지우지 못하면 아무것도 지우지 않습니다.
    // 왜: 표식이 남은 채로 비우면 다음 시작 때마다 다시 비워, 새로 쓴 내용이 매번 사라집니다.
    if fs::remove_file(&marker).is_err() {
        return Outcome::Refused("표식 파일을 지우지 못했습니다");
    }

    let mut leftovers = remove_with_retry(dir, timing);
    if !timing.settle_delay.is_zero() {
        std::thread::sleep(timing.settle_delay);
        leftovers = remove_with_retry(dir, timing);
    }
    Outcome::Wiped { leftovers }
}

fn remove_with_retry(dir: &Path, timing: Timing) -> Vec<PathBuf> {
    let mut leftovers = remove_entries(dir);
    for _ in 1..timing.attempts {
        if leftovers.is_empty() {
            break;
        }
        std::thread::sleep(timing.retry_delay);
        leftovers = remove_entries(dir);
    }
    leftovers
}

// 폴더 안의 항목을 모두 지우고, 지우지 못한 경로를 돌려줍니다. 폴더 자체는 남깁니다.
fn remove_entries(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        // 읽기 실패를 "비어 있음"으로 기록하면 초기화를 마친 것으로 오인합니다.
        return if dir.exists() { vec![dir.to_path_buf()] } else { Vec::new() };
    };
    entries
        .filter_map(|entry| match entry {
            Ok(entry) => {
                let path = entry.path();
                (!remove_entry(&path)).then_some(path)
            }
            Err(_) => Some(dir.to_path_buf()),
        })
        .collect()
}

fn remove_entry(path: &Path) -> bool {
    // symlink_metadata: 바로가기(링크)는 따라가지 않고 링크 자체만 지웁니다.
    let Ok(meta) = fs::symlink_metadata(path) else {
        return !path.exists();
    };
    let remove = |path: &Path| {
        if meta.is_dir() {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        }
    };
    if remove(path).is_ok() {
        return true;
    }
    // 읽기 전용 파일은 윈도우에서 지워지지 않으므로 속성을 풀고 한 번 더 시도합니다.
    let mut permissions = meta.permissions();
    if permissions.readonly() {
        #[allow(clippy::permissions_set_readonly_false)]
        permissions.set_readonly(false);
        let _ = fs::set_permissions(path, permissions);
        return remove(path).is_ok();
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    const FAST: Timing = Timing {
        attempts: 2,
        retry_delay: Duration::from_millis(1),
        settle_delay: Duration::ZERO,
    };

    // 이름이 `identifier`인 임시 "앱 데이터 폴더"를 만듭니다.
    fn data_dir(test: &str, identifier: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("tidy-factory-reset-{test}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let dir = root.join(identifier);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn fill(dir: &Path) {
        fs::write(dir.join("tidy-task-config.json"), br#"{"main":{"notes":"memo"}}"#).unwrap();
        fs::write(dir.join("tidy-task-config.backup.json"), br#"{"main":{}}"#).unwrap();
        fs::write(dir.join("tidy-classroom.sqlite3"), b"sqlite").unwrap();
        fs::write(dir.join("내 글꼴.ttf"), b"font").unwrap();
        fs::create_dir_all(dir.join("nested").join("deep")).unwrap();
        fs::write(dir.join("nested").join("deep").join("file.bin"), b"x").unwrap();
    }

    fn entries(dir: &Path) -> usize {
        fs::read_dir(dir).unwrap().count()
    }

    #[test]
    fn nothing_happens_without_the_marker() {
        let dir = data_dir("no-marker", "com.tidy.task");
        fill(&dir);
        assert_eq!(wipe_if_requested(&dir, "com.tidy.task", FAST), Outcome::NotRequested);
        assert_eq!(entries(&dir), 5);
        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn marker_empties_the_folder_but_keeps_the_folder_itself() {
        let dir = data_dir("wipe", "com.tidy.task");
        fill(&dir);
        write_marker(&dir).unwrap();
        assert_eq!(
            wipe_if_requested(&dir, "com.tidy.task", FAST),
            Outcome::Wiped { leftovers: Vec::new() }
        );
        assert!(dir.is_dir());
        assert_eq!(entries(&dir), 0);
        // 표식이 사라졌으므로 다음 시작에는 다시 지우지 않습니다.
        fs::write(dir.join("tidy-task-config.json"), b"{}").unwrap();
        assert_eq!(wipe_if_requested(&dir, "com.tidy.task", FAST), Outcome::NotRequested);
        assert_eq!(entries(&dir), 1);
        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn a_folder_that_is_not_the_app_data_folder_is_never_wiped() {
        let dir = data_dir("wrong-dir", "Documents");
        fill(&dir);
        write_marker(&dir).unwrap();
        assert!(matches!(wipe_if_requested(&dir, "com.tidy.task", FAST), Outcome::Refused(_)));
        assert!(matches!(wipe_if_requested(&dir, "", FAST), Outcome::Refused(_)));
        // 아무것도 지우지 않고 표식도 그대로 둡니다.
        assert_eq!(entries(&dir), 6);
        assert_eq!(fs::read(dir.join("tidy-task-config.json")).unwrap(), br#"{"main":{"notes":"memo"}}"#);
        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn read_only_files_are_removed_too() {
        let dir = data_dir("read-only", "com.tidy.task");
        let locked = dir.join("locked.json");
        fs::write(&locked, b"{}").unwrap();
        let mut permissions = fs::metadata(&locked).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&locked, permissions).unwrap();
        write_marker(&dir).unwrap();
        assert_eq!(
            wipe_if_requested(&dir, "com.tidy.task", FAST),
            Outcome::Wiped { leftovers: Vec::new() }
        );
        assert_eq!(entries(&dir), 0);
        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn reset_also_clears_the_separate_webview_cache() {
        let dir = data_dir("webview", "com.tidy.task");
        let cache = dir.parent().unwrap().join("local").join("com.tidy.task");
        fill(&dir);
        fs::create_dir_all(cache.join("EBWebView").join("Default")).unwrap();
        fs::write(cache.join("EBWebView").join("Default").join("Local Storage"), b"old prefs").unwrap();
        assert_eq!(wipe_with_cache_if_requested(&dir, Some(&cache), "com.tidy.task", FAST), Outcome::NotRequested);
        assert_eq!(entries(&cache), 1);
        write_marker(&dir).unwrap();
        assert_eq!(wipe_with_cache_if_requested(&dir, Some(&cache), "com.tidy.task", FAST), Outcome::Wiped { leftovers: vec![] });
        assert_eq!(entries(&dir), 0);
        assert_eq!(entries(&cache), 0);
        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn unsafe_cache_path_refuses_before_any_data_is_deleted() {
        let dir = data_dir("unsafe-cache", "com.tidy.task");
        fill(&dir);
        write_marker(&dir).unwrap();
        let cache = dir.parent().unwrap().join("Documents");
        fs::create_dir_all(&cache).unwrap();
        fs::write(cache.join("keep.txt"), b"keep").unwrap();
        assert!(matches!(wipe_with_cache_if_requested(&dir, Some(&cache), "com.tidy.task", FAST), Outcome::Refused(_)));
        assert_eq!(entries(&dir), 6);
        assert_eq!(fs::read(cache.join("keep.txt")).unwrap(), b"keep");
        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }

    // 다른 프로그램이 쥐고 있어 지울 수 없는 파일은 남은 목록으로 알리고, 나머지는 모두 지웁니다.
    #[cfg(windows)]
    #[test]
    fn a_file_held_open_is_reported_as_leftover() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = data_dir("held", "com.tidy.task");
        fill(&dir);
        let held_path = dir.join("held.sqlite3");
        fs::write(&held_path, b"db").unwrap();
        // share_mode(0): 삭제를 포함한 어떤 공유도 허락하지 않고 엽니다.
        let held = fs::OpenOptions::new().read(true).share_mode(0).open(&held_path).unwrap();
        write_marker(&dir).unwrap();
        assert_eq!(
            wipe_if_requested(&dir, "com.tidy.task", FAST),
            Outcome::Wiped { leftovers: vec![held_path.clone()] }
        );
        assert_eq!(entries(&dir), 1);
        drop(held);
        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }
}
