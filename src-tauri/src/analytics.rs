//! Content-free PostHog events. One native owner for every webview.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const MAX_QUEUE: usize = 1000;
const MAX_AGE: u64 = 7 * 86400;
const SESSION_IDLE: u64 = 30 * 60;

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn uuid() -> String {
    let mut b = [0u8; 16];
    getrandom::fill(&mut b).expect("OS random source unavailable");
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    let h: String = b.iter().map(|v| format!("{v:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..]
    )
}

#[derive(Clone, Serialize, Deserialize)]
struct Queued {
    at: u64,
    payload: Value,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct Disk {
    install_id: String,
    last_version: String,
    active_day: Option<u64>,
    active_minute: Option<u64>,
    tool_minutes: HashMap<String, u64>,
    action_keys: HashMap<String, u64>,
    project: String,
    queue: Vec<Queued>,
}
struct Engine {
    disk: Disk,
    path: PathBuf,
    token: String,
    host: String,
    version: String,
    test_mode: bool,
    session: String,
    last_activity: Option<u64>,
    used_windows: HashSet<String>,
    started: bool,
    last_sent: Option<u64>,
    transport: &'static str,
}
#[derive(Clone)]
pub struct Analytics(Arc<Mutex<Engine>>);

async fn send_batch(
    client: &reqwest::Client,
    host: &str,
    token: &str,
    batch: &[Value],
) -> Result<reqwest::Response, reqwest::Error> {
    client
        .post(format!("{host}/batch/"))
        .json(&json!({"api_key": token, "batch": batch}))
        .send()
        .await
}

fn window_kind(label: &str) -> &'static str {
    if label == "main" || label.starts_with("note-") {
        "tidy_task"
    } else if label.starts_with("tinynote-") {
        "tiny_note"
    } else if label.starts_with("timer-digital-") {
        "timer_digital"
    } else if label.starts_with("timer-analog-") {
        "timer_analog"
    } else if label.starts_with("timer-hourglass-") {
        "timer_hourglass"
    } else if label.starts_with("timer-stopwatch-") {
        "timer_stopwatch"
    } else {
        match label {
            "toolkit" => "toolkit",
            "roster" => "roster",
            "noticeboard" => "noticeboard",
            "picker" => "picker",
            "tournament" => "tournament",
            "focus-bell" => "focus_bell",
            "dice" => "dice",
            "clock" => "clock",
            "thermometer" | "thermometer-display" => "thermometer",
            "vote" | "vote-teacher" => "vote",
            "seating" | "seating-teacher" | "seating-display" => "seating",
            "scoreboard-personal" | "scoreboard-group" | "scoreboard-custom" => "scoreboard",
            "meal" => "meal",
            "meal-search" => "meal_search",
            "meal-settings" => "meal_settings",
            "settings" => "settings",
            "archive" => "archive",
            "reminder" => "reminder",
            _ => "other",
        }
    }
}

// 창 제목·학생 이름을 받지 않고, 실제 네이티브 창의 고정 분류로만 동작을 허용합니다.
fn action_allowed(event: &str, kind: &str) -> bool {
    match event {
        "dice_rolled" => kind == "dice",
        "timer_started" | "timer_resumed" | "timer_paused" | "timer_completed" => matches!(
            kind,
            "timer_digital" | "timer_analog" | "timer_hourglass" | "timer_stopwatch"
        ),
        "vote_created" | "vote_counting_started" | "vote_completed" => kind == "vote",
        _ => false,
    }
}

// A closed schema: arbitrary text, paths, school identifiers and error messages cannot pass.
fn properties(event: &str, count: Option<u32>, choice: Option<&str>) -> Option<Value> {
    let mut p = json!({});
    match event {
        "dice_rolled" => {
            p["count"] = json!(count.unwrap_or(1).clamp(1, 3));
        }
        "timer_started"
        | "timer_resumed"
        | "timer_paused"
        | "timer_completed"
        | "vote_created"
        | "vote_counting_started"
        | "vote_completed" => {}
        "todo_created" | "todo_completed" | "todo_restored" | "todo_deleted" | "todos_imported"
        | "todos_archived" => {
            p["count"] = json!(count.unwrap_or(1).clamp(1, 10000));
        }
        "note_edited"
        | "note_archived"
        | "meal_copied"
        | "meal_navigated"
        | "settings_applied"
        | "update_download_opened"
        | "update_install_started" => {}
        // 앱 안 업데이트가 멈춘 이유 (app_update.rs의 실패 코드를 소문자로 보냅니다. 사용자가 누른 취소·중복 클릭은 보내지 않습니다)
        "update_install_failed" => {
            let value = choice?;
            if ![
                "not_prepared",
                "version_mismatch",
                "check_failed",
                "download_failed",
                "bad_signature",
                "editor_busy",
                "save_failed",
                "prepare_timeout",
                "launch_failed",
                "unknown",
            ]
            .contains(&value)
            {
                return None;
            }
            p["error_code"] = json!(value);
        }
        "theme_changed" => {
            let value = choice?;
            if ![
                "white",
                "amber",
                "blue",
                "green",
                "rose",
                "purple",
                "slate",
                "sea-glass",
                "apricot",
                "pistachio",
                "periwinkle",
                "mauve",
                "linen",
                "kraft",
                "sepia",
                "tiny-dark",
            ]
            .contains(&value)
            {
                return None;
            }
            p["theme"] = json!(value);
        }
        "app_error" => {
            let value = choice?;
            if ![
                "frontend_error",
                "unhandled_rejection",
                "storage_write",
                "meal_load",
                "meal_copy",
                "archive_write",
            ]
            .contains(&value)
            {
                return None;
            }
            p["error_code"] = json!(value);
        }
        _ => return None,
    }
    Some(p)
}

impl Engine {
    fn bind_project(&mut self) -> bool {
        // The project token is public, but storing only a stable fingerprint keeps
        // unnecessary credentials out of the local analytics state file.
        let mut fingerprint = 0xcbf29ce484222325u64;
        for byte in self.host.bytes().chain([b'|']).chain(self.token.bytes()) {
            fingerprint ^= u64::from(byte);
            fingerprint = fingerprint.wrapping_mul(0x100000001b3);
        }
        let project = format!("v1:{fingerprint:016x}");
        if self.disk.project == project {
            return false;
        }
        if !self.disk.project.is_empty() {
            // 다른 PostHog 프로젝트의 대기 이벤트와 설치 ID가 새 프로젝트로 넘어가면 안 됩니다.
            self.disk = Disk::default();
        } else {
            // Legacy files cannot prove the destination of pending events.
            self.disk.queue.clear();
        }
        self.disk.project = project;
        true
    }
    fn configured(&self) -> bool {
        !self.token.is_empty()
    }
    fn enabled(&self) -> bool {
        self.configured()
    }
    fn prune(&mut self, at: u64) {
        self.disk
            .queue
            .retain(|e| at.saturating_sub(e.at) <= MAX_AGE);
        let excess = self.disk.queue.len().saturating_sub(MAX_QUEUE);
        self.disk.queue.drain(..excess);
    }
    fn persist(&self) -> Result<(), String> {
        let parent = self.path.parent().ok_or("storage_unavailable")?;
        std::fs::create_dir_all(parent).map_err(|_| "storage_unavailable")?;
        let bytes = serde_json::to_vec(&self.disk).map_err(|_| "storage_unavailable")?;
        let temp = self.path.with_extension("tmp");
        std::fs::write(&temp, bytes).map_err(|_| "storage_unavailable")?;
        std::fs::rename(temp, &self.path).map_err(|_| "storage_unavailable".into())
    }
    fn push(&mut self, event: &str, mut props: Value, at: u64) {
        props["distinct_id"] = json!(self.disk.install_id);
        props["$process_person_profile"] = json!(false);
        props["$geoip_disable"] = json!(true);
        props["$ip"] = json!("0.0.0.0");
        props["app_version"] = json!(self.version);
        props["os"] = json!(std::env::consts::OS);
        props["arch"] = json!(std::env::consts::ARCH);
        props["schema_version"] = json!(2);
        props["environment"] = json!(if self.test_mode { "test" } else { "production" });
        if !self.session.is_empty() {
            props["$session_id"] = json!(self.session);
        }
        let timestamp = chrono::DateTime::from_timestamp(at as i64, 0)
            .unwrap_or_default()
            .to_rfc3339();
        self.disk.queue.push(Queued {
            at,
            payload: json!({
                "uuid": uuid(), "event": event, "distinct_id": self.disk.install_id,
                "timestamp": timestamp, "properties": props,
            }),
        });
        self.prune(at);
    }
    fn start(&mut self, at: u64) {
        if !self.enabled() || self.started {
            return;
        }
        if self.disk.install_id.is_empty() {
            self.disk.install_id = uuid();
            self.push("installation_first_seen", json!({}), at);
        }
        if self.disk.last_version != self.version {
            self.push("app_version_seen", json!({}), at);
            self.disk.last_version = self.version.clone();
        }
        self.push("app_started", json!({}), at);
        self.started = true;
    }
    fn activity(&mut self, kind: &str, at: u64) {
        if !self.enabled() {
            return;
        }
        self.start(at);
        if self
            .last_activity
            .map_or(true, |t| at.saturating_sub(t) >= SESSION_IDLE)
        {
            self.session = uuid();
            self.used_windows.clear();
            self.push("session_started", json!({"window_kind": kind}), at);
        }
        self.last_activity = Some(at);
        if self.disk.active_day != Some(at / 86400) {
            self.disk.active_day = Some(at / 86400);
            self.push("app_active", json!({}), at);
        }
        if self.disk.active_minute != Some(at / 60) {
            self.disk.active_minute = Some(at / 60);
            self.push("active_minute", json!({"window_kind": kind}), at);
        }
        // 앱 전체의 분 중복 제거와 별개입니다. 같은 분에 투표와 주사위를 쓰면 각각 남겨야 합니다.
        // 선생님/표시 창은 같은 kind이고, 디스크에 보존하므로 창 재열기·앱 재시작에도 중복되지 않습니다.
        if self.disk.tool_minutes.get(kind) != Some(&(at / 60)) {
            self.disk.tool_minutes.insert(kind.to_string(), at / 60);
            self.push("tool_active_minute", json!({"window_kind": kind}), at);
        }
        if self.used_windows.insert(kind.to_string()) {
            self.push("window_used", json!({"window_kind": kind}), at);
        }
    }

    fn track(
        &mut self,
        kind: &str,
        event: &str,
        count: Option<u32>,
        choice: Option<&str>,
        operation: Option<&str>,
        at: u64,
    ) -> Result<(), String> {
        if !self.enabled() {
            return Ok(());
        }
        if event == "activity" {
            self.activity(kind, at);
            return Ok(());
        }
        let mut p = properties(event, count, choice).ok_or("invalid_event")?;
        let action =
            event.starts_with("timer_") || event.starts_with("vote_") || event == "dice_rolled";
        if action {
            if !action_allowed(event, kind) {
                return Err("invalid_window".into());
            }
            let key = operation.ok_or("missing_operation")?;
            if key.is_empty()
                || key.len() > 128
                || !key
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            {
                return Err("invalid_operation".into());
            }
            // 무작위 작업 ID는 로컬 중복 방지에만 쓰며 PostHog에는 보내지 않습니다.
            let local_key = format!("{event}:{key}");
            if self.disk.action_keys.contains_key(&local_key) {
                return Ok(());
            }
            self.disk
                .action_keys
                .retain(|_, time| at.saturating_sub(*time) <= MAX_AGE);
            if self.disk.action_keys.len() >= MAX_QUEUE {
                if let Some(oldest) = self
                    .disk
                    .action_keys
                    .iter()
                    .min_by_key(|(_, time)| *time)
                    .map(|(key, _)| key.clone())
                {
                    self.disk.action_keys.remove(&oldest);
                }
            }
            self.disk.action_keys.insert(local_key, at);
        }
        // 완료·복원 저장·오류처럼 사용자 입력 없이 생기는 이벤트가 활성 설치 수를 부풀리지 않게 합니다.
        if !matches!(
            event,
            "app_error" | "timer_completed" | "vote_completed" | "update_install_failed"
        ) {
            self.activity(kind, at);
        } else {
            self.start(at);
        }
        p["window_kind"] = json!(kind);
        self.push(event, p, at);
        Ok(())
    }
}

pub fn setup(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let test_mode = cfg!(debug_assertions);
    let path = dir.join(if test_mode {
        "tidy-task-analytics-test.json"
    } else {
        "tidy-task-analytics.json"
    });
    let disk = std::fs::read(&path)
        .ok()
        .and_then(|b| serde_json::from_slice::<Disk>(&b).ok())
        .unwrap_or_default();
    let raw_token = option_env!("POSTHOG_PROJECT_TOKEN").unwrap_or("");
    let host = option_env!("POSTHOG_HOST").unwrap_or("https://us.i.posthog.com");
    let allowed = (!test_mode || option_env!("POSTHOG_DEV_ENABLED") == Some("1"))
        && (raw_token.starts_with("phc_") || raw_token.starts_with("ph_project_"))
        && ["https://us.i.posthog.com", "https://eu.i.posthog.com"].contains(&host);
    let mut engine = Engine {
        disk,
        path,
        token: if allowed {
            raw_token.into()
        } else {
            String::new()
        },
        host: host.into(),
        version: app.package_info().version.to_string(),
        test_mode,
        session: String::new(),
        last_activity: None,
        used_windows: HashSet::new(),
        started: false,
        last_sent: None,
        transport: "idle",
    };
    let project_changed = engine.configured() && engine.bind_project();
    engine.prune(now());
    engine.start(now());
    if (project_changed || engine.enabled()) && engine.persist().is_err() {
        // 설치 ID를 안정적으로 보존할 수 없으면 매 실행을 새 이용자로 잘못 세게 됩니다.
        // 이 경우에는 해당 실행의 통계를 끄고 다음 실행에서 저장소를 다시 확인합니다.
        engine.disk.queue.clear();
        engine.token.clear();
    }
    let shared = Analytics(Arc::new(Mutex::new(engine)));
    app.manage(shared.clone());
    std::thread::spawn(move || {
        tauri::async_runtime::block_on(async move {
            let Ok(client) = reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .redirect(reqwest::redirect::Policy::none())
                .build()
            else {
                return;
            };
            let mut delay = 15;
            loop {
                std::thread::sleep(Duration::from_secs(delay));
                let batch = {
                    let Ok(mut e) = shared.0.lock() else {
                        return;
                    };
                    e.prune(now());
                    if !e.enabled() || e.disk.queue.is_empty() {
                        continue;
                    }
                    (
                        e.token.clone(),
                        e.host.clone(),
                        e.disk.install_id.clone(),
                        e.disk
                            .queue
                            .iter()
                            .take(50)
                            .map(|q| q.payload.clone())
                            .collect::<Vec<_>>(),
                    )
                };
                let response = send_batch(&client, &batch.1, &batch.0, &batch.3).await;
                let Ok(mut e) = shared.0.lock() else {
                    return;
                };
                // An opt-out/re-opt-in while a request was in flight must not mutate the new queue.
                if !e.enabled() || e.disk.install_id != batch.2 {
                    continue;
                }
                if response.as_ref().is_ok_and(|r| r.status().is_success()) {
                    let ids: HashSet<&str> =
                        batch.3.iter().filter_map(|p| p["uuid"].as_str()).collect();
                    e.disk.queue.retain(|q| {
                        !q.payload["uuid"]
                            .as_str()
                            .is_some_and(|id| ids.contains(id))
                    });
                    e.last_sent = Some(now());
                    e.transport = "ok";
                    delay = 15;
                } else {
                    e.transport = if response
                        .as_ref()
                        .is_ok_and(|r| matches!(r.status().as_u16(), 400 | 401 | 403 | 404))
                    {
                        "configuration_error"
                    } else {
                        "retrying"
                    };
                    delay = (delay * 2).min(900);
                }
                if e.persist().is_err() {
                    e.transport = "storage_error";
                }
            }
        });
    });
}

#[tauri::command(async)]
pub fn analytics_track(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Analytics>,
    event: String,
    count: Option<u32>,
    choice: Option<String>,
    operation: Option<String>,
) -> Result<(), String> {
    let mut e = state.0.lock().map_err(|_| "unavailable")?;
    if !e.enabled() {
        return Ok(());
    }
    let kind = window_kind(window.label());
    let at = now();
    e.track(
        kind,
        &event,
        count,
        choice.as_deref(),
        operation.as_deref(),
        at,
    )?;
    e.persist()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn engine() -> Engine {
        Engine {
            disk: Disk::default(),
            path: std::env::temp_dir().join(format!("analytics-{}.json", uuid())),
            token: "phc_test".into(),
            host: "https://us.i.posthog.com".into(),
            version: "5.1.2".into(),
            test_mode: true,
            session: String::new(),
            last_activity: None,
            used_windows: HashSet::new(),
            started: false,
            last_sent: None,
            transport: "idle",
        }
    }
    fn count(e: &Engine, name: &str) -> usize {
        e.disk
            .queue
            .iter()
            .filter(|q| q.payload["event"] == name)
            .count()
    }
    #[test]
    fn every_registered_tool_and_surface_has_an_explicit_classification() {
        for role in crate::toolkit::TOOL_ROLES
            .into_iter()
            .chain(crate::toolkit::SCOREBOARD_ROLES)
        {
            assert_ne!(window_kind(role), "other", "통계 분류가 빠진 창: {role}");
        }
        for id in crate::toolkit::TOOL_IDS {
            if id != "timer" && id != "scoreboard" {
                assert_ne!(window_kind(id), "other", "통계 분류가 빠진 도구: {id}");
            }
        }
        for kind in crate::toolkit::KINDS {
            let label = format!("timer-{kind}-random-id");
            assert_ne!(window_kind(&label), "other");
        }
        assert_eq!(window_kind("vote"), window_kind("vote-teacher"));
        assert_eq!(window_kind("seating"), window_kind("seating-display"));
        assert_eq!(window_kind("unknown-private-title"), "other");
    }
    #[test]
    fn tool_minutes_are_independent_and_survive_restart_and_midnight() {
        let mut e = engine();
        let at = 15 * 3600 - 1;
        e.activity(window_kind("vote"), at);
        e.activity(window_kind("vote-teacher"), at);
        e.activity(window_kind("dice"), at);
        assert_eq!(count(&e, "active_minute"), 1);
        assert_eq!(count(&e, "tool_active_minute"), 2);
        let mut next = engine();
        next.disk = serde_json::from_slice(&serde_json::to_vec(&e.disk).unwrap()).unwrap();
        next.activity("vote", at);
        assert_eq!(count(&next, "tool_active_minute"), 2);
        next.activity("vote", at + 1);
        assert_eq!(count(&next, "tool_active_minute"), 3);
    }
    #[test]
    fn action_retries_are_deduplicated_without_exporting_operation_ids() {
        let mut e = engine();
        e.track(
            "vote",
            "vote_created",
            None,
            Some("private title"),
            Some("v_random123"),
            100,
        )
        .unwrap();
        let mut next = engine();
        next.disk = e.disk.clone();
        next.track("vote", "vote_created", None, None, Some("v_random123"), 101)
            .unwrap();
        next.track(
            "vote",
            "vote_completed",
            None,
            None,
            Some("v_random123"),
            102,
        )
        .unwrap();
        assert_eq!(count(&next, "vote_created"), 1);
        assert_eq!(count(&next, "vote_completed"), 1);
        let payload = serde_json::to_string(
            &next
                .disk
                .queue
                .iter()
                .map(|q| &q.payload)
                .collect::<Vec<_>>(),
        )
        .unwrap();
        assert!(!payload.contains("v_random123"));
        assert!(!payload.contains("private title"));
        assert!(next
            .track("dice", "vote_created", None, None, Some("id"), 103)
            .is_err());
        assert!(next
            .track("dice", "dice_rolled", None, None, Some("student name"), 103)
            .is_err());
        assert!(next
            .track("dice", "dice_rolled", None, None, None, 103)
            .is_err());
    }
    #[test]
    fn background_completion_does_not_create_activity() {
        let mut e = engine();
        e.track(
            "timer_digital",
            "timer_completed",
            None,
            None,
            Some("run-1"),
            100,
        )
        .unwrap();
        e.track("vote", "vote_completed", None, None, Some("vote-1"), 101)
            .unwrap();
        assert_eq!(count(&e, "tool_active_minute"), 0);
        assert_eq!(count(&e, "active_minute"), 0);
        assert_eq!(count(&e, "session_started"), 0);
    }
    #[test]
    #[ignore = "명시적으로 실행할 때만 environment=test 이벤트를 운영 프로젝트로 전송"]
    fn live_posthog_delivery_smoke() {
        let mut e = engine();
        e.version = env!("CARGO_PKG_VERSION").into();
        e.token = option_env!("POSTHOG_PROJECT_TOKEN").unwrap_or("").into();
        assert!(e.token.len() > 16, "빌드 시 공개 프로젝트 토큰 필요");
        let at = now();
        e.track("dice", "dice_rolled", Some(3), None, Some("smoke-dice"), at)
            .unwrap();
        e.track(
            "timer_digital",
            "timer_started",
            None,
            None,
            Some("smoke-timer"),
            at,
        )
        .unwrap();
        e.track(
            "timer_digital",
            "timer_completed",
            None,
            None,
            Some("smoke-timer"),
            at + 1,
        )
        .unwrap();
        e.track("vote", "vote_created", None, None, Some("smoke-vote"), at)
            .unwrap();
        e.track(
            "vote",
            "vote_counting_started",
            None,
            None,
            Some("smoke-vote"),
            at,
        )
        .unwrap();
        e.track(
            "vote",
            "vote_completed",
            None,
            None,
            Some("smoke-vote"),
            at + 1,
        )
        .unwrap();
        let batch: Vec<Value> = e.disk.queue.iter().map(|q| q.payload.clone()).collect();
        tauri::async_runtime::block_on(async {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(15))
                .build()
                .unwrap();
            let response = send_batch(&client, &e.host, &e.token, &batch)
                .await
                .unwrap();
            assert!(response.status().is_success());
        });
        println!(
            "TEST DELIVERY: version={} distinct_id={} events={} timestamp={at}",
            e.version,
            e.disk.install_id,
            batch.len()
        );
    }
    #[test]
    fn background_start_is_not_active_usage() {
        let mut e = engine();
        e.start(100);
        e.start(101);
        assert_eq!(count(&e, "app_started"), 1);
        assert_eq!(count(&e, "app_active"), 0);
        assert_eq!(count(&e, "installation_first_seen"), 1);
    }
    #[test]
    fn multiwindow_activity_deduplicates_install_day_minute_and_session() {
        let mut e = engine();
        e.activity("tidy_task", 120);
        e.activity("tiny_note", 121);
        e.activity("tidy_task", 122);
        assert_eq!(count(&e, "app_active"), 1);
        assert_eq!(count(&e, "active_minute"), 1);
        assert_eq!(count(&e, "session_started"), 1);
        assert_eq!(count(&e, "window_used"), 2);
        let id = e.disk.install_id.clone();
        e.activity("meal", 2000);
        assert_eq!(count(&e, "session_started"), 2);
        assert_eq!(e.disk.install_id, id);
        e.activity("meal", 86401);
        assert_eq!(count(&e, "app_active"), 2);
    }
    #[test]
    fn schema_rejects_content_and_unknown_events() {
        assert!(properties("arbitrary", None, None).is_none());
        assert!(properties("app_error", None, Some("secret file path")).is_none());
        assert!(properties("theme_changed", None, Some("school name")).is_none());
        assert!(properties(
            "update_install_failed",
            None,
            Some("disk full at secret path")
        )
        .is_none());
        assert!(properties("update_install_failed", None, None).is_none());
        assert_eq!(
            properties("update_install_failed", None, Some("save_failed")),
            Some(json!({"error_code":"save_failed"}))
        );
        assert_eq!(
            properties("update_install_started", Some(3), Some("x")),
            Some(json!({}))
        );
        assert_eq!(
            properties("todo_created", Some(u32::MAX), Some("secret")),
            Some(json!({"count":10000}))
        );
    }
    #[test]
    fn queue_is_bounded_and_expired_events_are_removed() {
        let mut e = engine();
        e.start(1);
        for i in 0..1100 {
            e.push("note_edited", json!({}), 2 + i);
        }
        assert_eq!(e.disk.queue.len(), MAX_QUEUE);
        e.prune(MAX_AGE + 2000);
        assert!(e.disk.queue.is_empty());
    }
    #[test]
    fn persisted_retry_preserves_identity_uuid_and_timestamp() {
        let mut e = engine();
        e.activity("meal", 100);
        e.persist().unwrap();
        let disk: Disk = serde_json::from_slice(&std::fs::read(&e.path).unwrap()).unwrap();
        assert_eq!(disk.install_id, e.disk.install_id);
        assert_eq!(disk.queue[0].payload, e.disk.queue[0].payload);
        assert_eq!(
            disk.queue[0].payload["properties"]["$process_person_profile"],
            false
        );
        std::fs::remove_file(e.path).unwrap();
    }
    #[test]
    fn missing_configuration_collects_nothing() {
        let mut e = engine();
        e.token.clear();
        e.activity("meal", 100);
        assert!(e.disk.queue.is_empty());
        assert!(e.disk.install_id.is_empty());
    }
    #[test]
    fn restart_keeps_install_identity_and_does_not_repeat_first_seen() {
        let mut e = engine();
        e.activity("meal", 100);
        let mut next = engine();
        next.disk = e.disk.clone();
        next.disk.queue.clear();
        next.activity("tiny_note", 101);
        assert_eq!(next.disk.install_id, e.disk.install_id);
        assert_eq!(count(&next, "installation_first_seen"), 0);
        assert_eq!(count(&next, "app_version_seen"), 0);
        assert_eq!(count(&next, "app_active"), 0);
        assert_eq!(count(&next, "active_minute"), 0);
        next.activity("tiny_note", 120);
        assert_eq!(count(&next, "active_minute"), 1);
        next.version = "5.2.0".into();
        next.started = false;
        next.start(102);
        assert_eq!(count(&next, "app_version_seen"), 1);
    }
    #[test]
    fn project_change_cannot_forward_another_projects_queue() {
        let mut e = engine();
        e.bind_project();
        assert!(!e.disk.project.contains("phc_test"));
        e.activity("meal", 100);
        let id = e.disk.install_id.clone();
        let original = e.disk.queue[0].payload.clone();
        e.bind_project();
        assert_eq!(e.disk.install_id, id);
        assert_eq!(e.disk.queue[0].payload, original);
        e.token = "phc_another_project".into();
        e.bind_project();
        assert!(e.disk.queue.is_empty());
        assert!(e.disk.install_id.is_empty());
    }
    #[test]
    fn legacy_migration_keeps_identity_but_drops_unscoped_pending_events() {
        let mut e = engine();
        e.activity("meal", 100);
        let id = e.disk.install_id.clone();
        e.bind_project();
        assert_eq!(e.disk.install_id, id);
        assert!(e.disk.queue.is_empty());
    }
    #[test]
    fn old_opt_out_file_migrates_to_automatic_collection() {
        let legacy =
            br#"{"consent":false,"install_id":"","last_version":"","project":"","queue":[]}"#;
        let disk: Disk = serde_json::from_slice(legacy).unwrap();
        let mut e = engine();
        e.disk = disk;
        e.activity("meal", 100);
        assert!(!e.disk.install_id.is_empty());
        assert_eq!(count(&e, "installation_first_seen"), 1);
        assert_eq!(count(&e, "active_minute"), 1);
    }
    #[test]
    fn activity_crossing_korean_midnight_is_observable_on_both_days() {
        let mut e = engine();
        // 15:00 UTC = 00:00 Asia/Seoul, inside the same UTC day.
        e.activity("meal", 15 * 3600 - 1);
        e.activity("meal", 15 * 3600);
        assert_eq!(count(&e, "active_minute"), 2);
        assert_eq!(count(&e, "app_active"), 1);
    }
    #[test]
    fn actual_http_batch_has_expected_posthog_contract() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let host = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut chunk = [0; 4096];
            loop {
                let size = stream.read(&mut chunk).unwrap();
                assert!(size > 0);
                bytes.extend_from_slice(&chunk[..size]);
                if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&bytes[..end]);
                    assert!(header.starts_with("POST /batch/ HTTP/1.1"));
                    let length: usize = header
                        .lines()
                        .find_map(|l| {
                            l.to_lowercase()
                                .strip_prefix("content-length:")
                                .map(|s| s.trim().parse().unwrap())
                        })
                        .unwrap();
                    if bytes.len() >= end + 4 + length {
                        let body: Value =
                            serde_json::from_slice(&bytes[end + 4..end + 4 + length]).unwrap();
                        stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 12\r\nConnection: close\r\n\r\n{\"status\":1}").unwrap();
                        return body;
                    }
                }
            }
        });
        let mut e = engine();
        e.activity("tidy_task", 100);
        let batch: Vec<Value> = e.disk.queue.iter().map(|q| q.payload.clone()).collect();
        tauri::async_runtime::block_on(async {
            let client = reqwest::Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap();
            assert!(send_batch(&client, &host, "phc_test", &batch)
                .await
                .unwrap()
                .status()
                .is_success());
        });
        let body = server.join().unwrap();
        assert_eq!(body["api_key"], "phc_test");
        assert_eq!(body["batch"], json!(batch));
        for event in body["batch"].as_array().unwrap() {
            assert_eq!(event["distinct_id"], e.disk.install_id);
            assert!(event["uuid"].as_str().unwrap().len() == 36);
            assert_eq!(event["properties"]["$geoip_disable"], true);
        }
    }
}
