//! 점수판·학급 온도계·학급 투표 저장소.
//!
//! 파일 세 개를 "구역(section)"으로 나눠 저장합니다.
//! - `tidy-task-scoreboard.json`: shared(소리 설정) · personal · group · custom
//! - `tidy-task-thermometer.json`: main
//! - `tidy-task-vote.json`: session(진행 중 투표) · archive(끝난 투표) · draft(만들던 설정) · prefs(소리·음성)
//!
//! 투표의 session은 투표판·선생님 창 두 창이 함께 씁니다. 그래서 아래 revision 충돌(CONFLICT)이 실제로 일어나며,
//!   창이 최신 값을 다시 읽어 자기 변경을 다시 적용합니다(표 넣기는 같은 표가 두 번 들어가지 않는 함수).
//!
//! 왜 구역별 전체 저장인가: 구역마다 쓰는 창이 하나뿐(개인·모둠·커스텀·온도계 창은 각각 1개)이라,
//!   점수 계산 규칙을 JS와 Rust 두 곳에 똑같이 두지 않아도 덮어쓰기가 생기지 않습니다.
//!   여러 창이 함께 쓰는 shared만은 revision이 어긋나면 "CONFLICT"로 거절하고, 창이 최신 값을 다시 읽어
//!   자기 변경을 그 위에 다시 적용합니다(낙관적 동시성).
//! 왜 plugin-store가 아닌 직접 기록인가: 이 파일은 Rust만 만지고, "임시 파일 → 디스크 동기화 → 이름 바꾸기"로
//!   쓰는 도중 꺼져도 반쯤 쓴 파일이 남지 않게 하려는 것입니다.
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};

pub const SCOREBOARD_FILE: &str = "tidy-task-scoreboard.json";
pub const THERMOMETER_FILE: &str = "tidy-task-thermometer.json";
pub const VOTE_FILE: &str = "tidy-task-vote.json";
const SCHEMA_VERSION: u64 = 1;
// 한 구역의 크기 상한. 온도계 기록 300개 × 2개 × 학급 50개도 이 안에 들어갑니다.
const MAX_SECTION_BYTES: usize = 2 * 1024 * 1024;
const MAX_DEPTH: usize = 10;
const MAX_STRING_CHARS: usize = 200;
const MAX_ARRAY_ITEMS: usize = 1000;

// 업데이트 설치 직전에 app_update가 잡아, 쓰는 도중에 앱이 끝나지 않게 합니다.
pub(crate) static LOCK: Mutex<()> = Mutex::new(());
// 파일별 메모리 사본. 한 번 읽은 뒤에는 디스크를 다시 읽지 않습니다(쓰기는 모두 여기를 거침).
static CACHE: Mutex<Option<HashMap<&'static str, Loaded>>> = Mutex::new(None);

#[derive(Clone)]
struct Loaded {
    doc: Value,
    // 더 새 버전 앱이 만든 파일이면 읽기만 하고 덮어쓰지 않습니다.
    read_only: bool,
    // 복구·새로 시작 같은 일을 창에 한 번 알리기 위한 문구(한 번 읽어 가면 지움)
    notice: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    sections: Value,
    read_only: bool,
    notice: Option<String>,
}

fn file_for(store: &str) -> Result<&'static str, String> {
    match store {
        "scoreboard" => Ok(SCOREBOARD_FILE),
        "thermometer" => Ok(THERMOMETER_FILE),
        "vote" => Ok(VOTE_FILE),
        _ => Err("알 수 없는 저장소입니다.".into()),
    }
}

fn section_allowed(store: &str, section: &str) -> bool {
    match store {
        "scoreboard" => matches!(section, "shared" | "personal" | "group" | "custom"),
        "thermometer" => section == "main",
        "vote" => matches!(section, "session" | "archive" | "draft" | "prefs"),
        _ => false,
    }
}

fn empty_doc() -> Value {
    json!({ "schemaVersion": SCHEMA_VERSION, "sections": {} })
}

