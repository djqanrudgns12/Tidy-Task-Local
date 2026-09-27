//! 다른 도구가 학급 명단 창을 열면서 "무엇을 하러 왔는지"를 넘기는 통로.
//! (예: 개인 점수판의 [학급 명단 등록하러 가기] → 명단 창이 "첫 학급 만들기"에 초점)
//!
//! 왜 Rust가 잠시 보관하는가: 명단 창이 막 만들어지는 중이면 아직 알림을 들을 준비가 안 되어 있습니다.
//!   그래서 10초 동안 보관했다가 명단 창이 떠서 직접 꺼내 가게 합니다(트레이 대기 요청과 같은 방식).
//!   이미 열린 명단 창에는 `roster-intent` 알림으로 바로 보냅니다.
use serde::{Deserialize, Serialize};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

const TTL: Duration = Duration::from_secs(10);

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "action", rename_all = "kebab-case", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum Intent {
    CreateClass,
    AddStudents { class_id: String },
}

static PENDING: Mutex<Option<(Instant, Intent)>> = Mutex::new(None);

fn valid(intent: &Intent) -> bool {
    match intent {
        Intent::CreateClass => true,
        Intent::AddStudents { class_id } => !class_id.is_empty() && class_id.chars().count() <= 80,
    }
}

fn put(intent: Intent, now: Instant) {
    if let Ok(mut p) = PENDING.lock() {
        *p = Some((now, intent));
    }
}

fn take(now: Instant) -> Option<Intent> {
    let mut p = PENDING.lock().ok()?;
    match p.take() {
        Some((at, intent)) if now.duration_since(at) <= TTL => Some(intent),
        _ => None,
    }
}

#[tauri::command]
pub fn classroom_set_intent(app: tauri::AppHandle, intent: Intent) -> Result<(), String> {
    if !valid(&intent) {
        return Err("명단 창에 넘길 내용을 확인해 주세요.".into());
    }
    put(intent.clone(), Instant::now());
    // 이미 열린 명단 창은 알림으로 바로 받습니다. 창이 꺼내 가면 보관분은 비워집니다.
    if let Some(win) = app.get_webview_window("roster") {
        let _ = win.emit("roster-intent", ());
    }
    Ok(())
}

#[tauri::command]
pub fn classroom_take_intent(window: tauri::WebviewWindow) -> Option<Intent> {
    // 명단 창만 꺼내 갈 수 있습니다(다른 창이 가로채지 않게).
    if window.label() != "roster" {
        return None;
    }
    take(Instant::now())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intent_is_taken_once_and_expires() {
        let now = Instant::now();
        put(Intent::CreateClass, now);
        assert_eq!(take(now + Duration::from_secs(1)), Some(Intent::CreateClass));
        assert_eq!(take(now + Duration::from_secs(1)), None);
        put(Intent::AddStudents { class_id: "c1".into() }, now);
        assert_eq!(take(now + Duration::from_secs(11)), None);
    }

    #[test]
    fn intent_shape_is_checked() {
        let parsed: Intent = serde_json::from_value(serde_json::json!({"action":"add-students","classId":"c1"})).unwrap();
        assert_eq!(parsed, Intent::AddStudents { class_id: "c1".into() });
        assert!(serde_json::from_value::<Intent>(serde_json::json!({"action":"delete-all"})).is_err());
        assert!(!valid(&Intent::AddStudents { class_id: String::new() }));
    }
}
