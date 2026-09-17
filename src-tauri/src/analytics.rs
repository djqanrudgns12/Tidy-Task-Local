//! Content-free PostHog events. One native owner for every webview.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
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
    consent: Option<bool>,
    install_id: String,
    last_version: String,
    active_day: Option<u64>,
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
    active_minute: Option<u64>,
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

#[derive(Serialize)]
pub struct Status {
    configured: bool,
    consent: Option<bool>,
    queued: usize,
    last_sent: Option<u64>,
    transport: String,
    region: String,
}

fn window_kind(label: &str) -> &'static str {
    if label == "main" || label.starts_with("note-") {
        "tidy_task"
    } else if label.starts_with("tinynote-") {
        "tiny_note"
    } else {
        match label {
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

// A closed schema: arbitrary text, paths, school identifiers and error messages cannot pass.
fn properties(event: &str, count: Option<u32>, choice: Option<&str>) -> Option<Value> {
    let mut p = json!({});
    match event {
        "todo_created" | "todo_completed" | "todo_restored" | "todo_deleted" | "todos_imported"
        | "todos_archived" => {
            p["count"] = json!(count.unwrap_or(1).clamp(1, 10000));
        }
        "note_edited"
        | "note_archived"
        | "meal_copied"
        | "meal_navigated"
        | "settings_applied"
        | "update_download_opened" => {}
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
    fn configured(&self) -> bool {
        !self.token.is_empty()
    }
    fn enabled(&self) -> bool {
        self.configured() && self.disk.consent == Some(true)
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
        props["schema_version"] = json!(1);
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
        if self.active_minute != Some(at / 60) {
            self.active_minute = Some(at / 60);
            self.push("active_minute", json!({"window_kind": kind}), at);
        }
        if self.used_windows.insert(kind.to_string()) {
            self.push("window_used", json!({"window_kind": kind}), at);
        }
    }
    fn status(&self) -> Status {
        Status {
            configured: self.configured(),
            consent: self.disk.consent,
            queued: self.disk.queue.len(),
            last_sent: self.last_sent,
            transport: self.transport.into(),
            region: if self.host.contains("eu.i.") {
                "EU"
            } else {
                "US"
            }
            .into(),
        }
    }
    fn consent(&mut self, enabled: bool, at: u64) -> Result<(), String> {
        if enabled && !self.configured() {
            return Err("not_configured".into());
        }
        let previous = self.disk.clone();
        if enabled {
            self.disk.consent = Some(true);
            self.start(at);
        } else {
            self.disk = Disk {
                consent: Some(false),
                ..Disk::default()
            };
            self.session.clear();
            self.last_activity = None;
            self.active_minute = None;
            self.used_windows.clear();
            self.started = false;
        }
        if let Err(error) = self.persist() {
            // Fail closed even if a preference cannot be saved.
            self.disk = previous;
            self.disk.consent = Some(false);
            self.disk.queue.clear();
            self.started = false;
            return Err(error);
        }
        Ok(())
    }
}

pub fn setup(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let path = dir.join("tidy-task-analytics.json");
    let disk = std::fs::read(&path)
        .ok()
        .and_then(|b| serde_json::from_slice::<Disk>(&b).ok())
        .unwrap_or_default();
    let raw_token = option_env!("POSTHOG_PROJECT_TOKEN").unwrap_or("");
    let host = option_env!("POSTHOG_HOST").unwrap_or("https://us.i.posthog.com");
    let test_mode = cfg!(debug_assertions);
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
        active_minute: None,
        used_windows: HashSet::new(),
        started: false,
        last_sent: None,
        transport: "idle",
    };
    engine.prune(now());
    engine.start(now());
    if engine.enabled() && engine.persist().is_err() {
        engine.disk.consent = Some(false);
        engine.disk.queue.clear();
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

#[tauri::command]
pub fn analytics_status(state: tauri::State<'_, Analytics>) -> Result<Status, String> {
    state
        .0
        .lock()
        .map(|e| e.status())
        .map_err(|_| "unavailable".into())
}
#[tauri::command]
pub fn analytics_consent(
    state: tauri::State<'_, Analytics>,
    enabled: bool,
) -> Result<Status, String> {
    let mut e = state.0.lock().map_err(|_| "unavailable")?;
    e.consent(enabled, now())?;
    Ok(e.status())
}
#[tauri::command]
pub fn analytics_track(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Analytics>,
    event: String,
    count: Option<u32>,
    choice: Option<String>,
) -> Result<(), String> {
    let mut e = state.0.lock().map_err(|_| "unavailable")?;
    if !e.enabled() {
        return Ok(());
    }
    let kind = window_kind(window.label());
    let at = now();
    if event == "activity" {
        e.activity(kind, at);
    } else if let Some(mut p) = properties(&event, count, choice.as_deref()) {
        // Background failures must not become active users or sessions.
        if event != "app_error" {
            e.activity(kind, at);
        }
        p["window_kind"] = json!(kind);
        e.push(&event, p, at);
    } else {
        return Err("invalid_event".into());
    }
    e.persist()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn engine() -> Engine {
        Engine {
            disk: Disk {
                consent: Some(true),
                ..Disk::default()
            },
            path: std::env::temp_dir().join(format!("analytics-{}.json", uuid())),
            token: "phc_test".into(),
            host: "https://us.i.posthog.com".into(),
            version: "5.1.0".into(),
            test_mode: true,
            session: String::new(),
            last_activity: None,
            active_minute: None,
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
        assert_eq!(
            properties("todo_created", Some(u32::MAX), Some("secret")),
            Some(json!({"count":10000}))
        );
    }
    #[test]
    fn opt_out_clears_queue_identity_and_blocks_new_events() {
        let mut e = engine();
        e.activity("meal", 100);
        e.consent(false, 101).unwrap();
        e.activity("meal", 102);
        assert!(e.disk.queue.is_empty());
        assert!(e.disk.install_id.is_empty());
        let reloaded: Disk = serde_json::from_slice(&std::fs::read(&e.path).unwrap()).unwrap();
        assert_eq!(reloaded.consent, Some(false));
        assert!(reloaded.queue.is_empty());
        std::fs::remove_file(e.path).unwrap();
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
    fn no_consent_or_missing_configuration_collects_nothing() {
        let mut e = engine();
        e.disk.consent = None;
        e.activity("meal", 100);
        assert!(e.disk.queue.is_empty());
        assert!(e.disk.install_id.is_empty());
        e.disk.consent = Some(true);
        e.token.clear();
        e.activity("meal", 101);
        assert!(e.disk.queue.is_empty());
        assert!(e.consent(true, 102).is_err());
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
        next.version = "5.2.0".into();
        next.started = false;
        next.start(102);
        assert_eq!(count(&next, "app_version_seen"), 1);
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