/// 저장 파일 모양 검사: { schemaVersion, sections: { 이름: { revision, data(객체) } } }
/// 반환: Ok(true) = 더 새 스키마(읽기 전용), Ok(false) = 정상
fn check_doc(doc: &Value) -> Result<bool, String> {
    let obj = doc.as_object().ok_or("저장 파일 형식이 달라요.")?;
    let version = obj.get("schemaVersion").and_then(Value::as_u64).ok_or("저장 파일 버전이 없어요.")?;
    let sections = obj.get("sections").and_then(Value::as_object).ok_or("저장 구역이 없어요.")?;
    if version > SCHEMA_VERSION {
        return Ok(true);
    }
    for (_, section) in sections {
        let s = section.as_object().ok_or("저장 구역 형식이 달라요.")?;
        s.get("revision").and_then(Value::as_u64).ok_or("저장 구역 버전이 없어요.")?;
        check_data(s.get("data").ok_or("저장 내용이 없어요.")?)?;
    }
    Ok(false)
}

/// 구역 내용의 일반 안전 검사. 세부 규칙(점수 범위·이름 길이 등)은 JS normalize가 읽을 때 맞춥니다.
/// 여기서는 손상·비정상 크기의 자료가 파일에 들어가지 않게만 막습니다.
fn check_data(data: &Value) -> Result<(), String> {
    if !data.is_object() {
        return Err("저장할 내용 형식이 달라요.".into());
    }
    let bytes = serde_json::to_vec(data).map_err(|_| "저장할 내용을 읽지 못했어요.")?;
    if bytes.len() > MAX_SECTION_BYTES {
        return Err("저장할 내용이 너무 커요.".into());
    }
    fn walk(v: &Value, depth: usize) -> Result<(), String> {
        if depth > MAX_DEPTH {
            return Err("저장할 내용이 너무 깊어요.".into());
        }
        match v {
            Value::String(s) if s.chars().count() > MAX_STRING_CHARS => Err("글자가 너무 길어요.".into()),
            Value::Number(n) if !n.as_f64().is_some_and(f64::is_finite) => Err("숫자 형식이 달라요.".into()),
            Value::Array(a) if a.len() > MAX_ARRAY_ITEMS => Err("항목이 너무 많아요.".into()),
            Value::Array(a) => a.iter().try_for_each(|x| walk(x, depth + 1)),
            Value::Object(o) => o.values().try_for_each(|x| walk(x, depth + 1)),
            _ => Ok(()),
        }
    }
    walk(data, 0)
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("scores");
    path.with_file_name(format!("{stem}{suffix}"))
}

/// 임시 파일에 쓰고 디스크까지 내린 뒤 이름을 바꿔 교체합니다(Windows에서도 기존 파일을 대체).
pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = sibling(path, ".tmp");
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result.map_err(|e| format!("저장하지 못했어요: {e}"))
}

fn parse_valid(bytes: &[u8]) -> Option<(Value, bool)> {
    let doc: Value = serde_json::from_slice(bytes).ok()?;
    let read_only = check_doc(&doc).ok()?;
    Some((doc, read_only))
}

/// 파일을 읽고 필요하면 복구합니다. 앱 실행마다 처음 한 번만 불립니다.
fn load_file(path: &Path) -> Loaded {
    let backup = sibling(path, ".backup.json");
    let Ok(bytes) = fs::read(path) else {
        // 파일이 없으면 첫 사용입니다. (지워졌는데 백업이 있으면 백업에서 되살립니다)
        if let Some((doc, read_only)) = fs::read(&backup).ok().and_then(|b| parse_valid(&b)) {
            let _ = atomic_write(path, &serde_json::to_vec_pretty(&doc).unwrap_or_default());
            return Loaded { doc, read_only, notice: Some("저장 파일이 없어져 마지막 백업에서 되살렸어요.".into()) };
        }
        return Loaded { doc: empty_doc(), read_only: false, notice: None };
    };
    if let Some((doc, read_only)) = parse_valid(&bytes) {
        // 실행마다 한 번, 정상 파일을 백업해 둡니다.
        if !read_only {
            let _ = atomic_write(&backup, &bytes);
        }
        return Loaded { doc, read_only, notice: None };
    }
    // 손상: 원본을 날짜 붙여 보관하고, 백업이 있으면 백업으로 복구합니다.
    // chrono는 시계 기능 없이 빌드되므로 유닉스 시각(초)으로 이름을 구분합니다.
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let _ = fs::rename(path, sibling(path, &format!(".broken-{stamp}.json")));
    if let Some((doc, read_only)) = fs::read(&backup).ok().and_then(|b| parse_valid(&b)) {
        let _ = atomic_write(path, &serde_json::to_vec_pretty(&doc).unwrap_or_default());
        return Loaded {
            doc,
            read_only,
            notice: Some("저장 파일에 문제가 있어 마지막으로 정상이던 상태로 복구했어요.".into()),
        };
    }
    Loaded {
        doc: empty_doc(),
        read_only: false,
        notice: Some("저장 파일에 문제가 있어 새로 시작했어요. 원래 파일은 따로 보관했어요.".into()),
    }
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn with_cache<T>(dir: &Path, file: &'static str, f: impl FnOnce(&mut Loaded) -> T) -> Result<T, String> {
    let mut guard = CACHE.lock().map_err(|_| "저장 잠금 오류")?;
    let cache = guard.get_or_insert_with(HashMap::new);
    let loaded = cache.entry(file).or_insert_with(|| load_file(&dir.join(file)));
    Ok(f(loaded))
}

fn read_in(dir: &Path, store: &str) -> Result<ReadResult, String> {
    let file = file_for(store)?;
    with_cache(dir, file, |loaded| ReadResult {
        sections: loaded.doc.get("sections").cloned().unwrap_or_else(|| json!({})),
        read_only: loaded.read_only,
        notice: loaded.notice.take(),
    })
}

fn write_in(dir: &Path, store: &str, section: &str, expected: u64, data: Value) -> Result<u64, String> {
    let file = file_for(store)?;
    if !section_allowed(store, section) {
        return Err("알 수 없는 저장 구역입니다.".into());
    }
    check_data(&data)?;
    with_cache(dir, file, |loaded| {
        if loaded.read_only {
            return Err("NEWER_SCHEMA: 더 새 버전의 앱에서 만든 자료라 바꿀 수 없어요.".to_string());
        }
        let current = loaded.doc["sections"][section]["revision"].as_u64().unwrap_or(0);
        if current != expected {
            return Err(format!("CONFLICT:{current}"));
        }
        let next = current.checked_add(1).ok_or("저장 버전 오류")?;
        let mut doc = loaded.doc.clone();
        let sections = doc
            .get_mut("sections")
            .and_then(Value::as_object_mut)
            .ok_or("저장 구역이 없어요.")?;
        sections.insert(section.to_string(), json!({ "revision": next, "data": data }));
        let bytes = serde_json::to_vec_pretty(&doc).map_err(|e| e.to_string())?;
        // 디스크 기록이 성공해야만 메모리 사본을 바꿉니다(실패하면 이전 상태 그대로).
        atomic_write(&dir.join(file), &bytes)?;
        loaded.doc = doc;
        Ok(next)
    })?
}

// 파일 쓰기(디스크 동기화)가 메인 스레드를 막지 않도록 작업 스레드에서 돕니다(toolkit.rs와 같은 이유).
#[tauri::command(async)]
pub fn scores_read(app: tauri::AppHandle, store: String) -> Result<ReadResult, String> {
    let _g = LOCK.lock().map_err(|_| "저장 잠금 오류")?;
    read_in(&data_dir(&app)?, &store)
}

#[tauri::command(async)]
pub fn scores_write(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    store: String,
    section: String,
    expected_revision: u64,
    data: Value,
) -> Result<u64, String> {
    if crate::toolkit::QUITTING.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("앱을 종료하고 있어요.".into());
    }
    let revision = {
        let _g = LOCK.lock().map_err(|_| "저장 잠금 오류")?;
        write_in(&data_dir(&app)?, &store, &section, expected_revision, data)?
    };
    let _ = app.emit(
        "scores-changed",
        json!({ "store": store, "section": section, "revision": revision, "origin": window.label() }),
    );
    Ok(revision)
}

/// 온도계 창의 첫 크기를 정할 때 씁니다: 마지막으로 본 학급의 온도계 수(1 또는 2).
pub(crate) fn last_thermometer_count(app: &tauri::AppHandle) -> usize {
    let Ok(dir) = data_dir(app) else { return 1 };
    let Ok(_g) = LOCK.lock() else { return 1 };
    with_cache(&dir, THERMOMETER_FILE, |loaded| count_in(&loaded.doc)).unwrap_or(1)
}

fn count_in(doc: &Value) -> usize {
    let data = &doc["sections"]["main"]["data"];
    let key = data["lastSetKey"].as_str().unwrap_or("default");
    let n = data["sets"][key]["thermometers"].as_array().map_or(1, Vec::len);
    n.clamp(1, 2)
}

/// 업데이트 설치 직전 사본(`*.before-update.json`). 손상 파일로 이전 사본을 덮지 않습니다.
pub(crate) fn snapshot_before_update(dir: &Path) {
    for file in [SCOREBOARD_FILE, THERMOMETER_FILE, VOTE_FILE] {
        let path = dir.join(file);
        if let Ok(bytes) = fs::read(&path) {
            if parse_valid(&bytes).is_some() {
                let _ = atomic_write(&sibling(&path, ".before-update.json"), &bytes);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tidy-scores-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }
    fn reset_cache() {
        *CACHE.lock().unwrap() = None;
    }
    // CACHE가 전역이라 테스트끼리 섞이지 않도록 한 줄로 세웁니다.
    static SERIAL: Mutex<()> = Mutex::new(());

    #[test]
    fn writes_sections_and_rejects_stale_revision() {
        let _s = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        reset_cache();
        let dir = temp_dir("write");
        assert_eq!(write_in(&dir, "scoreboard", "group", 0, json!({"groups": []})).unwrap(), 1);
        assert_eq!(write_in(&dir, "scoreboard", "group", 1, json!({"groups": [1]})).unwrap(), 2);
        let err = write_in(&dir, "scoreboard", "group", 1, json!({})).unwrap_err();
        assert!(err.starts_with("CONFLICT:2"));
        // 다른 구역은 따로 셉니다.
        assert_eq!(write_in(&dir, "scoreboard", "shared", 0, json!({"sound": true})).unwrap(), 1);
        assert!(write_in(&dir, "scoreboard", "main", 0, json!({})).is_err());
        assert!(write_in(&dir, "thermometer", "group", 0, json!({})).is_err());
        // 다시 읽어도(새 실행) 그대로입니다.
        reset_cache();
        let read = read_in(&dir, "scoreboard").unwrap();
        assert_eq!(read.sections["group"]["revision"], 2);
        assert_eq!(read.sections["group"]["data"]["groups"], json!([1]));
    }

    #[test]
    fn many_rapid_writes_survive_reload() {
        let _s = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        reset_cache();
        let dir = temp_dir("rapid");
        let mut rev = 0;
        for i in 0..300 {
            rev = write_in(&dir, "thermometer", "main", rev, json!({"value": i})).unwrap();
        }
        reset_cache();
        let read = read_in(&dir, "thermometer").unwrap();
        assert_eq!(read.sections["main"]["data"]["value"], 299);
        assert!(!dir.join("tidy-task-thermometer.tmp").exists());
    }

    #[test]
    fn broken_file_is_kept_and_backup_restored() {
        let _s = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        reset_cache();
        let dir = temp_dir("broken");
        write_in(&dir, "scoreboard", "group", 0, json!({"n": 1})).unwrap();
        reset_cache();
        // 두 번째 실행: 정상 파일을 백업합니다.
        read_in(&dir, "scoreboard").unwrap();
        // 파일이 반쯤 잘렸다고 가정합니다.
        fs::write(dir.join(SCOREBOARD_FILE), b"{\"schemaVersion\":1,\"sect").unwrap();
        reset_cache();
        let read = read_in(&dir, "scoreboard").unwrap();
        assert_eq!(read.sections["group"]["data"]["n"], 1);
        assert!(read.notice.is_some());
        let broken = fs::read_dir(&dir).unwrap().filter_map(Result::ok)
            .any(|e| e.file_name().to_string_lossy().contains(".broken-"));
        assert!(broken, "손상된 원본을 보관해야 합니다");
        // 알림은 한 번만
        assert!(read_in(&dir, "scoreboard").unwrap().notice.is_none());
    }

    #[test]
    fn broken_without_backup_starts_empty_and_keeps_original() {
        let _s = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        reset_cache();
        let dir = temp_dir("nobackup");
        fs::write(dir.join(THERMOMETER_FILE), b"not json").unwrap();
        let read = read_in(&dir, "thermometer").unwrap();
        assert_eq!(read.sections, json!({}));
        assert!(read.notice.unwrap().contains("새로 시작"));
    }

    #[test]
    fn newer_schema_is_read_only() {
        let _s = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        reset_cache();
        let dir = temp_dir("future");
        let future = json!({"schemaVersion": 2, "sections": {"main": {"revision": 3, "data": {"x": 1}}}});
        fs::write(dir.join(THERMOMETER_FILE), serde_json::to_vec(&future).unwrap()).unwrap();
        let read = read_in(&dir, "thermometer").unwrap();
        assert!(read.read_only);
        assert!(write_in(&dir, "thermometer", "main", 3, json!({})).unwrap_err().starts_with("NEWER_SCHEMA"));
        let on_disk: Value = serde_json::from_slice(&fs::read(dir.join(THERMOMETER_FILE)).unwrap()).unwrap();
        assert_eq!(on_disk, future);
    }

    #[test]
    fn rejects_unsafe_data() {
        assert!(check_data(&json!([])).is_err());
        assert!(check_data(&json!({"name": "가".repeat(201)})).is_err());
        assert!(check_data(&json!({"list": vec![0; 1001]})).is_err());
        let mut deep = json!(1);
        for _ in 0..12 { deep = json!({"a": deep}); }
        assert!(check_data(&deep).is_err());
        assert!(check_data(&json!({"ok": [1, "두", {"세": true}]})).is_ok());
    }

    #[test]
    fn vote_sections_are_separate_and_conflicts_are_reported() {
        let _s = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        reset_cache();
        let dir = temp_dir("vote");
        for section in ["session", "archive", "draft", "prefs"] {
            assert_eq!(write_in(&dir, "vote", section, 0, json!({"ok": section})).unwrap(), 1, "{section}");
        }
        assert!(write_in(&dir, "vote", "main", 0, json!({})).is_err());
        // 투표판·선생님 창이 같은 revision으로 쓰면 늦은 쪽은 CONFLICT를 받습니다.
        assert_eq!(write_in(&dir, "vote", "session", 1, json!({"ballots": [1]})).unwrap(), 2);
        assert!(write_in(&dir, "vote", "session", 1, json!({"phase": "paused"})).unwrap_err().starts_with("CONFLICT:2"));
        reset_cache();
        let read = read_in(&dir, "vote").unwrap();
        assert_eq!(read.sections["session"]["data"]["ballots"], json!([1]));
        assert_eq!(read.sections["prefs"]["data"]["ok"], "prefs");
    }

    #[test]
    fn full_vote_archive_fits_limits_and_is_snapshotted() {
        let _s = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        reset_cache();
        let dir = temp_dir("vote-archive");
        // 기록 30개 × (표 60장 · 1인 5표) + 결선 묶음 — 가장 큰 기록함도 크기·깊이·배열 한도 안에 들어가야 합니다.
        let ballot = json!({"id": "b_12345678", "p": ["i1", "i2", "i3", "i4", "i5"], "a": 0});
        let item = json!({"id": "i1", "number": 1, "name": "가".repeat(12), "gender": "m", "character": "m1", "color": "berry", "intro": "나".repeat(30)});
        let entry = json!({"id": "v_1", "title": "다".repeat(30), "items": vec![item; 9], "ballots": vec![ballot.clone(); 60],
            "runoffs": [{"id": "v_2", "items": [], "ballots": vec![ballot; 60]}]});
        let archive = json!({"entries": vec![entry; 30]});
        assert!(check_data(&archive).is_ok());
        assert_eq!(write_in(&dir, "vote", "archive", 0, archive).unwrap(), 1);
        snapshot_before_update(&dir);
        assert!(dir.join("tidy-task-vote.before-update.json").exists());
    }

    #[test]
    fn thermometer_count_follows_last_set() {
        let doc = json!({"schemaVersion":1,"sections":{"main":{"revision":1,"data":{
            "lastSetKey":"c1","sets":{"c1":{"thermometers":[{},{}]},"default":{"thermometers":[{}]}}}}}});
        assert_eq!(count_in(&doc), 2);
        assert_eq!(count_in(&empty_doc()), 1);
    }
}
